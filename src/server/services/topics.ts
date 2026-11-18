import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/server/db";
import { NotFoundError } from "@/lib/errors";
import {
  MAX_TOPICS_PER_LOCALE,
  TOPIC_MAX,
  normalizeLessonTopics,
  parseLessonTopics,
  topicKey,
  type LessonTopics,
} from "@/lib/topics";

const topicListSchema = z
  .array(z.string().trim().min(1).max(TOPIC_MAX))
  .max(MAX_TOPICS_PER_LOCALE)
  .superRefine((topics, context) => {
    const seen = new Set<string>();
    topics.forEach((topic, index) => {
      const key = topicKey(topic);
      if (seen.has(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: "Duplicate topic",
        });
      }
      seen.add(key);
    });
  });

export const lessonTopicsUpdateSchema = z.object({
  el: topicListSchema,
  en: topicListSchema,
});

export type LessonTopicsUpdate = z.infer<typeof lessonTopicsUpdateSchema>;

export async function getLessonTopics(
  lessonId: string,
  db: PrismaClient = defaultPrisma,
): Promise<LessonTopics> {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: { topics: true },
  });
  if (!lesson) throw new NotFoundError("Lesson not found");
  return parseLessonTopics(lesson.topics);
}

export async function updateLessonTopics(
  lessonId: string,
  input: unknown,
  db: PrismaClient = defaultPrisma,
): Promise<LessonTopics> {
  const parsed = lessonTopicsUpdateSchema.parse(input);
  const lesson = await db.lesson.findUnique({ where: { id: lessonId }, select: { id: true } });
  if (!lesson) throw new NotFoundError("Lesson not found");

  const topics = normalizeLessonTopics(parsed);
  await db.lesson.update({
    where: { id: lessonId },
    data: { topics, topicsEdited: true },
  });
  return topics;
}
