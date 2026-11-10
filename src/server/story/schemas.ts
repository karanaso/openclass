import { z } from "zod";
import { localeTextSchema } from "@/server/generation/schemas";

export const rawStorySceneSchema = z.object({
  sceneKey: z.string().trim().min(1).max(120),
  sourcePages: z.array(z.number().int().positive()).min(1).max(80),
  narration: localeTextSchema,
  visualDirection: z.string().trim().max(600).optional(),
});

export const rawStorySchema = z.object({
  title: z.string().trim().min(1).max(200),
  logline: z.string().trim().min(1).max(600),
  scenes: z.array(rawStorySceneSchema).min(1).max(50),
});

export type RawStoryScene = z.infer<typeof rawStorySceneSchema>;
export type RawStory = z.infer<typeof rawStorySchema>;

export type StoryPage = { pageNumber: number; text: string };

export type NormalizedStoryScene = {
  position: number;
  sceneKey: string;
  sourcePages: number[];
  narration: { el: string; en: string };
  visualDirection?: string;
};

export type NormalizedStory = {
  title: string;
  logline: string;
  scenes: NormalizedStoryScene[];
};

export type StoryNormalizationResult = {
  story: NormalizedStory;
  errors: string[];
  missingPageNumbers: number[];
  droppedSceneKeys: string[];
  ok: boolean;
};

export type StoryBeat = {
  sceneKey: string;
  sourcePages: number[];
  narration: { el: string; en: string };
  visualDirection?: string;
};
