import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ThrottleAuth } from "../common/throttling/throttling.module";
import {
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { ApiErrorResponseDto } from "../common/dto/api-error-response.dto";
import { ApiEndpoint, ApiTag } from "../common/swagger";
import { AccessTokenResponseDto } from "./dto/access-token-response.dto";
import { ServiceAccountTokenDto } from "./dto/service-account-token.dto";
import { ServiceAccountsService } from "./service-accounts.service";

/** The only authenticated-adjacent controller that is itself public. */
@ApiTags(ApiTag.Auth)
@Controller("v1/auth")
export class AuthController {
  constructor(private readonly serviceAccounts: ServiceAccountsService) {}

  @Post("token")
  @HttpCode(HttpStatus.OK)
  @ThrottleAuth()
  @ApiEndpoint({
    summary: "Exchange service account credentials for an internal token",
    description: [
      "Internal alternative to Firebase sign-in, meant for agents and CI.",
      "Send the returned token as `Authorization: Bearer <token>` on any API route;",
      "it grants exactly what the service account's user is allowed to do.",
      "Re-request a token once `expiresAt` has passed rather than refreshing it.",
    ].join(" "),
    response: "Token issued",
    type: AccessTokenResponseDto,
    validation: true,
  })
  @ApiUnauthorizedResponse({
    description:
      "Unknown client, wrong secret, or a deactivated service account (`INVALID_CREDENTIALS`, `SERVICE_ACCOUNT_DISABLED`).",
    type: ApiErrorResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description:
      "This instance has no internal token signing key configured (`INTERNAL_AUTH_DISABLED`).",
    type: ApiErrorResponseDto,
  })
  async issueToken(
    @Body() dto: ServiceAccountTokenDto,
  ): Promise<AccessTokenResponseDto> {
    const { token, account } = await this.serviceAccounts.issueToken(
      dto.clientId,
      dto.clientSecret,
    );

    return {
      accessToken: token.accessToken,
      tokenType: "Bearer",
      expiresIn: token.expiresIn,
      expiresAt: token.expiresAt,
      clientId: account.clientId,
      userId: account.userId,
      email: account.user.email,
    };
  }
}
