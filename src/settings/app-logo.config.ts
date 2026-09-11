export const DEFAULT_APP_LOGO_MAX_BYTES = 1024 * 1024;

export function appLogoMaxBytesFromValue(value?: string | null): number {
  const parsedValue = Number(value);

  return Number.isInteger(parsedValue) && parsedValue > 0
    ? parsedValue
    : DEFAULT_APP_LOGO_MAX_BYTES;
}
