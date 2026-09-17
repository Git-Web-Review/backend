import { HttpStatus } from "@nestjs/common";
import { AppException } from "../common/app.exception";
import { ErrorCode } from "../common/error-code.enum";

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function normalizeEmail(email?: string | null): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}

/** Undefined leaves the value alone; blank clears it. */
export function nullIfBlank(value?: string | null): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function requiredText(value: string | undefined, message: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new AppException(
      ErrorCode.UNKNOWN_ERROR,
      HttpStatus.BAD_REQUEST,
      message,
    );
  }

  return trimmed;
}
