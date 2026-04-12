// bcrypt wrapper — isolated so the rest of auth code stays testable
// Node-only (not Edge runtime). Runs only in Credentials provider authorize().
import { hash, compare } from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hashed: string
): Promise<boolean> {
  return compare(plain, hashed);
}
