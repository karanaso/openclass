import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";

export const TEACHER_COOKIE = "teacher_session";
export const TEACHER_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type TeacherSession = { role: "teacher" };

function secret(): Uint8Array {
  return new TextEncoder().encode(getEnv().AUTH_SECRET);
}

export async function createSessionToken(ttlSeconds = TEACHER_SESSION_TTL_SECONDS): Promise<string> {
  return new SignJWT({ role: "teacher" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("lessonlab")
    .setAudience("teacher")
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<TeacherSession | null> {
  try {
    const result = await jwtVerify(token, secret(), { issuer: "lessonlab", audience: "teacher" });
    if (result.payload.role !== "teacher") return null;
    return { role: "teacher" };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: TEACHER_SESSION_TTL_SECONDS,
  };
}

export async function getTeacherSession(): Promise<TeacherSession | null> {
  const store = await cookies();
  const token = store.get(TEACHER_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export function cookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export async function getTeacherSessionFromRequest(request: Request): Promise<TeacherSession | null> {
  const token = cookieValue(request.headers.get("cookie"), TEACHER_COOKIE);
  if (!token) return null;
  return verifySessionToken(token);
}
