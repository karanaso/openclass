import { describe, expect, it } from "vitest";
import {
  displaySchoolName,
  displayStudentName,
  isValidSchoolName,
  isValidStudentName,
  normalizeStudentName,
} from "@/lib/names";

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

describe("school names", () => {
  it("keeps casing and collapses whitespace", () => {
    expect(displaySchoolName("  1ο   Γυμνάσιο Αθηνών ")).toBe("1ο Γυμνάσιο Αθηνών");
  });

  it("rejects empty and oversized schools", () => {
    expect(isValidSchoolName("   ")).toBe(false);
    expect(isValidSchoolName("a".repeat(121))).toBe(false);
  });

  it("accepts boundary values", () => {
    expect(isValidSchoolName("A")).toBe(true);
    expect(isValidSchoolName("a".repeat(120))).toBe(true);
  });
});
