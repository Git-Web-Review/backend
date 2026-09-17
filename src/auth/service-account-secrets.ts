import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt) as (
  secret: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const SECRET_PREFIX = "gwr_sk_";
const SECRET_BYTES = 32;
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const HASH_SCHEME = "scrypt";

export function generateSecret(): string {
  return `${SECRET_PREFIX}${randomBytes(SECRET_BYTES).toString("base64url")}`;
}

/** `scrypt$<salt>$<hash>`, both base64. Only the hash is ever stored. */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scryptAsync(secret, salt, KEY_BYTES);
  return `${HASH_SCHEME}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifySecret(
  secret: string,
  stored: string,
): Promise<boolean> {
  const [scheme, saltBase64, hashBase64] = stored.split("$");
  if (scheme !== HASH_SCHEME || !saltBase64 || !hashBase64) {
    return false;
  }

  const expected = Buffer.from(hashBase64, "base64");
  const derived = await scryptAsync(
    secret,
    Buffer.from(saltBase64, "base64"),
    expected.length,
  );

  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

/**
 * Burns the same scrypt work on unknown client ids so response time does not
 * reveal whether a client id exists.
 */
export async function dummyVerify(secret: string): Promise<boolean> {
  await scryptAsync(secret, randomBytes(SALT_BYTES), KEY_BYTES);
  return false;
}
