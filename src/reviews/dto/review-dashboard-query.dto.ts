import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export class ReviewDashboardQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  ownedPage = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  assignedPage = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  donePage = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit = 10;
}
