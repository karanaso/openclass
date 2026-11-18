import { describe, expect, it } from "vitest";
import {
  hostLabel,
  isSupportedResourceUrl,
  parseResourceUrl,
  resourceTitleFromUrl,
  youtubeEmbedUrl,
  youtubeVideoId,
} from "@/lib/resources";

const VIDEO_ID = "dQw4w9WgXcQ";

function parsed(value: string) {
  const result = parseResourceUrl(value);
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

describe("resource URL parsing", () => {
  it("accepts HTTP and HTTPS links and canonicalizes the host", () => {
    expect(parsed("https://Example.COM/Path")).toEqual({
      url: "https://example.com/Path",
      kind: "LINK",
      youtubeId: null,
      fingerprintInput: "https://example.com/Path",
    });
  });

  it("adds a scheme for www links", () => {
    expect(parsed("www.example.com/article").url).toBe("https://www.example.com/article");
  });

  it("removes fragments and trailing slashes", () => {
    expect(parsed("https://example.com/article/#section").url).toBe("https://example.com/article");
  });

  it("removes tracking parameters and sorts the rest", () => {
    const result = parsed("https://example.com/page?utm_source=news&b=2&a=1&fbclid=abc#top");
    expect(result.url).toBe("https://example.com/page?a=1&b=2");
    expect(result.fingerprintInput).toBe(result.url);
  });

  it("rejects unsupported schemes", () => {
    for (const value of ["javascript:alert(1)", "data:text/html,x", "mailto:a@example.com", "ftp://example.com"]) {
      const result = parseResourceUrl(value);
      expect(result.ok).toBe(false);
      expect(isSupportedResourceUrl(value)).toBe(false);
    }
  });

  it("rejects embedded credentials", () => {
    const result = parseResourceUrl("https://user:secret@example.com/");
    expect(result.ok).toBe(false);
  });

  it("rejects empty, oversized, and control-character URLs", () => {
    expect(parseResourceUrl("   ").ok).toBe(false);
    expect(parseResourceUrl(`https://example.com/${"a".repeat(2000)}`).ok).toBe(false);
    expect(parseResourceUrl("https://example.com/\u0000").ok).toBe(false);
  });
});

describe("YouTube recognition", () => {
  it.each([
    `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    `https://youtube.com/watch?v=${VIDEO_ID}&list=PL123`,
    `https://youtu.be/${VIDEO_ID}`,
    `https://www.youtube.com/shorts/${VIDEO_ID}`,
    `https://www.youtube.com/embed/${VIDEO_ID}`,
    `https://www.youtube.com/live/${VIDEO_ID}`,
    `https://m.youtube.com/watch?v=${VIDEO_ID}`,
    `https://music.youtube.com/watch?v=${VIDEO_ID}`,
  ])("recognizes %s", (value) => {
    const result = parsed(value);
    expect(result.kind).toBe("YOUTUBE");
    expect(result.youtubeId).toBe(VIDEO_ID);
    expect(result.fingerprintInput).toBe(`youtube:${VIDEO_ID}`);
    expect(youtubeVideoId(value)).toBe(VIDEO_ID);
  });

  it("keeps non-video YouTube pages as general links", () => {
    for (const value of ["https://www.youtube.com/@channel", "https://www.youtube.com/playlist?list=PL123"]) {
      const result = parsed(value);
      expect(result.kind).toBe("LINK");
      expect(result.youtubeId).toBeNull();
    }
  });

  it("rejects malformed YouTube identifiers", () => {
    expect(parsed(`https://youtu.be/short`).kind).toBe("LINK");
    expect(youtubeVideoId(`https://youtu.be/${VIDEO_ID}extra`)).toBeNull();
  });

  it("builds a privacy-enhanced embed URL", () => {
    expect(youtubeEmbedUrl(VIDEO_ID)).toBe(
      `https://www.youtube-nocookie.com/embed/${VIDEO_ID}?rel=0`,
    );
  });
});

describe("resource titles", () => {
  it("derives a readable title from the last path segment", () => {
    expect(resourceTitleFromUrl("https://example.com/study-guides/cell-biology", "LINK")).toBe(
      "cell biology",
    );
  });

  it("falls back to the host when there is no readable path", () => {
    expect(resourceTitleFromUrl("https://www.example.com/", "LINK")).toBe("example.com");
  });

  it("uses a readable YouTube title", () => {
    expect(resourceTitleFromUrl(`https://youtu.be/${VIDEO_ID}`, "YOUTUBE")).toBe("YouTube video");
  });

  it("exposes a host label without www", () => {
    expect(hostLabel("https://www.example.com/path")).toBe("example.com");
    expect(hostLabel("not a url")).toBe("");
  });
});
