import {
  Controller,
  Get,
  Header,
  Param,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Response } from "express";
import { FirebaseAuthGuard } from "../auth/firebase-auth.guard";
import {
  ApiAuthErrorResponses,
  ApiNotFoundErrorResponse,
} from "../common/swagger/api-error-responses";
import { UsersService } from "./users.service";

/**
 * Profile images of *other* users, read-only. `v1/me` owns the current user's
 * own image (upload, read, delete); this route only serves the bytes, so any
 * signed-in user can render a reviewer's avatar next to their name.
 */
@ApiTags("users")
@ApiBearerAuth()
@ApiAuthErrorResponses()
@UseGuards(FirebaseAuthGuard)
@Controller("v1/users")
export class UserProfileImagesController {
  constructor(private readonly usersService: UsersService) {}

  @Get(":userId/profile-image")
  @ApiOperation({ summary: "Get a user profile image" })
  @ApiOkResponse({ description: "Profile image bytes returned" })
  @ApiNotFoundErrorResponse()
  @Header("Cache-Control", "private, max-age=300")
  async getProfileImage(
    @Param("userId") userId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const profileImage = await this.usersService.getProfileImage(userId);
    response.setHeader("Content-Type", profileImage.mimeType);
    response.setHeader("Content-Length", profileImage.sizeBytes.toString());

    return new StreamableFile(profileImage.data);
  }
}
