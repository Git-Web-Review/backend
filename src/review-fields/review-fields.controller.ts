import { Body, Delete, Get, Patch, Post } from "@nestjs/common";
import {
  ApiAdminOnly,
  ApiAuthenticatedController,
} from "../auth/api-controller.decorators";
import { DeletionResponseDto } from "../common/dto/deletion-response.dto";
import { ApiEndpoint, ApiTag, UuidParam } from "../common/swagger";
import { CreateReviewFieldDto } from "./dto/create-review-field.dto";
import { ReviewFieldResponseDto } from "./dto/review-field-response.dto";
import { UpdateReviewFieldDto } from "./dto/update-review-field.dto";
import { ReviewFieldsService } from "./review-fields.service";

/** Every signed-in user reads the definitions; only admins change them. */
@ApiAuthenticatedController(ApiTag.ReviewFields, "v1/review-fields")
export class ReviewFieldsController {
  constructor(private readonly reviewFieldsService: ReviewFieldsService) {}

  @Get()
  @ApiEndpoint({
    summary: "List review field definitions",
    description:
      "The custom fields a review can carry. Use the returned identifiers as `fieldId` when creating a review or setting a value.",
    response: "Review field definitions returned",
    type: [ReviewFieldResponseDto],
  })
  list(): Promise<ReviewFieldResponseDto[]> {
    return this.reviewFieldsService.list();
  }

  @Post()
  @ApiAdminOnly()
  @ApiEndpoint({
    summary: "Create a review field definition",
    response: "Review field definition created",
    type: ReviewFieldResponseDto,
    created: true,
    validation: true,
  })
  create(@Body() dto: CreateReviewFieldDto): Promise<ReviewFieldResponseDto> {
    return this.reviewFieldsService.create(dto);
  }

  @Patch(":id")
  @ApiAdminOnly()
  @ApiEndpoint({
    summary: "Update a review field definition",
    response: "Review field definition updated",
    type: ReviewFieldResponseDto,
    validation: true,
    notFound: true,
  })
  update(
    @UuidParam("id", "Review field definition identifier") id: string,
    @Body() dto: UpdateReviewFieldDto,
  ): Promise<ReviewFieldResponseDto> {
    return this.reviewFieldsService.update(id, dto);
  }

  @Delete(":id")
  @ApiAdminOnly()
  @ApiEndpoint({
    summary: "Delete a review field definition",
    description: "Values already recorded on existing reviews go with it.",
    response: "Review field definition deleted",
    type: DeletionResponseDto,
    notFound: true,
  })
  delete(
    @UuidParam("id", "Review field definition identifier") id: string,
  ): Promise<DeletionResponseDto> {
    return this.reviewFieldsService.delete(id);
  }
}
