import { describe, expect, it } from "vitest";
import { formatDate, formatDuration, formatNumber, formatPercent } from "@/lib/format";

describe("locale formatting", () => {
  const date = new Date("2026-03-04T10:30:00Z");

  it("formats Greek and English dates differently", () => {
    const el = formatDate(date, "el", { dateStyle: "long", timeZone: "UTC" });
    const en = formatDate(date, "en", { dateStyle: "long", timeZone: "UTC" });
    expect(el).toContain("2026");
    expect(en).toContain("2026");
    expect(el).not.toBe(en);
  });

  it("formats percentages per locale", () => {
    expect(formatPercent(75, "el")).toContain("75");
    expect(formatPercent(75, "en")).toContain("75");
  });

  it("formats numbers and durations", () => {
    expect(formatNumber(1234.5, "en")).toBe("1,234.5");
    expect(formatDuration(65_000, "en")).toBe("1m 5s");
    expect(formatDuration(65_000, "el")).toContain("1λ");
  });
});
