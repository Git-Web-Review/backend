import { ApiProperty } from "@nestjs/swagger";

/**
 * Shared shape of every "delete one resource" route: the identifier that was
 * targeted and whether it is gone. Declared once so a generated client gets a
 * single `DeletionResponse` type instead of one anonymous schema per endpoint.
 */
export class DeletionResponseDto {
  @ApiProperty({
    format: "uuid",
    description: "Identifier of the resource that was deleted.",
    example: "9ad1e3de-a9af-4e2f-8d3d-4d6f6c85439a",
  })
  id!: string;

  @ApiProperty({
    description: "Always `true`: the resource no longer exists.",
    example: true,
  })
  deleted!: boolean;
}
