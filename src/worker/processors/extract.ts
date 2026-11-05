import { readFile } from "node:fs/promises";
import { AppError } from "@/lib/errors";
import { detectContentLocale } from "@/lib/locale";
import { prisma } from "@/server/db";
import { extractPdfPages } from "@/server/pdf/extract";
import { enqueueStage, type PipelineJob } from "@/server/queue";
import { setLessonStatus } from "@/server/repositories/lesson-status";
import { getStorage } from "@/server/storage";

export async function processExtract(data: PipelineJob): Promise<void> {
  const lesson = await prisma.lesson.findUnique({ where: { id: data.lessonId } });
  if (!lesson || lesson.status === "CANCELLED") return;

  await setLessonStatus(lesson.id, "EXTRACTING");
  const storage = getStorage();
  const bytes = new Uint8Array(await readFile(storage.getAbsolutePath(lesson.storageKey)));
  const pages = await extractPdfPages(bytes);
  const usable = pages.filter((page) => page.text.replace(/\s/g, "").length > 20);

  if (usable.length === 0) {
    throw new AppError(
      "unsupported_pdf",
      "This PDF contains no selectable text. Scanned or image-only PDFs are not supported.",
      422,
    );
  }

  const sourceLocale = detectContentLocale(pages.map((page) => page.text).join("\n"), lesson.sourceLocale as "el" | "en");

  await prisma.$transaction([
    prisma.lessonPage.deleteMany({ where: { lessonId: lesson.id } }),
    prisma.lessonPage.createMany({
      data: pages.map((page) => ({ lessonId: lesson.id, pageNumber: page.pageNumber, text: page.text })),
    }),
    prisma.lesson.update({ where: { id: lesson.id }, data: { pageCount: pages.length, sourceLocale } }),
  ]);

  await setLessonStatus(lesson.id, "GENERATING");
  await enqueueStage({ lessonId: lesson.id, stage: "generate", version: data.version });
}
