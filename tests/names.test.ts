import { describe, expect, it } from "vitest";
import { displayStudentName, isValidStudentName, normalizeStudentName } from "@/lib/names";

describe("student names", () => {
  it("normalizes whitespace, unicode, and case", () => {
    expect(normalizeStudentName("  Μαρία   Παπαδοπούλου ")).toBe("μαρία παπαδοπούλου");
    expect(normalizeStudentName("ΜΑΡΙΑ")).toBe("μαρια");
  });

  it("keeps the display form but collapses whitespace", () => {
    expect(displayStudentName("  Μαρία   Παπαδοπούλου ")).toBe("Μαρία Παπαδοπούλου");
  });

  it("rejects empty and oversized names", () => {
    expect(isValidStudentName("   ")).toBe(false);
    expect(isValidStudentName("a".repeat(81))).toBe(false);
    expect(isValidStudentName("Maria")).toBe(true);
  });
});
