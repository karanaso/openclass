export type GameFailureKind = "session" | "not_ready" | "no_questions" | "ended" | "unexpected";

export type GameFailure = { kind: GameFailureKind };

export const UNEXPECTED_GAME_FAILURE: GameFailure = { kind: "unexpected" };

function errorCode(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/** Maps a failed game API response to the student-facing failure it represents. */
export function gameFailureFromResponse(status: number, body: unknown): GameFailure {
  if (status === 401 || status === 403) return { kind: "session" };
  if (status === 409) {
    switch (errorCode(body)) {
      case "not_ready":
        return { kind: "not_ready" };
      case "no_game":
        return { kind: "no_questions" };
      case "game_ended":
        return { kind: "ended" };
      default:
        return UNEXPECTED_GAME_FAILURE;
    }
  }
  return UNEXPECTED_GAME_FAILURE;
}

/** Reads a non-OK game response without assuming its body is JSON. */
export async function readGameFailure(response: Response): Promise<GameFailure> {
  if (response.status === 401 || response.status === 403) return { kind: "session" };
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return gameFailureFromResponse(response.status, body);
}
