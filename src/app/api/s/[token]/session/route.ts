import { NextResponse } from "next/server";
import { z } from "zod";
import { withPublic } from "@/server/http";
import { AppError } from "@/lib/errors";
import { displayStudentName, isValidStudentName, normalizeStudentName } from "@/lib/names";
import { resolveShareToken, hashShareToken } from "@/server/services/share-links";
import {
  STUDENT_COOKIE,
  STUDENT_NAME_COOKIE,
  createStudentSessionToken,
  studentCookieOptions,
  studentNameCookieOptions,
} from "@/server/auth/student";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ name: z.string().min(1).max(200) });

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  return withPublic(async () => {
    const { token } = await context.params;
    const body = bodySchema.parse(await request.json());
    if (!isValidStudentName(body.name)) {
      throw new AppError("invalid_name", "Enter a name of up to 80 characters", 422);
    }

    const share = await resolveShareToken(token);
    const name = displayStudentName(body.name);
    const sessionToken = await createStudentSessionToken({
      name,
      normalizedName: normalizeStudentName(name),
      tokenHash: hashShareToken(token),
    });

    const response = NextResponse.json({
      ok: true,
      name,
      lessonId: share.lessonId,
      classId: share.classId,
    });
    response.cookies.set(STUDENT_COOKIE, sessionToken, studentCookieOptions());
    response.cookies.set(STUDENT_NAME_COOKIE, name, studentNameCookieOptions());
    return response;
  });
}

export async function DELETE() {
  return withPublic(async () => {
    const response = NextResponse.json({ ok: true });
    for (const name of [STUDENT_COOKIE, STUDENT_NAME_COOKIE]) {
      response.cookies.set(name, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
    }
    return response;
  });
}
