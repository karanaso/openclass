import { z } from "zod";

export const MIN_RUBRIC_CRITERIA = 3;
export const MAX_RUBRIC_CRITERIA = 6;
export const MIN_RUBRIC_LEVELS = 3;
export const MAX_RUBRIC_LEVELS = 4;
export const RUBRIC_TITLE_MAX = 80;
export const RUBRIC_DESCRIPTION_MAX = 500;

export type RubricText = {
  el: string;
  en: string;
};

export type RubricCriterion = {
  id: string;
  title: RubricText;
  description: RubricText;
};

export type RubricLevel = {
  id: string;
  label: RubricText;
  description: RubricText;
};

export type LessonRubric = {
  criteria: RubricCriterion[];
  levels: RubricLevel[];
};

function readText(value: unknown, maxLength: number): RubricText | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.el !== "string" || typeof record.en !== "string") return null;
  const el = record.el.trim();
  const en = record.en.trim();
  if (!el || !en || el.length > maxLength || en.length > maxLength) return null;
  return { el, en };
}

function readId(value: unknown, prefix: string, index: number, seen: Set<string>): string | null {
  const candidate = typeof value === "string" ? value.trim() : "";
  let id = candidate || `${prefix}-${index + 1}`;
  if (id.length > RUBRIC_TITLE_MAX) return null;
  if (seen.has(id)) {
    if (candidate) return null;
    id = `${prefix}-${index + 1}-new`;
    if (seen.has(id)) return null;
  }
  seen.add(id);
  return id;
}

export function normalizeGeneratedRubric(value: unknown): LessonRubric | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const rawCriteria = Array.isArray(record.criteria) ? record.criteria : [];
  const rawLevels = Array.isArray(record.levels) ? record.levels : [];

  const criterionIds = new Set<string>();
  const criteria: RubricCriterion[] = [];
  for (const [index, item] of rawCriteria.entries()) {
    if (criteria.length >= MAX_RUBRIC_CRITERIA) break;
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const entry = item as Record<string, unknown>;
    const id = readId(entry.id, "criterion", index, criterionIds);
    const title = readText(entry.title, RUBRIC_TITLE_MAX);
    const description = readText(entry.description, RUBRIC_DESCRIPTION_MAX);
    if (!id || !title || !description) continue;
    criteria.push({ id, title, description });
  }

  const levelIds = new Set<string>();
  const levels: RubricLevel[] = [];
  for (const [index, item] of rawLevels.entries()) {
    if (levels.length >= MAX_RUBRIC_LEVELS) break;
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const entry = item as Record<string, unknown>;
    const id = readId(entry.id, "level", index, levelIds);
    const label = readText(entry.label, RUBRIC_TITLE_MAX);
    const description = readText(entry.description, RUBRIC_DESCRIPTION_MAX);
    if (!id || !label || !description) continue;
    levels.push({ id, label, description });
  }

  if (criteria.length < MIN_RUBRIC_CRITERIA || levels.length < MIN_RUBRIC_LEVELS) return null;
  return { criteria, levels };
}

export function parseLessonRubric(value: unknown): LessonRubric | null {
  return normalizeGeneratedRubric(value);
}

export function hasRubric(rubric: LessonRubric | null): rubric is LessonRubric {
  return Boolean(rubric && rubric.criteria.length > 0 && rubric.levels.length > 0);
}

const rubricTextSchema = (maxLength: number) =>
  z.object({
    el: z.string().trim().min(1).max(maxLength),
    en: z.string().trim().min(1).max(maxLength),
  });

const criterionInputSchema = z.object({
  id: z.string().trim().min(1).max(RUBRIC_TITLE_MAX),
  title: rubricTextSchema(RUBRIC_TITLE_MAX),
  description: rubricTextSchema(RUBRIC_DESCRIPTION_MAX),
});

const levelInputSchema = z.object({
  id: z.string().trim().min(1).max(RUBRIC_TITLE_MAX),
  label: rubricTextSchema(RUBRIC_TITLE_MAX),
  description: rubricTextSchema(RUBRIC_DESCRIPTION_MAX),
});

export const rubricUpdateSchema = z
  .object({
    criteria: z.array(criterionInputSchema).max(MAX_RUBRIC_CRITERIA),
    levels: z.array(levelInputSchema).max(MAX_RUBRIC_LEVELS),
  })
  .superRefine((value, context) => {
    const empty = value.criteria.length === 0 && value.levels.length === 0;
    if (empty) return;

    if (value.criteria.length < MIN_RUBRIC_CRITERIA) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["criteria"],
        message: `At least ${MIN_RUBRIC_CRITERIA} criteria are required`,
      });
    }
    if (value.levels.length < MIN_RUBRIC_LEVELS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["levels"],
        message: `At least ${MIN_RUBRIC_LEVELS} levels are required`,
      });
    }

    const criterionIds = new Set<string>();
    value.criteria.forEach((criterion, index) => {
      if (criterionIds.has(criterion.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["criteria", index, "id"],
          message: "Duplicate criterion identifier",
        });
      }
      criterionIds.add(criterion.id);
    });

    const levelIds = new Set<string>();
    value.levels.forEach((level, index) => {
      if (levelIds.has(level.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["levels", index, "id"],
          message: "Duplicate level identifier",
        });
      }
      levelIds.add(level.id);
    });
  });
