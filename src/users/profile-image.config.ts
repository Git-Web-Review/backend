export const DEFAULT_PROFILE_IMAGE_MAX_BYTES = 1024 * 1024;

export function profileImageMaxBytesFromValue(value?: string | null): number {
  const parsedValue = Number(value);

  return Number.isInteger(parsedValue) && parsedValue > 0
    ? parsedValue
    : DEFAULT_PROFILE_IMAGE_MAX_BYTES;
}
