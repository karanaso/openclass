import { NextResponse } from "next/server";
import { regenerateAccessCode } from "@/server/services/lesson-access-codes";
import { withAdmin } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ lessonId: string }> }) {
  return withAdmin(
    request,
    async () => {
      const { lessonId } = await context.params;
      const accessCode = await regenerateAccessCode(lessonId);
      return NextResponse.json({ accessCode });
    },
    { mutation: true },
  );
}
