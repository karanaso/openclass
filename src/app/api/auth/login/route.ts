import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthConfigured, verifyTeacherPassword } from "@/server/auth/password";
import { assertLoginAllowed, clearLoginFailures, clientIpFromHeaders, recordLoginFailure } from "@/server/auth/rate-limit";
import { createSessionToken, sessionCookieOptions, TEACHER_COOKIE } from "@/server/auth/session";
import { clientIp } from "@/server/auth/guard";
import { RateLimitError } from "@/lib/errors";

export const runtime = "nodejs";

const bodySchema = z.object({ password: z.string().min(1).max(500) });

export async function POST(request: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.json({ error: { code: "auth_not_configured", message: "Authentication is not configured" } }, { status: 503 });
  }

  const ip = clientIp(request) || clientIpFromHeaders(request.headers);
  try {
    await assertLoginAllowed(ip);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: { code: "rate_limited", message: "Too many attempts" } },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
      );
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "validation_error", message: "Invalid request" } }, { status: 422 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "validation_error", message: "Invalid request" } }, { status: 422 });
  }

  const valid = await verifyTeacherPassword(parsed.data.password);
  if (!valid) {
    await recordLoginFailure(ip);
    return NextResponse.json({ error: { code: "invalid_credentials", message: "Invalid credentials" } }, { status: 401 });
  }

  await clearLoginFailures(ip);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(TEACHER_COOKIE, await createSessionToken(), sessionCookieOptions());
  return response;
}
