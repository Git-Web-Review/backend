/**
 * Validation of uploaded images.
 *
 * A multipart upload's MIME type is declared by the client, not derived from the
 * file: `Content-Type: image/png` on an HTML document passed the allow-list, and
 * the bytes were then served back under that type. So the file's real signature
 * is what gets read here.
 *
 * SVG is no longer accepted: it is an active format that executes script. It was
 * allowed for the application logo, which `GET /v1/branding/logo` serves back.
 */

export type ImageFormat = {
  mimeType: string;
  extension: string;
};

type Signature = ImageFormat & {
  matches: (bytes: Buffer) => boolean;
};

const startsWith = (bytes: Buffer, prefix: number[]): boolean =>
  bytes.length >= prefix.length &&
  prefix.every((byte, index) => bytes[index] === byte);

const SIGNATURES: Signature[] = [
  {
    mimeType: "image/png",
    extension: "png",
    matches: (bytes) =>
      startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    mimeType: "image/jpeg",
    extension: "jpg",
    matches: (bytes) => startsWith(bytes, [0xff, 0xd8, 0xff]),
  },
  {
    mimeType: "image/gif",
    extension: "gif",
    matches: (bytes) =>
      startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
      startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
  },
  {
    // RIFF....WEBP: the RIFF container carries the size between the two markers.
    mimeType: "image/webp",
    extension: "webp",
    matches: (bytes) =>
      bytes.length >= 12 &&
      startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP",
  },
];

export const SUPPORTED_IMAGE_MIME_TYPES = SIGNATURES.map(
  (signature) => signature.mimeType,
);

/**
 * The file's real type, read from its leading bytes, or `null` when it is none
 * of the accepted formats.
 */
export function detectImageFormat(bytes: Buffer): ImageFormat | null {
  const signature = SIGNATURES.find((candidate) => candidate.matches(bytes));

  return signature
    ? { mimeType: signature.mimeType, extension: signature.extension }
    : null;
}

/**
 * Response headers for serving bytes a user uploaded.
 *
 * `nosniff` stops the browser getting creative about the type, the CSP
 * neutralises anything a misread image format could trigger, and
 * `Content-Disposition: inline` with no filename keeps a user-controlled name
 * out of the header.
 */
export function imageResponseHeaders(format: {
  mimeType: string;
}): Record<string, string> {
  return {
    "Content-Type": format.mimeType,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Disposition": "inline",
  };
}
