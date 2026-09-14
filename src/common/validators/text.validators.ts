import { applyDecorators } from "@nestjs/common";
import { Transform } from "class-transformer";
import { Matches } from "class-validator";

/**
 * Text validation for fields that leave the application through a line-based
 * protocol.
 *
 * The authoritative gate is in the IRC relay, which sanitises right before the
 * socket: only it also sees rows already in the database and text that came from
 * git. What lives here does something else — say no immediately, with a clear
 * message, rather than accept data that delivery will silently cut down.
 */

/** C0 and DEL, carriage return and line feed included. */
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;

/**
 * The same, but tab (U+0009) and line feed (U+000A) are allowed.
 * Carriage return (U+000D) stays forbidden: it is what ends a line of the IRC
 * protocol. Windows line endings are folded to LF before validation, so a client
 * sending legitimate CRLF is not refused.
 */
const CONTROL_CHARACTERS_EXCEPT_NEWLINES = /[\u0000-\u0008\u000B-\u001F\u007F]/;

/**
 * An RFC 2812 nickname or a channel name. Must stay in agreement with the
 * relay's `isValidIrcTarget`: what the backend accepts here and what the relay
 * accepts there have to describe the same set, or the silent drop comes back.
 */
const IRC_TARGET =
  /^(?:[A-Za-z[\]\\`_^{|}][A-Za-z0-9[\]\\`_^{|}-]{0,63}|[#&][^\u0000\u0007\r\n ,:]{1,63})$/;

/** Single-line text: no line breaks, no control characters. */
export function IsSingleLine(): PropertyDecorator {
  return applyDecorators(
    Matches(new RegExp(`^(?!.*${CONTROL_CHARACTERS.source}).*$`, "s"), {
      message: "$property must not contain line breaks or control characters",
    }),
  );
}

/**
 * Free-form multi-line text: line breaks stay, everything else goes.
 * CRLF and lone CR are folded to LF first, so a comment written on Windows or
 * posted by an agent goes through instead of being refused.
 */
export function IsPlainText(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }) =>
      typeof value === "string" ? value.replace(/\r\n?/g, "\n") : value,
    ),
    Matches(
      new RegExp(`^(?!.*${CONTROL_CHARACTERS_EXCEPT_NEWLINES.source}).*$`, "s"),
      {
        message: "$property must not contain control characters",
      },
    ),
  );
}

/** An IRC nickname or channel usable as a PRIVMSG target. */
export function IsIrcTarget(): PropertyDecorator {
  return applyDecorators(
    Matches(IRC_TARGET, {
      message:
        "$property must be a valid IRC nickname or channel: letters, digits, -[]\\`_^{|} for a nickname, or a name starting with # or &",
    }),
  );
}
