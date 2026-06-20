import { applyDecorators } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { ApiErrorResponseDto } from "../dto/api-error-response.dto";

export function ApiAuthErrorResponses() {
  return applyDecorators(
    ApiUnauthorizedResponse({
      description: "Authentication failed",
      type: ApiErrorResponseDto,
    }),
  );
}

export function ApiAdminErrorResponses() {
  return applyDecorators(
    ApiAuthErrorResponses(),
    ApiForbiddenResponse({
      description: "Admin access required",
      type: ApiErrorResponseDto,
    }),
  );
}

export function ApiValidationErrorResponse() {
  return applyDecorators(
    ApiBadRequestResponse({
      description: "Request validation failed",
      type: ApiErrorResponseDto,
    }),
  );
}

export function ApiNotFoundErrorResponse() {
  return applyDecorators(
    ApiNotFoundResponse({
      description: "Resource not found",
      type: ApiErrorResponseDto,
    }),
  );
}
