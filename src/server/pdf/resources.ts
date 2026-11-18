import { extractImages, getDocumentProxy } from "unpdf";
import jsQR from "jsqr";
import { logger } from "@/lib/logger";
import {
  MAX_RESOURCES_PER_LESSON,
  parseResourceUrl,
  resourceTitleFromUrl,
  RESOURCE_TITLE_MAX,
} from "@/lib/resources";

export const MAX_QR_IMAGES_PER_PAGE = 8;
export const MAX_QR_IMAGE_DIMENSION = 4096;
export const MAX_QR_IMAGE_PIXELS = 16_000_000;

export type ResourceDiscoveryPage = { pageNumber: number; text: string };

export type DiscoveredResource = {
  url: string;
  title: string;
  source: "TEXT" | "ANNOTATION" | "QR";
  sourcePage: number;
};

export type QrImage = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  channels: 1 | 3 | 4;
};

const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;

export function qrImageWithinLimits(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  if (width > MAX_QR_IMAGE_DIMENSION || height > MAX_QR_IMAGE_DIMENSION) return false;
  return width * height <= MAX_QR_IMAGE_PIXELS;
}

function trimTrailingPunctuation(value: string): string {
  let result = value.replace(/[.,;:!?»”'"]+$/u, "");
  while (result.endsWith(")") && (result.match(/\(/g)?.length ?? 0) < (result.match(/\)/g)?.length ?? 0)) {
    result = result.slice(0, -1);
  }
  return result;
}

function titleFromLine(line: string, rawUrl: string): string {
  const withoutUrl = line.replace(rawUrl, " ").replace(/\s+/g, " ").trim();
  const cleaned = withoutUrl.replace(/^[\s:–—-]+|[\s:–—-]+$/g, "").trim();
  if (cleaned.length < 1 || cleaned.length > RESOURCE_TITLE_MAX) return "";
  if (/(?:https?:\/\/|www\.)/i.test(cleaned)) return "";
  return cleaned;
}

export function toRgba(image: QrImage): Uint8ClampedArray | null {
  const pixels = image.width * image.height;
  if (!Number.isFinite(pixels) || pixels <= 0) return null;

  if (image.channels === 4 && image.data.length >= pixels * 4) {
    return image.data;
  }

  const rgba = new Uint8ClampedArray(pixels * 4);
  if (image.channels === 1 && image.data.length >= pixels) {
    for (let index = 0; index < pixels; index += 1) {
      const value = image.data[index];
      rgba[index * 4] = value;
      rgba[index * 4 + 1] = value;
      rgba[index * 4 + 2] = value;
      rgba[index * 4 + 3] = 255;
    }
    return rgba;
  }

  if (image.channels === 3 && image.data.length >= pixels * 3) {
    for (let index = 0; index < pixels; index += 1) {
      rgba[index * 4] = image.data[index * 3];
      rgba[index * 4 + 1] = image.data[index * 3 + 1];
      rgba[index * 4 + 2] = image.data[index * 3 + 2];
      rgba[index * 4 + 3] = 255;
    }
    return rgba;
  }

  return null;
}

type Collector = Map<string, DiscoveredResource>;

function addCandidate(
  found: Collector,
  input: { rawUrl: string; title?: string; source: DiscoveredResource["source"]; sourcePage: number },
): boolean {
  if (found.size >= MAX_RESOURCES_PER_LESSON) return false;
  const normalized = parseResourceUrl(input.rawUrl);
  if (!normalized.ok) return true;
  if (found.has(normalized.value.fingerprintInput)) return true;

  const title = input.title?.trim();
  found.set(normalized.value.fingerprintInput, {
    url: normalized.value.url,
    title:
      (title ? title.slice(0, RESOURCE_TITLE_MAX) : "") ||
      resourceTitleFromUrl(normalized.value.url, normalized.value.kind),
    source: input.source,
    sourcePage: input.sourcePage,
  });
  return true;
}

function scanText(pages: ResourceDiscoveryPage[], found: Collector): void {
  for (const page of pages) {
    for (const line of page.text.split(/\r?\n/)) {
      const matches = line.match(URL_PATTERN);
      if (!matches) continue;
      for (const match of matches) {
        const rawUrl = trimTrailingPunctuation(match);
        if (!rawUrl) continue;
        const title = titleFromLine(line, match);
        const continueScanning = addCandidate(found, {
          rawUrl,
          title,
          source: "TEXT",
          sourcePage: page.pageNumber,
        });
        if (!continueScanning) return;
      }
    }
  }
}

function annotationUrl(annotation: Record<string, unknown>): string | null {
  const subtype = typeof annotation.subtype === "string" ? annotation.subtype : "";
  if (subtype.toLowerCase() !== "link") return null;
  const value = annotation.url ?? annotation.unsafeUrl;
  return typeof value === "string" ? value : null;
}

async function scanAnnotationsAndQr(bytes: Uint8Array, found: Collector): Promise<void> {
  const pdf = await getDocumentProxy(bytes.slice());
  const pageCount = pdf.numPages;

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    if (found.size >= MAX_RESOURCES_PER_LESSON) return;

    let page: Awaited<ReturnType<typeof pdf.getPage>> | null = null;
    try {
      page = await pdf.getPage(pageNumber);
      const annotations = (await page.getAnnotations()) as Array<Record<string, unknown>>;
      for (const annotation of annotations) {
        const url = annotationUrl(annotation);
        if (!url) continue;
        if (!addCandidate(found, { rawUrl: url, source: "ANNOTATION", sourcePage: pageNumber })) return;
      }
    } catch (error) {
      logger.warn({ pageNumber, err: error }, "could not read PDF link annotations");
    }

    try {
      const images = await extractImages(pdf, pageNumber);
      let inspected = 0;
      for (const image of images) {
        if (inspected >= MAX_QR_IMAGES_PER_PAGE) break;
        if (!qrImageWithinLimits(image.width, image.height)) continue;
        inspected += 1;

        const rgba = toRgba({
          data: image.data,
          width: image.width,
          height: image.height,
          channels: image.channels,
        });
        if (!rgba) continue;

        const decoded = jsQR(rgba, image.width, image.height);
        if (!decoded?.data) continue;
        if (!addCandidate(found, { rawUrl: decoded.data, source: "QR", sourcePage: pageNumber })) return;
      }
    } catch (error) {
      logger.warn({ pageNumber, err: error }, "could not decode QR images on PDF page");
    }
  }
}

export async function discoverResourceCandidates(
  bytes: Uint8Array,
  pages: ResourceDiscoveryPage[],
): Promise<DiscoveredResource[]> {
  const found: Collector = new Map();
  scanText(pages, found);

  try {
    await scanAnnotationsAndQr(bytes, found);
  } catch (error) {
    logger.warn({ err: error }, "could not scan PDF annotations or QR images");
  }

  return [...found.values()];
}
