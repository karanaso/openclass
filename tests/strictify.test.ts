import { describe, expect, it } from "vitest";
import zodToJsonSchema from "zod-to-json-schema";
import { strictify } from "@/server/generation/openai-provider";
import {
  cardsArtifactSchema,
  questionsArtifactSchema,
  resourceSuggestionsArtifactSchema,
  rubricArtifactSchema,
  topicsArtifactSchema,
} from "@/server/generation/schemas";

function emptyObjectSchemas(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + emptyObjectSchemas(item), 0);
  if (!value || typeof value !== "object") return 0;
  const object = value as Record<string, unknown>;
  const self = Object.keys(object).length === 0 ? 1 : 0;
  return self + Object.values(object).reduce<number>((sum, child) => sum + emptyObjectSchemas(child), 0);
}

function untypedAnyOfBranches(value: unknown): number {
  if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + untypedAnyOfBranches(item), 0);
  if (!value || typeof value !== "object") return 0;
  const object = value as Record<string, unknown>;
  const branches = Array.isArray(object.anyOf) ? object.anyOf : [];
  const untyped = branches.filter(
    (item) => !item || typeof item !== "object" || typeof (item as Record<string, unknown>).type !== "string",
  ).length;
  return untyped + Object.values(object).reduce<number>((sum, child) => sum + untypedAnyOfBranches(child), 0);
}

describe("strictify", () => {
  it("removes empty not nodes and flattens single-branch anyOf", () => {
    const input = {
      anyOf: [{ anyOf: [{ not: {} }, { type: "string" }] }, { type: "null" }],
    };
    expect(strictify(input)).toEqual({ anyOf: [{ type: "string" }, { type: "null" }] });
  });

  it.each([
    ["cards", cardsArtifactSchema],
    ["questions", questionsArtifactSchema],
    ["topics", topicsArtifactSchema],
    ["resource suggestions", resourceSuggestionsArtifactSchema],
    ["rubric", rubricArtifactSchema],
  ])("produces a strict schema without empty or untyped nodes for %s", (_name, schema) => {
    const json = strictify(zodToJsonSchema(schema, { target: "jsonSchema7", $refStrategy: "none" }));
    expect(JSON.stringify(json)).not.toContain('"not":{}');
    expect(emptyObjectSchemas(json)).toBe(0);
    expect(untypedAnyOfBranches(json)).toBe(0);
  });
});
