import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/server/db";

export async function markMediaFailure(
  data: { lessonId: string; locale?: string },
  error: unknown,
  db: PrismaClient = defaultPrisma,
): Promise<void> {
  const lesson = await db.lesson
    .findUnique({ where: { id: data.lessonId }, select: { sourceLocale: true } })
    .catch(() => null);
  const locale = data.locale ?? lesson?.sourceLocale ?? "el";
  const message = (error instanceof Error ? error.message : "Pipeline job failed").slice(0, 1000);
  await db.videoAsset.upsert({
    where: { lessonId_locale: { lessonId: data.lessonId, locale } },
    create: { lessonId: data.lessonId, locale, status: "FAILED", error: message },
    update: { status: "FAILED", error: message },
  });
}
