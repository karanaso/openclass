import { describe, expect, it } from "vitest";
import {
  MAX_RUBRIC_CRITERIA,
  MAX_RUBRIC_LEVELS,
  MIN_RUBRIC_CRITERIA,
  MIN_RUBRIC_LEVELS,
  RUBRIC_DESCRIPTION_MAX,
  RUBRIC_TITLE_MAX,
  hasRubric,
  normalizeGeneratedRubric,
  parseLessonRubric,
  rubricUpdateSchema,
} from "@/lib/rubric";

function text(prefix: string) {
  return { el: `${prefix} EL`, en: `${prefix} EN` };
}

function criterion(index: number) {
  return { id: `criterion-${index}`, title: text(`Criterion ${index}`), description: text(`Description ${index}`) };
}

function level(index: number) {
  return { id: `level-${index}`, label: text(`Level ${index}`), description: text(`Level description ${index}`) };
}

function rubric(criteria = 3, levels = 3) {
  return {
    criteria: Array.from({ length: criteria }, (_, index) => criterion(index + 1)),
    levels: Array.from({ length: levels }, (_, index) => level(index + 1)),
  };
}

describe("generated rubric normalization", () => {
  it("accepts a valid bilingual rubric and generates missing identifiers", () => {
    const parsed = normalizeGeneratedRubric({
      criteria: [
        { title: text("One"), description: text("First") },
        { title: text("Two"), description: text("Second") },
        { title: text("Three"), description: text("Third") },
      ],
      levels: [level(1), level(2), level(3)],
    });
    expect(parsed?.criteria.map((item) => item.id)).toEqual(["criterion-1", "criterion-2", "criterion-3"]);
    expect(parsed?.criteria[0].title).toEqual(text("One"));
    expect(parsed?.levels).toHaveLength(3);
  });

  it("caps criteria and levels at the configured maximum", () => {
    const parsed = normalizeGeneratedRubric(
      rubric(MAX_RUBRIC_CRITERIA + 3, MAX_RUBRIC_LEVELS + 2),
    );
    expect(parsed?.criteria).toHaveLength(MAX_RUBRIC_CRITERIA);
    expect(parsed?.levels).toHaveLength(MAX_RUBRIC_LEVELS);
  });

  it("drops oversized and malformed items without rejecting the rubric", () => {
    const parsed = normalizeGeneratedRubric({
      criteria: [
        criterion(1),
        { id: "oversized", title: { el: "x".repeat(RUBRIC_TITLE_MAX + 1), en: "ok" }, description: text("d") },
        { id: "missing-en", title: { el: "ok" }, description: text("d") },
        criterion(2),
        { id: "long-description", title: text("t"), description: { el: "x".repeat(RUBRIC_DESCRIPTION_MAX + 1), en: "ok" } },
        criterion(3),
      ],
      levels: [level(1), level(2), { ...level(3), label: { el: "", en: "empty" } }, level(4)],
    });
    expect(parsed?.criteria.map((item) => item.id)).toEqual(["criterion-1", "criterion-2", "criterion-3"]);
    expect(parsed?.levels).toHaveLength(3);
  });

  it("drops duplicate identifiers", () => {
    const parsed = normalizeGeneratedRubric({
      criteria: [criterion(1), criterion(1), criterion(2), criterion(3)],
      levels: [level(1), level(1), level(2), level(3)],
    });
    expect(parsed?.criteria.map((item) => item.id)).toEqual(["criterion-1", "criterion-2", "criterion-3"]);
    expect(parsed?.levels.map((item) => item.id)).toEqual(["level-1", "level-2", "level-3"]);
  });

  it("treats too little valid content as no rubric", () => {
    expect(normalizeGeneratedRubric(rubric(MIN_RUBRIC_CRITERIA - 1, MIN_RUBRIC_LEVELS))).toBeNull();
    expect(normalizeGeneratedRubric(rubric(MIN_RUBRIC_CRITERIA, MIN_RUBRIC_LEVELS - 1))).toBeNull();
    expect(parseLessonRubric(null)).toBeNull();
    expect(parseLessonRubric("bad")).toBeNull();
  });
});

describe("teacher rubric validation", () => {
  it("accepts a valid full rubric and an explicit clear", () => {
    expect(rubricUpdateSchema.parse(rubric()).criteria).toHaveLength(3);
    expect(rubricUpdateSchema.parse({ criteria: [], levels: [] })).toEqual({ criteria: [], levels: [] });
  });

  it("rejects too few criteria or levels", () => {
    expect(() => rubricUpdateSchema.parse(rubric(2, 3))).toThrow();
    expect(() => rubricUpdateSchema.parse(rubric(3, 2))).toThrow();
  });

  it("rejects duplicate identifiers and oversized text", () => {
    const duplicate = rubric();
    duplicate.criteria[1].id = duplicate.criteria[0].id;
    expect(() => rubricUpdateSchema.parse(duplicate)).toThrow();

    const oversized = rubric();
    oversized.levels[0].label.el = "x".repeat(RUBRIC_TITLE_MAX + 1);
    expect(() => rubricUpdateSchema.parse(oversized)).toThrow();
  });

  it("detects non-empty rubrics", () => {
    expect(hasRubric(normalizeGeneratedRubric(rubric()))).toBe(true);
    expect(hasRubric(null)).toBe(false);
  });
});
