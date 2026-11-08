export function shareUrl(input: { origin: string; locale: string; token: string }): string {
  return `${input.origin}/${input.locale}/s/${input.token}`;
}

export type ShareLinkCopyState = "copyable" | "unavailable" | "hidden";

export function shareLinkCopyState(
  link: { token: string | null; revokedAt: string | null; expiresAt: string | null },
  now: number = Date.now(),
): ShareLinkCopyState {
  if (link.revokedAt) return "hidden";
  if (link.expiresAt && new Date(link.expiresAt).getTime() < now) return "hidden";
  return link.token ? "copyable" : "unavailable";
}
