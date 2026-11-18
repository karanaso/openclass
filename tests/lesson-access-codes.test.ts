import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { isLessonAccessCode } from "@/lib/lesson-code";
import {
  ACCESS_CODE_MAX_ATTEMPTS,
  assignAccessCode,
  newLessonAccessCode,
  regenerateAccessCode,
} from "@/server/services/lesson-access-codes";

type LessonDb = Pick<PrismaClient, "lesson">;

function fakeDb(overrides: {
  findUnique?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
} = {}): LessonDb {
  return {
    lesson: {
      findUnique: overrides.findUnique ?? vi.fn(),
      update: overrides.update ?? vi.fn(),
    },
  } as unknown as LessonDb;
}

function sequence(values: string[]): () => string {
  let index = 0;
  return () => {
    const value = values[index];
    if (value === undefined) throw new Error("generator exhausted");
    index += 1;
    return value;
  };
}

describe("isLessonAccessCode", () => {
  it("accepts exactly nine digits without a leading zero", () => {
    expect(isLessonAccessCode("100000000")).toBe(true);
    expect(isLessonAccessCode("999999999")).toBe(true);
    expect(isLessonAccessCode("404309031")).toBe(true);
  });

  it("rejects wrong lengths, leading zeros, and non-digits", () => {
    expect(isLessonAccessCode("")).toBe(false);
    expect(isLessonAccessCode("12345678")).toBe(false);
    expect(isLessonAccessCode("1234567890")).toBe(false);
    expect(isLessonAccessCode("012345678")).toBe(false);
    expect(isLessonAccessCode("12345678x")).toBe(false);
    expect(isLessonAccessCode(" 123456789")).toBe(false);
  });
});

describe("newLessonAccessCode", () => {
  it("always returns a valid nine-digit code", () => {
    for (let index = 0; index < 200; index += 1) {
      expect(isLessonAccessCode(newLessonAccessCode())).toBe(true);
    }
  });
});

describe("assignAccessCode", () => {
  it("returns the first unused code", async () => {
    const findUnique = vi.fn().mockResolvedValueOnce(null);
    const db = fakeDb({ findUnique });

    await expect(assignAccessCode(db, sequence(["123456789"]))).resolves.toBe("123456789");
    expect(findUnique).toHaveBeenCalledWith({
      where: { accessCode: "123456789" },
      select: { id: true },
    });
  });

  it("retries when a code is already taken", async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce({ id: "lesson-1" })
      .mockResolvedValueOnce(null);
    const db = fakeDb({ findUnique });

    await expect(
      assignAccessCode(db, sequence(["111111111", "222222222"])),
    ).resolves.toBe("222222222");
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it("fails after the bounded number of attempts", async () => {
    const db = fakeDb({ findUnique: vi.fn().mockResolvedValue({ id: "taken" }) });

    await expect(assignAccessCode(db, sequence(Array(ACCESS_CODE_MAX_ATTEMPTS).fill("111111111")))).rejects.toMatchObject({
      code: "access_code_unavailable",
      status: 500,
    });
  });
});

describe("regenerateAccessCode", () => {
  it("replaces the current code with a different unused value", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "lesson-1", accessCode: "111111111" });
    const update = vi.fn().mockResolvedValue({ accessCode: "222222222" });
    const db = fakeDb({ findUnique, update });

    await expect(
      regenerateAccessCode("lesson-1", db, sequence(["111111111", "222222222"])),
    ).resolves.toBe("222222222");
    expect(update).toHaveBeenCalledWith({
      where: { id: "lesson-1" },
      data: { accessCode: "222222222" },
      select: { accessCode: true },
    });
  });

  it("retries when another lesson wins the unique constraint", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "lesson-1", accessCode: "111111111" });
    const update = vi
      .fn()
      .mockRejectedValueOnce({ code: "P2002", meta: { target: ["accessCode"] } })
      .mockResolvedValueOnce({ accessCode: "333333333" });
    const db = fakeDb({ findUnique, update });

    await expect(
      regenerateAccessCode("lesson-1", db, sequence(["222222222", "333333333"])),
    ).resolves.toBe("333333333");
  });

  it("reports a missing lesson", async () => {
    const db = fakeDb({ findUnique: vi.fn().mockResolvedValue(null) });

    await expect(regenerateAccessCode("missing", db, sequence(["222222222"]))).rejects.toBeInstanceOf(AppError);
  });

  it("rethrows unrelated update errors", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "lesson-1", accessCode: "111111111" });
    const update = vi.fn().mockRejectedValue(new Error("database down"));
    const db = fakeDb({ findUnique, update });

    await expect(
      regenerateAccessCode("lesson-1", db, sequence(["222222222"])),
    ).rejects.toThrow("database down");
  });
});
