import { prisma } from "@/server/db";
import { withAdmin } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const terminal = new Set(["READY", "FAILED", "CANCELLED"]);

export async function GET(request: Request, context: { params: Promise<{ lessonId: string }> }) {
  return withAdmin(request, async () => {
    const { lessonId } = await context.params;
    const encoder = new TextEncoder();
    let closed = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const stream = new ReadableStream({
      start(controller) {
        let last = "";

        const send = async () => {
          if (closed) return;
          const lesson = await prisma.lesson.findUnique({
            where: { id: lessonId },
            select: { status: true, failureReason: true, readyAt: true },
          });
          if (!lesson) {
            controller.enqueue(encoder.encode(`event: error\ndata: {"message":"not_found"}\n\n`));
            closed = true;
            controller.close();
            return;
          }
          const payload = JSON.stringify({
            status: lesson.status,
            failureReason: lesson.failureReason,
            readyAt: lesson.readyAt,
          });
          if (payload !== last) {
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
            last = payload;
          }
          if (terminal.has(lesson.status)) {
            closed = true;
            if (timer) clearInterval(timer);
            controller.close();
          }
        };

        void send();
        timer = setInterval(() => {
          void send().catch(() => {
            if (!closed) {
              closed = true;
              if (timer) clearInterval(timer);
              try {
                controller.close();
              } catch {
                // already closed
              }
            }
          });
        }, 2000);

        request.signal.addEventListener("abort", () => {
          closed = true;
          if (timer) clearInterval(timer);
          try {
            controller.close();
          } catch {
            // already closed
          }
        });
      },
      cancel() {
        closed = true;
        if (timer) clearInterval(timer);
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  });
}
