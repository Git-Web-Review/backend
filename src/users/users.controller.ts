import {
  Body,
  Delete,
  Get,
  Header,
  Patch,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { User } from "@prisma/client";
import { Response } from "express";
import { ApiAuthenticatedController } from "../auth/api-controller.decorators";
import { CurrentUser } from "../auth/current-user.decorator";
import {
  ApiEndpoint,
  ApiImageUpload,
  ApiTag,
  IMAGE_CONTENT,
} from "../common/swagger";
import { CurrentUserResponseDto } from "./dto/current-user-response.dto";
import { ReviewerCandidatePageResponseDto } from "./dto/reviewer-candidate-page-response.dto";
import { SearchReviewerCandidatesQueryDto } from "./dto/search-reviewer-candidates-query.dto";
import { UpdateUserSettingsDto } from "./dto/update-user-settings.dto";
import { UserProfileImageRemovalResponseDto } from "./dto/user-profile-image-removal-response.dto";
import { UserProfileImageResponseDto } from "./dto/user-profile-image-response.dto";
import { UserSettingsResponseDto } from "./dto/user-settings-response.dto";
import { profileImageMaxBytesFromValue } from "./profile-image.config";
import type { UploadedProfileImageFile } from "./types/uploaded-profile-image-file";
import { UsersService } from "./users.service";

@ApiAuthenticatedController(ApiTag.Users, "v1/me")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiEndpoint({
    summary: "Get current authenticated user",
    description:
      "Resolves whoever the bearer token belongs to, human or service account. Start here to learn the caller's `id` and `role`.",
    response: "Current user returned",
    type: CurrentUserResponseDto,
    notFound: true,
  })
  getMe(@CurrentUser() user: User): Promise<CurrentUserResponseDto> {
    return this.usersService.getMe(user.id);
  }

  @Get("reviewer-candidates")
  @ApiEndpoint({
    summary: "Search users that can be selected as reviewers",
    description:
      "Feeds the reviewer picker. The returned identifiers are what `reviewerUserIds` expects when creating or updating a review.",
    response: "Reviewer candidates returned",
    type: ReviewerCandidatePageResponseDto,
    validation: true,
  })
  listReviewerCandidates(
    @CurrentUser() user: User,
    @Query() query: SearchReviewerCandidatesQueryDto,
  ): Promise<ReviewerCandidatePageResponseDto> {
    return this.usersService.listReviewerCandidates(user.id, query);
  }

  @Patch("settings")
  @ApiEndpoint({
    summary: "Update current user settings",
    description:
      "Only the properties present in the body are changed; the rest keep their value.",
    response: "User settings updated",
    type: UserSettingsResponseDto,
    validation: true,
  })
  updateSettings(
    @CurrentUser() user: User,
    @Body() dto: UpdateUserSettingsDto,
  ): Promise<UserSettingsResponseDto> {
    return this.usersService.updateSettings(user.id, dto);
  }

  @Patch("profile-image")
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
    summary: "Upload current user profile image",
    description: "Replaces the current avatar.",
    response: "Profile image saved",
    type: UserProfileImageResponseDto,
    validation: true,
  })
  saveProfileImage(
    @CurrentUser() user: User,
    @UploadedFile() file?: UploadedProfileImageFile,
  ): Promise<UserProfileImageResponseDto> {
    return this.usersService.saveProfileImage(user.id, file);
  }

  @Get("profile-image")
  @ApiEndpoint({
    summary: "Get current user profile image",
    response:
      "Raw image bytes, served with the stored `Content-Type`. Not JSON.",
    content: IMAGE_CONTENT,
    notFound: true,
  })
  @Header("Cache-Control", "private, max-age=300")
  async getProfileImage(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const profileImage = await this.usersService.getProfileImage(user.id);
    response.setHeader("Content-Type", profileImage.mimeType);
    response.setHeader("Content-Length", profileImage.sizeBytes.toString());

    return new StreamableFile(profileImage.data);
  }

  @Delete("profile-image")
  @ApiEndpoint({
    summary: "Delete current user profile image",
    description:
      "Succeeds even when there was no image, so it is safe to call blindly.",
    response: "Profile image deleted",
    type: UserProfileImageRemovalResponseDto,
  })
  deleteProfileImage(
    @CurrentUser() user: User,
  ): Promise<UserProfileImageRemovalResponseDto> {
    return this.usersService.deleteProfileImage(user.id);
  }
}
