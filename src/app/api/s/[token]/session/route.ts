import { NextResponse } from "next/server";
import { z } from "zod";
import { withPublic } from "@/server/http";
import { AppError } from "@/lib/errors";
import { displayStudentName, displaySchoolName, isValidStudentName, isValidSchoolName, normalizeStudentName } from "@/lib/names";
import { hashShareToken } from "@/server/services/share-links";
import { resolveStudentAccess } from "@/server/services/student-access";
import {
  STUDENT_COOKIE,
  STUDENT_NAME_COOKIE,
  STUDENT_SCHOOL_COOKIE,
  createStudentSessionToken,
  studentCookieOptions,
  studentNameCookieOptions,
  studentSchoolCookieOptions,
} from "@/server/auth/student";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ name: z.string().min(1).max(200), school: z.string().max(400) });

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  return withPublic(async () => {
    const { token } = await context.params;
    const body = bodySchema.parse(await request.json());
    if (!isValidStudentName(body.name)) {
      throw new AppError("invalid_name", "Enter a name of up to 80 characters", 422);
    }
    if (!isValidSchoolName(body.school)) {
      throw new AppError("invalid_school", "Enter a school of up to 120 characters", 422);
    }

    const share = await resolveStudentAccess(token);
    const name = displayStudentName(body.name);
    const school = displaySchoolName(body.school);
    const sessionToken = await createStudentSessionToken({
      name,
      normalizedName: normalizeStudentName(name),
      school,
      tokenHash: hashShareToken(token),
    });

    const response = NextResponse.json({
      ok: true,
      name,
      school,
      lessonId: share.lessonId,
      classId: share.classId,
    });
    response.cookies.set(STUDENT_COOKIE, sessionToken, studentCookieOptions());
    response.cookies.set(STUDENT_NAME_COOKIE, name, studentNameCookieOptions());
    response.cookies.set(STUDENT_SCHOOL_COOKIE, school, studentSchoolCookieOptions());
    return response;
  });
}

export async function DELETE() {
  return withPublic(async () => {
    const response = NextResponse.json({ ok: true });
    for (const name of [STUDENT_COOKIE, STUDENT_NAME_COOKIE, STUDENT_SCHOOL_COOKIE]) {
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
