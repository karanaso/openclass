import { describe, expect, it } from "vitest";
import {
  MAX_TOPICS_PER_LOCALE,
  TOPIC_MAX,
  hasTopics,
  normalizeLessonTopics,
  parseLessonTopics,
} from "@/lib/topics";

describe("lesson topics", () => {
  it("normalizes valid lists and trims whitespace", () => {
    expect(
      normalizeLessonTopics({
        el: ["  Φωτοσύνθεση ", "Χλωροφύλλη"],
        en: [" Photosynthesis ", "Chlorophyll "],
      }),
    ).toEqual({
      el: ["Φωτοσύνθεση", "Χλωροφύλλη"],
      en: ["Photosynthesis", "Chlorophyll"],
    });
  });

  it("treats null, missing, and malformed values as empty lists", () => {
    for (const input of [null, undefined, "topics", [], { el: "x", en: 3 }]) {
      expect(parseLessonTopics(input)).toEqual({ el: [], en: [] });
    }
  });

  it("deduplicates case-insensitively within each locale", () => {
    expect(
      normalizeLessonTopics({
        el: ["Φύση", " φύση ", "ΦΥΣΗ"],
        en: ["Plants", "plants", "PLANTS"],
      }),
    ).toEqual({ el: ["Φύση"], en: ["Plants"] });
  });

  it("drops empty and oversized topics without rejecting valid ones", () => {
    expect(
      normalizeLessonTopics({
        el: ["", "   ", "x".repeat(TOPIC_MAX + 1), "Έγκυρο"],
        en: ["valid"],
      }),
    ).toEqual({ el: ["Έγκυρο"], en: ["valid"] });
  });

  it("caps each locale at the configured limit", () => {
    const topics = Array.from({ length: MAX_TOPICS_PER_LOCALE + 4 }, (_, index) => `Topic ${index}`);
    const normalized = normalizeLessonTopics({ el: topics, en: topics });
    expect(normalized.el).toHaveLength(MAX_TOPICS_PER_LOCALE);
    expect(normalized.en).toHaveLength(MAX_TOPICS_PER_LOCALE);
    expect(normalized.el[0]).toBe("Topic 0");
  });

  it("ignores non-string entries", () => {
    expect(normalizeLessonTopics({ el: ["ok", 42, null, { value: "no" }], en: [] })).toEqual({
      el: ["ok"],
      en: [],
    });
  });

  it("reports whether any topic exists", () => {
    expect(hasTopics({ el: ["one"], en: [] })).toBe(true);
    expect(hasTopics({ el: [], en: [] })).toBe(false);
  });
});
