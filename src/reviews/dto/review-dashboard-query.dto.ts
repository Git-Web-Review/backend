import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

/**
 * The dashboard returns three independently paginated lists in one response,
 * so each one carries its own page cursor while they share a page size.
 */
export class ReviewDashboardQueryDto {
  @ApiPropertyOptional({
    description: "Page of the reviews the caller created, 1-based.",
    minimum: 1,
    default: 1,
    example: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  ownedPage = 1;

  @ApiPropertyOptional({
    description:
      "Page of the reviews the caller was assigned to as a reviewer, 1-based.",
    minimum: 1,
    default: 1,
    example: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  assignedPage = 1;

  @ApiPropertyOptional({
    description: "Page of the reviews already closed, 1-based.",
    minimum: 1,
    default: 1,
    example: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  donePage = 1;

  @ApiPropertyOptional({
    description: "Number of reviews per page, applied to all three lists.",
    minimum: 1,
    maximum: 50,
    default: 10,
    example: 10,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit = 10;
}
