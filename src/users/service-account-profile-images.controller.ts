import {
  Delete,
  Patch,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiAdminController } from "../auth/api-controller.decorators";
import { ServiceAccountsService } from "../auth/service-accounts.service";
import {
  ApiEndpoint,
  ApiImageUpload,
  ApiTag,
  UuidParam,
} from "../common/swagger";
import { UserProfileImageRemovalResponseDto } from "./dto/user-profile-image-removal-response.dto";
import { UserProfileImageResponseDto } from "./dto/user-profile-image-response.dto";
import { profileImageMaxBytesFromValue } from "./profile-image.config";
import type { UploadedProfileImageFile } from "./types/uploaded-profile-image-file";
import { UsersService } from "./users.service";

/**
 * A service account never signs in to the web UI, so an admin sets its avatar
 * on its behalf. Stored like any user's image; served by `v1/users`.
 */
@ApiAdminController(ApiTag.Admin, "v1/admin/service-accounts")
export class ServiceAccountProfileImagesController {
  constructor(
    private readonly serviceAccounts: ServiceAccountsService,
    private readonly usersService: UsersService,
  ) {}

  @Patch(":id/profile-image")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: profileImageMaxBytesFromValue(
          process.env.PROFILE_IMAGE_MAX_BYTES,
        ),
      },
    }),
  )
  @ApiImageUpload()
  @ApiEndpoint({
    summary: "Upload a service account profile image",
    description: "Replaces the avatar of the user the agent acts as.",
    response: "Profile image saved",
    type: UserProfileImageResponseDto,
    validation: true,
    notFound: true,
  })
  async saveProfileImage(
    @UuidParam("id", "Service account identifier") id: string,
    @UploadedFile() file?: UploadedProfileImageFile,
  ): Promise<UserProfileImageResponseDto> {
    const account = await this.serviceAccounts.findOrThrow(id);
    return this.usersService.saveProfileImage(account.userId, file);
  }

  @Delete(":id/profile-image")
  @ApiEndpoint({
    summary: "Delete a service account profile image",
    description:
      "Succeeds even when there was no image, so it is safe to call blindly.",
    response: "Profile image deleted",
    type: UserProfileImageRemovalResponseDto,
    notFound: true,
  })
  async deleteProfileImage(
    @UuidParam("id", "Service account identifier") id: string,
  ): Promise<UserProfileImageRemovalResponseDto> {
    const account = await this.serviceAccounts.findOrThrow(id);
    return this.usersService.deleteProfileImage(account.userId);
  }
}
