export const RESOURCE_URL_MAX = 2000;
export const RESOURCE_TITLE_MAX = 200;
export const RESOURCE_DESCRIPTION_MAX = 500;
export const MAX_RESOURCES_PER_LESSON = 50;

export type ResourceKind = "LINK" | "YOUTUBE";

export type ParsedResourceUrl = {
  url: string;
  kind: ResourceKind;
  youtubeId: string | null;
  fingerprintInput: string;
};

export type ResourceUrlResult =
  | { ok: true; value: ParsedResourceUrl }
  | { ok: false; message: string };

const TRACKING_PARAMS = new Set(["fbclid", "gclid", "gclsrc", "mc_cid", "mc_eid", "igshid", "yclid"]);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function withScheme(value: string): string {
  return /^www\./i.test(value) ? `https://${value}` : value;
}

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith("utm_") || TRACKING_PARAMS.has(lower);
}

export function youtubeVideoId(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(withScheme(value.trim()));
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  let candidate: string | null = null;

  if (host === "youtu.be") {
    candidate = parsed.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts[0] === "watch") {
      candidate = parsed.searchParams.get("v");
    } else if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") {
      candidate = parts[1] ?? null;
    }
  }

  return candidate && YOUTUBE_ID.test(candidate) ? candidate : null;
}

export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0`;
}

export function parseResourceUrl(value: string): ResourceUrlResult {
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, message: "A URL is required" };
  if (trimmed.length > RESOURCE_URL_MAX) {
    return { ok: false, message: `The URL must be ${RESOURCE_URL_MAX} characters or fewer` };
  }
  if (CONTROL_CHARS.test(trimmed)) {
    return { ok: false, message: "The URL contains invalid characters" };
  }

  let parsed: URL;
  try {
    parsed = new URL(withScheme(trimmed));
  } catch {
    return { ok: false, message: "Enter a valid HTTP or HTTPS URL" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, message: "Only HTTP and HTTPS links are supported" };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, message: "URLs with embedded credentials are not supported" };
  }

  parsed.hash = "";

  const keptParams: Array<[string, string]> = [];
  for (const [name, paramValue] of parsed.searchParams.entries()) {
    if (!isTrackingParam(name)) keptParams.push([name, paramValue]);
  }
  parsed.search = "";
  for (const [name, paramValue] of keptParams) parsed.searchParams.append(name, paramValue);
  parsed.searchParams.sort();

  if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  }

  const url = parsed.toString();
  const videoId = youtubeVideoId(url);

  if (videoId) {
    return {
      ok: true,
      value: { url, kind: "YOUTUBE", youtubeId: videoId, fingerprintInput: `youtube:${videoId}` },
    };
  }

  return {
    ok: true,
    value: { url, kind: "LINK", youtubeId: null, fingerprintInput: url },
  };
}

export function isSupportedResourceUrl(value: string): boolean {
  return parseResourceUrl(value).ok;
}

export function hostLabel(value: string): string {
  try {
    return new URL(withScheme(value)).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function readableSegment(segment: string): string {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // Keep the raw segment when it is not valid percent-encoding.
  }
  const cleaned = decoded
    .replace(/\.(html?|php|aspx?|jsp)$/i, "")
    .replace(/[-_+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned;
}

export function resourceTitleFromUrl(value: string, kind: ResourceKind): string {
  if (kind === "YOUTUBE") return "YouTube video";

  let parsed: URL;
  try {
    parsed = new URL(withScheme(value));
  } catch {
    return "Resource";
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const readable = readableSegment(segments[index]);
    if (readable.length >= 2 && !/^\d+$/.test(readable)) {
      return readable.slice(0, RESOURCE_TITLE_MAX);
    }
  }

  return hostLabel(parsed.toString()) || "Resource";
}
