import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { User } from "@prisma/client";
import { AdminGuard } from "../auth/admin.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { FirebaseAuthGuard } from "../auth/firebase-auth.guard";
import {
  ApiAdminErrorResponses,
  ApiValidationErrorResponse,
} from "../common/swagger/api-error-responses";
import { CurrentUserResponseDto } from "../users/dto/current-user-response.dto";
import { UpdateUserSettingsDto } from "../users/dto/update-user-settings.dto";
import { UserSettingsResponseDto } from "../users/dto/user-settings-response.dto";
import { AdminService } from "./admin.service";
import { AdminEmailDto } from "./dto/admin-email.dto";
import { AdminGrantResponseDto } from "./dto/admin-grant-response.dto";
import { AdminRemovalResponseDto } from "./dto/admin-removal-response.dto";
import { AdminTextNotificationDto } from "./dto/admin-text-notification.dto";
import { AdminTextNotificationResponseDto } from "./dto/admin-text-notification-response.dto";

@ApiTags("admin")
@ApiBearerAuth()
@ApiAdminErrorResponses()
@UseGuards(FirebaseAuthGuard, AdminGuard)
@Controller("v1/admin")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("admins")
  @ApiOperation({ summary: "List admin grants" })
  @ApiOkResponse({
    description: "Admin grants returned",
    type: [AdminGrantResponseDto],
  })
  listAdmins(): Promise<AdminGrantResponseDto[]> {
    return this.adminService.listAdmins();
  }

  @Post("admins")
  @ApiOperation({ summary: "Grant admin role to an email" })
  @ApiCreatedResponse({
    description: "Admin grant created or already present",
    type: AdminGrantResponseDto,
  })
  @ApiValidationErrorResponse()
  addAdmin(@Body() dto: AdminEmailDto): Promise<AdminGrantResponseDto> {
    return this.adminService.addAdmin(dto.email);
  }

  @Delete("admins/:email")
  @ApiOperation({ summary: "Remove admin role from an email" })
  @ApiOkResponse({
    description: "Admin grant removed",
    type: AdminRemovalResponseDto,
  })
  @ApiValidationErrorResponse()
  removeAdmin(@Param("email") email: string): Promise<AdminRemovalResponseDto> {
    return this.adminService.removeAdmin(email);
  }

  @Get("users")
  @ApiOperation({ summary: "List users" })
  @ApiOkResponse({
    description: "Users returned",
    type: [CurrentUserResponseDto],
  })
  listUsers(): Promise<CurrentUserResponseDto[]> {
    return this.adminService.listUsers();
  }

  @Patch("users/:id/settings")
  @ApiOperation({ summary: "Update a user's settings" })
  @ApiOkResponse({
    description: "User settings updated",
    type: UserSettingsResponseDto,
  })
  @ApiValidationErrorResponse()
  updateUserSettings(
    @Param("id") id: string,
    @Body() dto: UpdateUserSettingsDto,
  ): Promise<UserSettingsResponseDto> {
    return this.adminService.updateUserSettings(id, dto);
  }

  @Post("notifications/text")
  @ApiOperation({ summary: "Send a text notification to all users" })
  @ApiCreatedResponse({
    description: "Text notification sent to all users",
    type: AdminTextNotificationResponseDto,
  })
  @ApiValidationErrorResponse()
  sendTextNotification(
    @CurrentUser() user: User,
    @Body() dto: AdminTextNotificationDto,
  ): Promise<AdminTextNotificationResponseDto> {
    return this.adminService.sendTextNotification(user, dto);
  }
}
