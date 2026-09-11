import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AppLogoResponseDto } from "./app-logo-response.dto";

/**
 * Branding read by every signed-in user to render the top bar, unlike the
 * admin-only global settings. `appName` is null when no custom name is set,
 * and the client falls back to the built-in product name.
 */
export class BrandingResponseDto {
  @ApiProperty({ type: String, nullable: true, example: "Acme" })
  appName!: string | null;

  @ApiPropertyOptional({ type: AppLogoResponseDto, nullable: true })
  logo!: AppLogoResponseDto | null;
}
