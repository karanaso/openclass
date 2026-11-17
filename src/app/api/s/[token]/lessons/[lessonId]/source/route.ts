import { prisma } from "@/server/db";
import { AppError } from "@/lib/errors";
import { withPublic } from "@/server/http";
import { assertLessonInShare, requireStudentContext } from "@/server/student/guard";
import { getStorage } from "@/server/storage";
import { serveStoredMedia } from "@/server/media/serve-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeFilename(filename: string): string {
  const cleaned = filename.replace(/[\u0000-\u001f\u007f"\\/]/g, "").trim();
  return cleaned || "lesson.pdf";
}

function inlineContentDisposition(filename: string): string {
  const safe = sanitizeFilename(filename);
  const ascii = safe.replace(/[^\x20-\x7e]/g, "_") || "lesson.pdf";
  const encoded = encodeURIComponent(safe).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string; lessonId: string }> },
) {
  return withPublic(async () => {
    const { token, lessonId } = await context.params;
    const { share } = await requireStudentContext(request, token);
    assertLessonInShare(share, lessonId);

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { storageKey: true, originalFilename: true },
    });
    if (!lesson?.storageKey) throw new AppError("not_found", "Source document not found", 404);

    return serveStoredMedia(request, getStorage(), {
      key: lesson.storageKey,
      contentType: "application/pdf",
      headers: { "content-disposition": inlineContentDisposition(lesson.originalFilename) },
    });
  });
}
