import { ApiProperty } from "@nestjs/swagger";

/**
 * Body of every `multipart/form-data` upload route. One shared type keeps the
 * form field name (`file`) identical across uploads and gives generated
 * clients a single multipart shape to implement.
 */
export class FileUploadDto {
  @ApiProperty({
    type: "string",
    format: "binary",
    description: "The file to upload, sent under the `file` form field.",
  })
  file!: unknown;
}
