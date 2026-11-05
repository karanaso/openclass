import { describe, expect, it } from "vitest";
import { negotiateLocale, normalizeLocale } from "@/lib/locale";

describe("locale negotiation", () => {
  it("defaults to Greek", () => {
    expect(negotiateLocale({})).toBe("el");
  });

  it("prefers an explicit choice over a stored one", () => {
    expect(negotiateLocale({ explicit: "en", stored: "el" })).toBe("en");
  });

  it("uses Accept-Language quality ordering", () => {
    expect(negotiateLocale({ acceptLanguage: "fr;q=1, en;q=0.8, el;q=0.7" })).toBe("en");
    expect(negotiateLocale({ acceptLanguage: "el-GR,el;q=0.9,en;q=0.5" })).toBe("el");
  });

  it("falls back for unsupported languages", () => {
    expect(negotiateLocale({ acceptLanguage: "de-DE,de;q=0.9" })).toBe("el");
    expect(normalizeLocale("fr")).toBe("el");
  });
});
