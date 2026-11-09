import { describe, expect, it } from "vitest";
import {
  CHARACTER_BOB_AMPLITUDE,
  CHARACTER_BOB_PERIOD_SECONDS,
  CHARACTER_BREATH_AMPLITUDE,
  CHARACTER_BREATH_PERIOD_SECONDS,
  CHARACTER_SWAY_AMPLITUDE,
  CHARACTER_SWAY_PERIOD_SECONDS,
  CHARACTER_WIDTH,
  COMPOSED_HEIGHT,
  COMPOSED_WIDTH,
  MEDIA_ASSETS,
  SLIDE_BOX,
  SLIDE_ENTRANCE_SECONDS,
  SCENE_MOTION_SCALE,
  characterFilterGraph,
} from "@/server/media/render-video";

describe("character video composition", () => {
  it("builds a readable side-panel layout", () => {
    const graph = characterFilterGraph();
    expect(graph).toContain(`${COMPOSED_WIDTH}:${COMPOSED_HEIGHT}`);
    expect(graph).toContain(`${SLIDE_BOX.width}:${SLIDE_BOX.height}`);
    expect(graph).toContain(`overlay=x=${SLIDE_BOX.x}:y=`);
    expect(graph).toContain(`scale=${CHARACTER_WIDTH}:-1`);
    expect(graph).toContain("force_original_aspect_ratio=decrease");
  });

  it("applies the rounded slide card, shadow, and vignette overlays", () => {
    const graph = characterFilterGraph();
    expect(graph).toContain("[3:v]");
    expect(graph).toContain("[4:v]");
    expect(graph).toContain("[5:v]");
    expect(graph).toContain("alphamerge");
    expect(graph).toContain(`fade=t=in:st=0:d=${SLIDE_ENTRANCE_SECONDS}:alpha=1`);
    expect(MEDIA_ASSETS.slideMask).toContain("slide-mask.png");
    expect(MEDIA_ASSETS.slideShadow).toContain("slide-shadow.png");
    expect(MEDIA_ASSETS.vignette).toContain("vignette.png");
  });

  it("adds scene motion that varies by segment", () => {
    const first = characterFilterGraph({ variant: 0 });
    const second = characterFilterGraph({ variant: 1 });
    expect(first).toContain(`crop=${COMPOSED_WIDTH}:${COMPOSED_HEIGHT}:x=`);
    expect(first).toContain("sin(2*PI*t/");
    expect(first).toContain(`scale=${Math.round(COMPOSED_WIDTH * SCENE_MOTION_SCALE)}`);
    expect(first).not.toBe(second);
    expect(second).toContain("-40*sin");
  });

  it("adds the idle bob, breathing, and sway at composition time", () => {
    const graph = characterFilterGraph();
    expect(graph).toContain(
      `${CHARACTER_BOB_AMPLITUDE}*sin(2*PI*t/${CHARACTER_BOB_PERIOD_SECONDS})`,
    );
    expect(graph).toContain(
      `${CHARACTER_BREATH_AMPLITUDE}*sin(2*PI*t/${CHARACTER_BREATH_PERIOD_SECONDS})`,
    );
    expect(graph).toContain(
      `${CHARACTER_SWAY_AMPLITUDE}*sin(2*PI*t/${CHARACTER_SWAY_PERIOD_SECONDS})`,
    );
    expect(graph).toContain("eval=frame");
  });
});
