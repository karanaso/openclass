import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { getStudentSession, getStudentSessionFromRequest, type StudentSession } from "@/server/auth/student";
import { hashShareToken } from "@/server/services/share-links";
import { resolveStudentAccess, type StudentAccess } from "@/server/services/student-access";

export type StudentContext = {
  share: StudentAccess;
  session: StudentSession;
};

export async function requireStudentContext(request: Request, token: string): Promise<StudentContext> {
  const share = await resolveStudentAccess(token);
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

export function assertLessonInShare(share: StudentAccess, lessonId: string): void {
  if (share.lessonId) {
    if (share.lessonId !== lessonId) {
      throw new ForbiddenError("This link does not grant access to that lesson");
    }
    return;
  }
  if (share.classId) {
    const allowed = share.class?.lessons.some((lesson) => lesson.id === lessonId);
    if (!allowed) throw new ForbiddenError("This link does not grant access to that lesson");
  }
}
