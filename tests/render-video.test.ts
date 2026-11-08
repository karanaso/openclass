import { describe, expect, it } from "vitest";
import {
  CHARACTER_BOB_AMPLITUDE,
  CHARACTER_BOB_PERIOD_SECONDS,
  CHARACTER_WIDTH,
  COMPOSED_HEIGHT,
  COMPOSED_WIDTH,
  SLIDE_BOX,
  characterFilterGraph,
} from "@/server/media/render-video";

describe("character video composition", () => {
  it("builds a readable side-panel layout", () => {
    const graph = characterFilterGraph();
    expect(graph).toContain(`${COMPOSED_WIDTH}:${COMPOSED_HEIGHT}`);
    expect(graph).toContain(`${SLIDE_BOX.width}:${SLIDE_BOX.height}`);
    expect(graph).toContain(`overlay=${SLIDE_BOX.x}:${SLIDE_BOX.y}`);
    expect(graph).toContain(`scale=${CHARACTER_WIDTH}:-1`);
    expect(graph).toContain("force_original_aspect_ratio=decrease");
  });

  it("adds the idle bob at composition time", () => {
    expect(characterFilterGraph()).toContain(
      `${CHARACTER_BOB_AMPLITUDE}*sin(2*PI*t/${CHARACTER_BOB_PERIOD_SECONDS})`,
    );
  });
});
