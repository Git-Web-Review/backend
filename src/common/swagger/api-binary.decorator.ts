import { applyDecorators } from "@nestjs/common";
import { ApiBody, ApiConsumes } from "@nestjs/swagger";
import type { ApiResponseCommonMetadata } from "@nestjs/swagger";
import { FileUploadDto } from "../dto/file-upload.dto";
import { ApiPayloadTooLargeErrorResponse } from "./api-error-responses";

/** Image types the upload routes accept, in the order they are advertised. */
export const ACCEPTED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
] as const;

/**
 * Success body of the routes that stream image bytes instead of JSON. Pass it
 * as `ApiEndpoint({ content: IMAGE_CONTENT })`: without it the spec advertises
 * an empty `200` and a generated client tries to parse the bytes as JSON.
 */
export type ResponseContent = NonNullable<ApiResponseCommonMetadata["content"]>;

export const IMAGE_CONTENT: ResponseContent = Object.fromEntries(
  ACCEPTED_IMAGE_MIME_TYPES.map((mimeType) => [
    mimeType,
    { schema: { type: "string", format: "binary" } },
  ]),
);

/**
 * Routes that take a single image through `multipart/form-data`. The size cap
 * is per-instance (`PROFILE_IMAGE_MAX_BYTES`, `APP_LOGO_MAX_BYTES`), so it is
 * described rather than pinned to a number here.
 */
export function ApiImageUpload() {
  return applyDecorators(
    ApiConsumes("multipart/form-data"),
    ApiBody({ type: FileUploadDto }),
    ApiPayloadTooLargeErrorResponse(),
  );
}
