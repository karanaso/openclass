import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";

export const STUDENT_COOKIE = "student_session";
export const STUDENT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type StudentSession = {
  role: "student";
  name: string;
  normalizedName: string;
  tokenHash: string;
};

function secret(): Uint8Array {
  return new TextEncoder().encode(getEnv().AUTH_SECRET);
}

export async function createStudentSessionToken(input: {
  name: string;
  normalizedName: string;
  tokenHash: string;
}): Promise<string> {
  return new SignJWT({
    role: "student",
    name: input.name,
    normalizedName: input.normalizedName,
    tokenHash: input.tokenHash,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("lessonlab")
    .setAudience("student")
    .setExpirationTime(`${STUDENT_SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifyStudentSessionToken(token: string): Promise<StudentSession | null> {
  try {
    const result = await jwtVerify(token, secret(), { issuer: "lessonlab", audience: "student" });
    const payload = result.payload;
    if (
      payload.role !== "student" ||
      typeof payload.name !== "string" ||
      typeof payload.normalizedName !== "string" ||
      typeof payload.tokenHash !== "string"
    ) {
      return null;
    }
    return {
      role: "student",
      name: payload.name,
      normalizedName: payload.normalizedName,
      tokenHash: payload.tokenHash,
    };
  } catch {
    return null;
  }
}

export function studentCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: STUDENT_SESSION_TTL_SECONDS,
  };
}

export async function getStudentSession(): Promise<StudentSession | null> {
  const store = await cookies();
  const token = store.get(STUDENT_COOKIE)?.value;
  if (!token) return null;
  return verifyStudentSessionToken(token);
}

export async function getStudentSessionFromRequest(request: Request): Promise<StudentSession | null> {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === STUDENT_COOKIE) {
      return verifyStudentSessionToken(decodeURIComponent(rest.join("=")));
    }
  }
  return null;
}
