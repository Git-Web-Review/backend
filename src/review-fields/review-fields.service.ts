import { HttpStatus, Injectable } from "@nestjs/common";
import type { ReviewFieldDefinition } from "@prisma/client";
import { AppException } from "../common/app.exception";
import { ErrorCode } from "../common/error-code.enum";
import { PrismaService } from "../prisma/prisma.service";
import { CreateReviewFieldDto } from "./dto/create-review-field.dto";
import { UpdateReviewFieldDto } from "./dto/update-review-field.dto";

@Injectable()
export class ReviewFieldsService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<ReviewFieldDefinition[]> {
    return this.prisma.reviewFieldDefinition.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  create(dto: CreateReviewFieldDto): Promise<ReviewFieldDefinition> {
    return this.prisma.reviewFieldDefinition.create({
      data: {
        name: this.requiredName(dto.name),
        type: dto.type,
      },
    });
  }

  async update(
    id: string,
    dto: UpdateReviewFieldDto,
  ): Promise<ReviewFieldDefinition> {
    await this.findOrThrow(id);

    const data: Partial<ReviewFieldDefinition> = {};
    if (dto.name !== undefined) {
      data.name = this.requiredName(dto.name);
    }
    if (dto.type !== undefined) {
      data.type = dto.type;
    }

    return this.prisma.reviewFieldDefinition.update({ where: { id }, data });
  }

  async delete(id: string): Promise<{ id: string; deleted: boolean }> {
    await this.findOrThrow(id);
    await this.prisma.reviewFieldDefinition.delete({ where: { id } });
    return { id, deleted: true };
  }

  private async findOrThrow(id: string): Promise<ReviewFieldDefinition> {
    const field = await this.prisma.reviewFieldDefinition.findUnique({
      where: { id },
    });
    if (!field) {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.NOT_FOUND,
        "Review field not found",
      );
    }

    return field;
  }

  private requiredName(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.BAD_REQUEST,
        "Field name is required",
      );
    }

    return trimmed;
  }
}
