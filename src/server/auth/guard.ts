import { NextResponse } from "next/server";
import { UnauthorizedError } from "@/lib/errors";
import { getTeacherSession, getTeacherSessionFromRequest, type TeacherSession } from "./session";
import { clientIpFromHeaders } from "./rate-limit";

export async function requireTeacher(request?: Request): Promise<TeacherSession> {
  let session = request ? await getTeacherSessionFromRequest(request) : null;
  if (!session) {
    try {
      session = await getTeacherSession();
    } catch {
      session = null;
    }
  }
  if (!session) {
    throw new UnauthorizedError();
  }
  return session;
}

export function assertSameOrigin(request: Request): void {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;

  const origin = request.headers.get("origin");
  if (!origin) return;

  const requestOrigin = new URL(request.url).origin;
  const configured = process.env.APP_BASE_URL ? new URL(process.env.APP_BASE_URL).origin : requestOrigin;
  if (origin !== requestOrigin && origin !== configured) {
    throw new UnauthorizedError("Cross-origin request rejected");
  }
}

export function clientIp(request: Request): string {
  return clientIpFromHeaders(request.headers);
}

export function jsonError(status: number, code: string, message: string, headers?: Record<string, string>) {
  return NextResponse.json({ error: { code, message } }, { status, headers });
}
