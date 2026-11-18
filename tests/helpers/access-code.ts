import { randomInt } from "node:crypto";

/**
 * Test-only code generator. Keeping this free of application imports avoids
 * constructing the Prisma client before a test container's DATABASE_URL is set.
 */
export function nextTestAccessCode(): string {
  return String(randomInt(100_000_000, 1_000_000_000));
}
