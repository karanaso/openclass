import { describe, expect, it } from "vitest";
import { probeImageInfo } from "@/server/media/ffmpeg";
import { COMPOSED_HEIGHT, COMPOSED_WIDTH, MEDIA_ASSETS, SLIDE_BOX } from "@/server/media/render-video";

describe("video composition assets", () => {
  it("ships a rounded slide mask at the slide box size", async () => {
    expect(await probeImageInfo(MEDIA_ASSETS.slideMask)).toEqual({
      width: SLIDE_BOX.width,
      height: SLIDE_BOX.height,
      pixFmt: "rgba",
    });
  });

  it("ships a padded RGBA shadow behind the slide", async () => {
    const info = await probeImageInfo(MEDIA_ASSETS.slideShadow);
    expect(info.pixFmt).toBe("rgba");
    expect(info.width).toBeGreaterThan(SLIDE_BOX.width);
    expect(info.height).toBeGreaterThan(SLIDE_BOX.height);
  });

  it("ships a full-frame RGBA vignette", async () => {
    expect(await probeImageInfo(MEDIA_ASSETS.vignette)).toEqual({
      width: COMPOSED_WIDTH,
      height: COMPOSED_HEIGHT,
      pixFmt: "rgba",
    });
  });
});
