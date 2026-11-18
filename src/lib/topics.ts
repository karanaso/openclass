export const MAX_TOPICS_PER_LOCALE = 8;
export const TOPIC_MAX = 40;

export type LessonTopics = {
  el: string[];
  en: string[];
};

export const EMPTY_TOPICS: LessonTopics = { el: [], en: [] };

export function topicKey(topic: string): string {
  return topic
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("el");
}

function normalizeTopicList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const topic = raw.trim();
    if (!topic || topic.length > TOPIC_MAX) continue;

    const key = topicKey(topic);
    if (seen.has(key)) continue;

    seen.add(key);
    normalized.push(topic);
    if (normalized.length >= MAX_TOPICS_PER_LOCALE) break;
  }

  return normalized;
}

export function normalizeLessonTopics(value: unknown): LessonTopics {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...EMPTY_TOPICS };
  const record = value as Record<string, unknown>;
  return {
    el: normalizeTopicList(record.el),
    en: normalizeTopicList(record.en),
  };
}

export function parseLessonTopics(value: unknown): LessonTopics {
  return normalizeLessonTopics(value);
}

export function hasTopics(topics: LessonTopics): boolean {
  return topics.el.length > 0 || topics.en.length > 0;
}
