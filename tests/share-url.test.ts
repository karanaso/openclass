import { describe, expect, it } from "vitest";
import { shareLinkCopyState, shareUrl } from "@/lib/share-url";

describe("shareUrl", () => {
  it("composes the localized student URL", () => {
    expect(
      shareUrl({ origin: "https://lessonlab.example", locale: "el", token: "abc_DEF-123" }),
    ).toBe("https://lessonlab.example/el/s/abc_DEF-123");
  });
});

describe("shareLinkCopyState", () => {
  const now = Date.parse("2026-11-08T12:00:00.000Z");

  it("allows copying an active link with a stored token", () => {
    expect(shareLinkCopyState({ token: "abc", revokedAt: null, expiresAt: null }, now)).toBe("copyable");
    expect(
      shareLinkCopyState({ token: "abc", revokedAt: null, expiresAt: "2026-11-09T12:00:00.000Z" }, now),
    ).toBe("copyable");
  });

  it("hides copy for revoked and expired links", () => {
    expect(
      shareLinkCopyState({ token: "abc", revokedAt: "2026-11-08T11:00:00.000Z", expiresAt: null }, now),
    ).toBe("hidden");
    expect(
      shareLinkCopyState({ token: "abc", revokedAt: null, expiresAt: "2026-11-08T11:00:00.000Z" }, now),
    ).toBe("hidden");
  });

  it("marks active links without a stored token as unavailable", () => {
    expect(shareLinkCopyState({ token: null, revokedAt: null, expiresAt: null }, now)).toBe("unavailable");
  });
});
