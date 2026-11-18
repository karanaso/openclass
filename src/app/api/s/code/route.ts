import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, RateLimitError, isAppError } from "@/lib/errors";
import { isLessonAccessCode } from "@/lib/lesson-code";
import { clientIpFromHeaders } from "@/server/auth/rate-limit";
import { withPublic } from "@/server/http";
import { resolveAccessCodeWithThrottle } from "@/server/services/student-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ code: z.string() });

export async function POST(request: Request) {
  return withPublic(async () => {
    const body = bodySchema.parse(await request.json());
    const code = body.code.trim();
    if (!isLessonAccessCode(code)) {
      throw new AppError("validation_error", "Enter a 9-digit lesson number", 422);
    }

    const ip = clientIpFromHeaders(request.headers);
    try {
      const access = await resolveAccessCodeWithThrottle(code, ip);
      return NextResponse.json({ lessonId: access.lessonId });
    } catch (error) {
      if (error instanceof RateLimitError) {
        return NextResponse.json(
          {
            error: {
              code: "code_rate_limited",
              message: "Too many attempts",
              details: { retryAfter: error.retryAfterSeconds },
            },
          },
          { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
        );
      }
      if (isAppError(error) && error.code === "invalid_code") {
        throw new AppError("code_not_found", "This lesson number was not found", 404);
      }
      throw error;
    }
  });
}
