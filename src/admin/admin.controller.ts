import { Body, Delete, Get, Patch, Post } from "@nestjs/common";
import { User } from "@prisma/client";
import { ApiAdminController } from "../auth/api-controller.decorators";
import { CurrentUser } from "../auth/current-user.decorator";
import {
  ApiEndpoint,
  ApiTag,
  DocumentedParam,
  UuidParam,
} from "../common/swagger";
import { CurrentUserResponseDto } from "../users/dto/current-user-response.dto";
import { UpdateUserSettingsDto } from "../users/dto/update-user-settings.dto";
import { UserSettingsResponseDto } from "../users/dto/user-settings-response.dto";
import { AdminService } from "./admin.service";
import { AdminEmailDto } from "./dto/admin-email.dto";
import { AdminGrantResponseDto } from "./dto/admin-grant-response.dto";
import { AdminRemovalResponseDto } from "./dto/admin-removal-response.dto";
import { AdminTextNotificationDto } from "./dto/admin-text-notification.dto";
import { AdminTextNotificationResponseDto } from "./dto/admin-text-notification-response.dto";
import { UserDeletionPreviewResponseDto } from "./dto/user-deletion-preview-response.dto";
import { UserRemovalResponseDto } from "./dto/user-removal-response.dto";

@ApiAdminController(ApiTag.Admin, "v1/admin")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("admins")
  @ApiEndpoint({
    summary: "List admin grants",
    description:
      "Grants are keyed by email, so an address can be promoted before its owner has ever signed in.",
    response: "Admin grants returned",
    type: [AdminGrantResponseDto],
  })
  listAdmins(): Promise<AdminGrantResponseDto[]> {
    return this.adminService.listAdmins();
  }

  @Post("admins")
  @ApiEndpoint({
    summary: "Grant admin role to an email",
    description:
      "Idempotent: granting twice returns the existing grant. An existing user is promoted right away, otherwise the role applies on their first sign-in.",
    response: "Admin grant created or already present",
    type: AdminGrantResponseDto,
    created: true,
    validation: true,
  })
  addAdmin(@Body() dto: AdminEmailDto): Promise<AdminGrantResponseDto> {
    return this.adminService.addAdmin(dto.email);
  }

  @Delete("admins/:email")
  @ApiEndpoint({
    summary: "Remove admin role from an email",
    description: "The last remaining admin cannot be removed.",
    response: "Admin grant removed",
    type: AdminRemovalResponseDto,
    validation: true,
    notFound: true,
    forbidden:
      "Removing this grant would leave the instance with no admin (`LAST_ADMIN_REMOVAL_FORBIDDEN`).",
  })
  removeAdmin(
    @DocumentedParam("email", {
      description: "Email address the grant is keyed by.",
      example: "review-admin@company.tld",
      schema: { type: "string", format: "email" },
    })
    email: string,
  ): Promise<AdminRemovalResponseDto> {
    return this.adminService.removeAdmin(email);
  }

  @Get("users")
  @ApiEndpoint({
    summary: "List users",
    description:
      "Every user known to the instance, including the ones backing a service account.",
    response: "Users returned",
    type: [CurrentUserResponseDto],
  })
  listUsers(): Promise<CurrentUserResponseDto[]> {
    return this.adminService.listUsers();
  }

  @Patch("users/:id/settings")
  @ApiEndpoint({
    summary: "Update a user's settings",
    description:
      "Same body as `PATCH /v1/me/settings`, applied to someone else.",
    response: "User settings updated",
    type: UserSettingsResponseDto,
    validation: true,
    notFound: true,
  })
  updateUserSettings(
    @UuidParam("id", "Identifier of the user to update") id: string,
    @Body() dto: UpdateUserSettingsDto,
  ): Promise<UserSettingsResponseDto> {
    return this.adminService.updateUserSettings(id, dto);
  }

  @Get("users/:id/deletion-preview")
  @ApiEndpoint({
    summary: "Preview what deleting a user would destroy",
    description:
      "Reviews owned by the user are deleted with it, which also removes the comments other people left on them. Call this before `DELETE /v1/admin/users/{id}`.",
    response: "Deletion preview returned",
    type: UserDeletionPreviewResponseDto,
    notFound: true,
  })
  previewUserDeletion(
    @CurrentUser() user: User,
    @UuidParam("id", "Identifier of the user that would be deleted") id: string,
  ): Promise<UserDeletionPreviewResponseDto> {
    return this.adminService.previewUserDeletion(user, id);
  }

  @Delete("users/:id")
  @ApiEndpoint({
    summary: "Delete a user and everything attached to it",
    description:
      "Only users without a Firebase identity can be deleted. This cascades to the reviews they own, including other people's comments on those reviews.",
    response: "User deleted",
    type: UserRemovalResponseDto,
    notFound: true,
    forbidden:
      "The user has a Firebase identity, is the caller themselves, or is the last remaining admin (`FIREBASE_USER_DELETION_FORBIDDEN`, `SELF_DELETION_FORBIDDEN`, `LAST_ADMIN_REMOVAL_FORBIDDEN`).",
  })
  deleteUser(
    @CurrentUser() user: User,
    @UuidParam("id", "Identifier of the user to delete") id: string,
  ): Promise<UserRemovalResponseDto> {
    return this.adminService.deleteUser(user, id);
  }

  @Post("notifications/text")
  @ApiEndpoint({
    summary: "Send a text notification to all users",
    description:
      "Broadcasts a free-form message to every user's inbox. `count` reports how many were reached.",
    response: "Text notification sent to all users",
    type: AdminTextNotificationResponseDto,
    created: true,
    validation: true,
  })
  sendTextNotification(
    @CurrentUser() user: User,
    @Body() dto: AdminTextNotificationDto,
  ): Promise<AdminTextNotificationResponseDto> {
    return this.adminService.sendTextNotification(user, dto);
  }
}
