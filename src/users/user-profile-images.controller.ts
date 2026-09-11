import { Get, Header, Res, StreamableFile } from "@nestjs/common";
import { Response } from "express";
import { ApiAuthenticatedController } from "../auth/api-controller.decorators";
import {
  ApiEndpoint,
  ApiTag,
  IMAGE_CONTENT,
  UuidParam,
} from "../common/swagger";
import { UsersService } from "./users.service";

/**
 * Profile images of *other* users, read-only. `v1/me` owns the current user's
 * own image (upload, read, delete); this route only serves the bytes, so any
 * signed-in user can render a reviewer's avatar next to their name.
 */
@ApiAuthenticatedController(ApiTag.Users, "v1/users")
export class UserProfileImagesController {
  constructor(private readonly usersService: UsersService) {}

  @Get(":userId/profile-image")
  @ApiEndpoint({
    summary: "Get a user profile image",
    response:
      "Raw image bytes, served with the stored `Content-Type`. Not JSON.",
    content: IMAGE_CONTENT,
    notFound: true,
  })
  @Header("Cache-Control", "private, max-age=300")
  async getProfileImage(
    @UuidParam("userId", "Identifier of the user whose avatar is requested")
    userId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const profileImage = await this.usersService.getProfileImage(userId);
    response.setHeader("Content-Type", profileImage.mimeType);
    response.setHeader("Content-Length", profileImage.sizeBytes.toString());

    return new StreamableFile(profileImage.data);
  }
}
