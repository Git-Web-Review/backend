import {
  Body,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiEndpoint, ApiTag, UuidParam } from "../common/swagger";
import { ApiAdminController } from "./api-controller.decorators";
import { CreateServiceAccountDto } from "./dto/create-service-account.dto";
import {
  ServiceAccountRemovalResponseDto,
  ServiceAccountResponseDto,
  ServiceAccountSecretResponseDto,
} from "./dto/service-account-response.dto";
import { UpdateServiceAccountDto } from "./dto/update-service-account.dto";
import {
  ServiceAccountsService,
  type ServiceAccountWithUser,
} from "./service-accounts.service";

/**
 * Where an admin provisions the credentials an agent authenticates with. The
 * plaintext secret only ever exists in the response that mints it.
 */
@ApiAdminController(ApiTag.Admin, "v1/admin/service-accounts")
export class ServiceAccountsController {
  constructor(private readonly serviceAccounts: ServiceAccountsService) {}

  @Get()
  @ApiEndpoint({
    summary: "List service accounts",
    description: "Secrets are never included; only their metadata is.",
    response: "Service accounts returned",
    type: [ServiceAccountResponseDto],
  })
  async list(): Promise<ServiceAccountResponseDto[]> {
    const accounts = await this.serviceAccounts.list();
    return accounts.map((account) => this.toResponse(account));
  }

  @Post()
  @ApiEndpoint({
    summary: "Create a service account",
    description:
      "Returns the plaintext client secret once. It is stored hashed and cannot be read again, so capture it from this response.",
    response: "Service account created",
    type: ServiceAccountSecretResponseDto,
    created: true,
    validation: true,
  })
  async create(
    @Body() dto: CreateServiceAccountDto,
  ): Promise<ServiceAccountSecretResponseDto> {
    const { account, clientSecret } = await this.serviceAccounts.create(dto);
    return { ...this.toResponse(account), clientSecret };
  }

  @Patch(":id")
  @ApiEndpoint({
    summary: "Update or deactivate a service account",
    description:
      "Setting `active` to false rejects the credentials immediately, including tokens already issued.",
    response: "Service account updated",
    type: ServiceAccountResponseDto,
    validation: true,
    notFound: true,
  })
  async update(
    @UuidParam("id", "Service account identifier") id: string,
    @Body() dto: UpdateServiceAccountDto,
  ): Promise<ServiceAccountResponseDto> {
    return this.toResponse(await this.serviceAccounts.update(id, dto));
  }

  @Post(":id/rotate-secret")
  @HttpCode(HttpStatus.OK)
  @ApiEndpoint({
    summary: "Rotate the client secret",
    description:
      "Invalidates the previous secret immediately. Tokens already issued stay valid until they expire.",
    response: "Secret rotated",
    type: ServiceAccountSecretResponseDto,
    notFound: true,
  })
  async rotateSecret(
    @UuidParam("id", "Service account identifier") id: string,
  ): Promise<ServiceAccountSecretResponseDto> {
    const { account, clientSecret } =
      await this.serviceAccounts.rotateSecret(id);
    return { ...this.toResponse(account), clientSecret };
  }

  @Delete(":id")
  @ApiEndpoint({
    summary: "Delete a service account",
    description:
      "Revokes the credentials for good. The user the agent acted as is kept so its reviews and comments stay attributed.",
    response: "Service account deleted",
    type: ServiceAccountRemovalResponseDto,
    notFound: true,
  })
  remove(
    @UuidParam("id", "Service account identifier") id: string,
  ): Promise<ServiceAccountRemovalResponseDto> {
    return this.serviceAccounts.remove(id);
  }

  private toResponse(
    account: ServiceAccountWithUser,
  ): ServiceAccountResponseDto {
    return {
      id: account.id,
      clientId: account.clientId,
      name: account.name,
      description: account.description,
      active: account.active,
      lastUsedAt: account.lastUsedAt,
      userId: account.userId,
      email: account.user.email,
      role: account.user.role,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }
}
