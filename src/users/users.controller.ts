import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Patch,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBody,
  ApiBearerAuth,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { User } from "@prisma/client";
import { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator";
import { FirebaseAuthGuard } from "../auth/firebase-auth.guard";
import {
  ApiAuthErrorResponses,
  ApiNotFoundErrorResponse,
  ApiValidationErrorResponse,
} from "../common/swagger/api-error-responses";
import { CurrentUserResponseDto } from "./dto/current-user-response.dto";
import { ReviewerCandidatePageResponseDto } from "./dto/reviewer-candidate-page-response.dto";
import { SearchReviewerCandidatesQueryDto } from "./dto/search-reviewer-candidates-query.dto";
import { UploadProfileImageDto } from "./dto/upload-profile-image.dto";
import { UpdateUserSettingsDto } from "./dto/update-user-settings.dto";
import { UserProfileImageRemovalResponseDto } from "./dto/user-profile-image-removal-response.dto";
import { UserProfileImageResponseDto } from "./dto/user-profile-image-response.dto";
import { UserSettingsResponseDto } from "./dto/user-settings-response.dto";
import { profileImageMaxBytesFromValue } from "./profile-image.config";
import type { UploadedProfileImageFile } from "./types/uploaded-profile-image-file";
import { UsersService } from "./users.service";

@ApiTags("users")
@ApiBearerAuth()
@ApiAuthErrorResponses()
@UseGuards(FirebaseAuthGuard)
@Controller("v1/me")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: "Get current authenticated user" })
  @ApiOkResponse({
    description: "Current user returned",
    type: CurrentUserResponseDto,
  })
  @ApiNotFoundErrorResponse()
  getMe(@CurrentUser() user: User): Promise<CurrentUserResponseDto> {
    return this.usersService.getMe(user.id);
  }

  @Get("reviewer-candidates")
  @ApiOperation({ summary: "Search users that can be selected as reviewers" })
  @ApiOkResponse({
    description: "Reviewer candidates returned",
    type: ReviewerCandidatePageResponseDto,
  })
  listReviewerCandidates(
    @CurrentUser() user: User,
    @Query() query: SearchReviewerCandidatesQueryDto,
  ): Promise<ReviewerCandidatePageResponseDto> {
    return this.usersService.listReviewerCandidates(user.id, query);
  }

  @Patch("settings")
  @ApiOperation({ summary: "Update current user settings" })
  @ApiOkResponse({
    description: "User settings updated",
    type: UserSettingsResponseDto,
  })
  @ApiValidationErrorResponse()
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
  @ApiOperation({ summary: "Upload current user profile image" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({ type: UploadProfileImageDto })
  @ApiOkResponse({
    description: "Profile image saved",
    type: UserProfileImageResponseDto,
  })
  @ApiValidationErrorResponse()
  saveProfileImage(
    @CurrentUser() user: User,
    @UploadedFile() file?: UploadedProfileImageFile,
  ): Promise<UserProfileImageResponseDto> {
    return this.usersService.saveProfileImage(user.id, file);
  }

  @Get("profile-image")
  @ApiOperation({ summary: "Get current user profile image" })
  @ApiOkResponse({ description: "Profile image bytes returned" })
  @ApiNotFoundErrorResponse()
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
  @ApiOperation({ summary: "Delete current user profile image" })
  @ApiOkResponse({
    description: "Profile image deleted",
    type: UserProfileImageRemovalResponseDto,
  })
  deleteProfileImage(
    @CurrentUser() user: User,
  ): Promise<UserProfileImageRemovalResponseDto> {
    return this.usersService.deleteProfileImage(user.id);
  }
}
