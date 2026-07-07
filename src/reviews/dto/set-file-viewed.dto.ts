import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsNotEmpty, IsString, MaxLength } from "class-validator";

export class SetFileViewedDto {
  @ApiProperty({
    description: "Path of the diff file inside the commit",
    example: "src/main.c",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  filePath!: string;

  @ApiProperty({ description: "True to mark the file as viewed" })
  @IsBoolean()
  viewed!: boolean;
}

export class FileViewedResponseDto {
  @ApiProperty()
  commitId!: string;

  @ApiProperty()
  filePath!: string;

  @ApiProperty()
  viewed!: boolean;
}
