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
import { AdminGuard } from "../auth/admin.guard";
import { FirebaseAuthGuard } from "../auth/firebase-auth.guard";
import {
  ApiAdminErrorResponses,
  ApiAuthErrorResponses,
  ApiValidationErrorResponse,
} from "../common/swagger/api-error-responses";
import { CreateReviewFieldDto } from "./dto/create-review-field.dto";
import { ReviewFieldResponseDto } from "./dto/review-field-response.dto";
import { UpdateReviewFieldDto } from "./dto/update-review-field.dto";
import { ReviewFieldsService } from "./review-fields.service";

@ApiTags("review-fields")
@ApiBearerAuth()
@ApiAuthErrorResponses()
@UseGuards(FirebaseAuthGuard)
@Controller("v1/review-fields")
export class ReviewFieldsController {
  constructor(private readonly reviewFieldsService: ReviewFieldsService) {}

  @Get()
  @ApiOperation({ summary: "List review field definitions" })
  @ApiOkResponse({
    description: "Review field definitions returned",
    type: [ReviewFieldResponseDto],
  })
  list(): Promise<ReviewFieldResponseDto[]> {
    return this.reviewFieldsService.list();
  }

  @Post()
  @UseGuards(AdminGuard)
  @ApiAdminErrorResponses()
  @ApiOperation({ summary: "Create a review field definition" })
  @ApiCreatedResponse({
    description: "Review field definition created",
    type: ReviewFieldResponseDto,
  })
  @ApiValidationErrorResponse()
  create(@Body() dto: CreateReviewFieldDto): Promise<ReviewFieldResponseDto> {
    return this.reviewFieldsService.create(dto);
  }

  @Patch(":id")
  @UseGuards(AdminGuard)
  @ApiAdminErrorResponses()
  @ApiOperation({ summary: "Update a review field definition" })
  @ApiOkResponse({
    description: "Review field definition updated",
    type: ReviewFieldResponseDto,
  })
  @ApiValidationErrorResponse()
  update(
    @Param("id") id: string,
    @Body() dto: UpdateReviewFieldDto,
  ): Promise<ReviewFieldResponseDto> {
    return this.reviewFieldsService.update(id, dto);
  }

  @Delete(":id")
  @UseGuards(AdminGuard)
  @ApiAdminErrorResponses()
  @ApiOperation({ summary: "Delete a review field definition" })
  @ApiOkResponse({ description: "Review field definition deleted" })
  delete(@Param("id") id: string): Promise<{ id: string; deleted: boolean }> {
    return this.reviewFieldsService.delete(id);
  }
}
