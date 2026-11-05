import { z } from "zod";
import { json, withPublic } from "@/server/http";
import { assertLessonInShare, requireStudentContext } from "@/server/student/guard";
import { getAttemptForStudent } from "@/server/services/results";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({ attemptId: z.string().min(1) });

export async function GET(request: Request, context: { params: Promise<{ token: string; lessonId: string }> }) {
  return withPublic(async () => {
    const { token, lessonId } = await context.params;
    const { share, session } = await requireStudentContext(request, token);
    assertLessonInShare(share, lessonId);
    const url = new URL(request.url);
    const { attemptId } = querySchema.parse({ attemptId: url.searchParams.get("attemptId") ?? undefined });
    const attempt = await getAttemptForStudent(lessonId, attemptId, session.normalizedName);
    return json({
      attempt: {
        id: attempt.id,
        studentName: attempt.studentName,
        mode: attempt.mode,
        score: attempt.score,
        maxScore: attempt.maxScore,
        percentage: attempt.percentage,
        passed: attempt.passed,
        completedAt: attempt.completedAt?.toISOString() ?? null,
        answers: attempt.answers.map((answer) => ({
          questionId: answer.questionId,
          selectedOptionId: answer.selectedOptionId,
          isCorrect: answer.isCorrect,
        })),
      },
    });
  });
}
