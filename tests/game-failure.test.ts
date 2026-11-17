import { describe, expect, it } from "vitest";
import { gameFailureFromResponse, readGameFailure } from "@/components/student/game-failure";

function body(code: string) {
  return { error: { code } };
}

describe("game failure mapping", () => {
  it("treats unauthorized responses as an expired student session", () => {
    expect(gameFailureFromResponse(401, body("unauthorized"))).toEqual({ kind: "session" });
    expect(gameFailureFromResponse(403, body("forbidden"))).toEqual({ kind: "session" });
  });

  it("maps the readiness codes returned by the game start route", () => {
    expect(gameFailureFromResponse(409, body("not_ready"))).toEqual({ kind: "not_ready" });
    expect(gameFailureFromResponse(409, body("no_game"))).toEqual({ kind: "no_questions" });
    expect(gameFailureFromResponse(409, body("game_ended"))).toEqual({ kind: "ended" });
  });

  it("falls back to a generic failure for unknown statuses and codes", () => {
    expect(gameFailureFromResponse(500, body("internal_error"))).toEqual({ kind: "unexpected" });
    expect(gameFailureFromResponse(409, body("lifeline_used"))).toEqual({ kind: "unexpected" });
    expect(gameFailureFromResponse(418, null)).toEqual({ kind: "unexpected" });
  });

  it("reads JSON error bodies", async () => {
    const response = new Response(JSON.stringify(body("not_ready")), { status: 409 });
    await expect(readGameFailure(response)).resolves.toEqual({ kind: "not_ready" });
  });

  it("treats unparsable error bodies as a generic failure", async () => {
    const response = new Response("<html>upstream error</html>", { status: 502 });
    await expect(readGameFailure(response)).resolves.toEqual({ kind: "unexpected" });
  });

  it("does not need to parse bodies for unauthorized responses", async () => {
    const response = new Response("not json", { status: 401 });
    await expect(readGameFailure(response)).resolves.toEqual({ kind: "session" });
  });
});
