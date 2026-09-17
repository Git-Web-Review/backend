import { HttpStatus, Injectable } from "@nestjs/common";
import { ReviewFieldType, type User } from "@prisma/client";
import { AppException } from "../common/app.exception";
import { ErrorCode } from "../common/error-code.enum";
import { PrismaService } from "../prisma/prisma.service";
import { CreateReviewDto } from "./dto/create-review.dto";
import { ReviewResponseDto } from "./dto/review-response.dto";
import { SetReviewFieldValueDto } from "./dto/set-review-field-value.dto";
import { assertIsOwner } from "./review-access";
import { findReviewOrThrow } from "./review-queries";
import { ReviewResponsesService } from "./review-responses.service";

/** Values of the admin-defined review fields. */
@Injectable()
export class ReviewFieldValuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly responses: ReviewResponsesService,
  ) {}

  async setFieldValue(
    user: User,
    reviewId: string,
    fieldId: string,
    dto: SetReviewFieldValueDto,
  ): Promise<ReviewResponseDto> {
    const review = await findReviewOrThrow(this.prisma, reviewId);
    assertIsOwner(user, review);

    const field = await this.prisma.reviewFieldDefinition.findUnique({
      where: { id: fieldId },
    });
    if (!field) {
      throw fieldNotFound();
    }

    const value = dto.value?.trim() ?? "";
    if (!value) {
      await this.prisma.reviewFieldValue.deleteMany({
        where: { reviewId, fieldId },
      });
    } else {
      assertValidFieldValue(field.type, value);
      await this.prisma.reviewFieldValue.upsert({
        where: { reviewId_fieldId: { reviewId, fieldId } },
        create: { reviewId, fieldId, value },
        update: { value },
      });
    }

    return this.responses.toResponse(
      await findReviewOrThrow(this.prisma, reviewId),
    );
  }

  async validatedFieldValueCreates(
    fieldValues: CreateReviewDto["fieldValues"],
  ): Promise<{ fieldId: string; value: string }[]> {
    const creates = (fieldValues ?? [])
      .map((fieldValue) => ({
        fieldId: fieldValue.fieldId,
        value: fieldValue.value.trim(),
      }))
      .filter((fieldValue) => fieldValue.value);
    if (!creates.length) {
      return [];
    }

    const fields = await this.prisma.reviewFieldDefinition.findMany({
      where: { id: { in: creates.map((fieldValue) => fieldValue.fieldId) } },
    });
    for (const create of creates) {
      const field = fields.find(
        (currentField) => currentField.id === create.fieldId,
      );
      if (!field) {
        throw fieldNotFound();
      }
      assertValidFieldValue(field.type, create.value);
    }

    return creates;
  }
}

function fieldNotFound(): AppException {
  return new AppException(
    ErrorCode.UNKNOWN_ERROR,
    HttpStatus.NOT_FOUND,
    "Review field not found",
  );
}

function assertValidFieldValue(type: ReviewFieldType, value: string): void {
  if (type === ReviewFieldType.NUMBER) {
    if (!/^-?\d+(?:[.,]\d+)?$/.test(value)) {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.BAD_REQUEST,
        "Field value must be a number",
      );
    }
    return;
  }

  if (type === ReviewFieldType.LINK || type === ReviewFieldType.IMAGE) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.BAD_REQUEST,
        "Field value must be a valid URL",
      );
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.BAD_REQUEST,
        "Field value must be an http(s) URL",
      );
    }
  }
}
