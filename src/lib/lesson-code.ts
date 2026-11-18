export const LESSON_ACCESS_CODE_PATTERN = /^[1-9]\d{8}$/;

export const LESSON_ACCESS_CODE_MIN = 100_000_000;
export const LESSON_ACCESS_CODE_UPPER_BOUND = 1_000_000_000;

export function isLessonAccessCode(value: string): boolean {
  return LESSON_ACCESS_CODE_PATTERN.test(value);
}
