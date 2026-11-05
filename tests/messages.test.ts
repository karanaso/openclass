import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function flatten(value: unknown, prefix = ""): string[] {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      flatten(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

describe("message catalogs", () => {
  it("have identical key sets in Greek and English", () => {
    const el = flatten(JSON.parse(readFileSync("messages/el.json", "utf8"))).sort();
    const en = flatten(JSON.parse(readFileSync("messages/en.json", "utf8"))).sort();
    expect(en).toEqual(el);
  });

  it("include the home badge in both locales", () => {
    const el = JSON.parse(readFileSync("messages/el.json", "utf8"));
    const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
    expect(el.home.badge).toBeTruthy();
    expect(en.home.badge).toBeTruthy();
  });
});
