import type { Class, Lesson, PrismaClient } from "@prisma/client";
import { AppError, isAppError } from "@/lib/errors";
import { isLessonAccessCode } from "@/lib/lesson-code";
import { prisma as defaultPrisma } from "@/server/db";
import { assertCodeLookupAllowed, clearCodeFailures, recordCodeFailure } from "@/server/auth/rate-limit";
import { resolveShareToken } from "@/server/services/share-links";

export type StudentAccessLesson = Lesson & { class: Class };
export type StudentAccessClass = Class & { lessons: Lesson[] };

/**
 * Normalized student access resolved from either a teacher-created share token
 * or a lesson's 9-digit access code. Both entry points expose the same fields
 * so the landing page, lesson page, guard, and API routes stay identical.
 */
export type StudentAccess = {
  kind: "share" | "code";
  classId: string | null;
  lessonId: string | null;
  lesson: StudentAccessLesson | null;
  class: StudentAccessClass | null;
};

export async function resolveStudentAccess(
  identifier: string,
  db: PrismaClient = defaultPrisma,
): Promise<StudentAccess> {
  if (isLessonAccessCode(identifier)) {
    const lesson = await db.lesson.findUnique({
      where: { accessCode: identifier },
      include: { class: true },
    });
    if (!lesson) throw new AppError("invalid_code", "This lesson number is not valid", 404);
    return {
      kind: "code",
      classId: lesson.classId,
      lessonId: lesson.id,
      lesson,
      class: null,
    };
  }

  const link = await resolveShareToken(identifier, db);
  return {
    kind: "share",
    classId: link.classId,
    lessonId: link.lessonId,
    lesson: link.lesson,
    class: link.class,
  };
}

/**
 * Resolve a numeric lesson code while sharing the failed-lookup budget with
 * every other numeric entry point (home form, direct numeric URLs).
 */
export async function resolveAccessCodeWithThrottle(
  code: string,
  ip: string,
  db: PrismaClient = defaultPrisma,
): Promise<StudentAccess> {
  await assertCodeLookupAllowed(ip);
  try {
    const access = await resolveStudentAccess(code, db);
    await clearCodeFailures(ip);
    return access;
  } catch (error) {
    if (isAppError(error) && error.code === "invalid_code") {
      await recordCodeFailure(ip);
    }
    throw error;
  }
}
