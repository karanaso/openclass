import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { getStudentSession, getStudentSessionFromRequest, type StudentSession } from "@/server/auth/student";
import { hashShareToken, resolveShareToken } from "@/server/services/share-links";

export type StudentContext = {
  share: Awaited<ReturnType<typeof resolveShareToken>>;
  session: StudentSession;
};

export async function requireStudentContext(request: Request, token: string): Promise<StudentContext> {
  const share = await resolveShareToken(token);
  let session = await getStudentSessionFromRequest(request);
  if (!session) {
    try {
      session = await getStudentSession();
    } catch {
      session = null;
    }
  }
  if (!session || session.tokenHash !== hashShareToken(token)) {
    throw new UnauthorizedError("Enter your name to continue");
  }
  return { share, session };
}

export function assertLessonInShare(share: StudentContext["share"], lessonId: string): void {
  if (share.lessonId && share.lessonId !== lessonId) {
    throw new ForbiddenError("This link does not grant access to that lesson");
  }
  if (share.classId) {
    const allowed = share.class?.lessons.some((lesson) => lesson.id === lessonId);
    if (!allowed) throw new ForbiddenError("This link does not grant access to that lesson");
  }
}
