import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFString, StandardFonts } from "pdf-lib";
import { extractPdfPages } from "@/server/pdf/extract";
import {
  MAX_QR_IMAGES_PER_PAGE,
  MAX_QR_IMAGE_DIMENSION,
  MAX_QR_IMAGE_PIXELS,
  discoverResourceCandidates,
  qrImageWithinLimits,
  toRgba,
} from "@/server/pdf/resources";
import { MAX_RESOURCES_PER_LESSON } from "@/lib/resources";

async function makePdf(options: {
  lines?: string[];
  imagePath?: string;
  annotationUrl?: string;
} = {}): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([600, 500]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const lines = options.lines ?? ["Lesson material"];
  const compact = lines.length > 25;
  const size = compact ? 8 : 12;
  const spacing = compact ? 7 : 20;

  lines.forEach((line, index) => {
    page.drawText(line, { x: 40, y: 470 - index * spacing, size, font, maxWidth: 520 });
  });

  if (options.imagePath) {
    const image = await document.embedPng(readFileSync(options.imagePath));
    page.drawImage(image, { x: 40, y: 80, width: 160, height: 160 });
  }

  if (options.annotationUrl) {
    const annotation = document.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [40, 40, 220, 60],
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(options.annotationUrl) },
    });
    const reference = document.context.register(annotation);
    const annots = document.context.obj([reference]);
    page.node.set(PDFName.of("Annots"), annots);
  }

  return new Uint8Array(await document.save());
}

async function discover(bytes: Uint8Array) {
  const pages = await extractPdfPages(bytes.slice());
  return {
    pages,
    candidates: await discoverResourceCandidates(bytes, pages),
  };
}

describe("PDF resource discovery", () => {
  it("finds text URLs, deduplicates across pages, and uses line titles", async () => {
    const bytes = await makePdf({
      lines: ["Study guide: https://example.com/study-guide", "www.example.org/reference"],
    });
    const secondPage = await PDFDocument.load(bytes);
    const extra = secondPage.addPage([600, 300]);
    const font = await secondPage.embedFont(StandardFonts.Helvetica);
    extra.drawText("Repeat https://example.com/study-guide", { x: 40, y: 240, size: 12, font });
    const combined = new Uint8Array(await secondPage.save());

    const { candidates } = await discover(combined);

    const study = candidates.filter((candidate) => candidate.url === "https://example.com/study-guide");
    expect(study).toHaveLength(1);
    expect(study[0]).toMatchObject({ source: "TEXT", sourcePage: 1, title: "Study guide" });

    const reference = candidates.find((candidate) => candidate.url === "https://www.example.org/reference");
    expect(reference).toBeDefined();
    expect(reference?.title).toBe("reference");
  });

  it("decodes a QR code embedded as a page image", async () => {
    const bytes = await makePdf({ imagePath: "tests/fixtures/qr-resource.png" });
    const { candidates } = await discover(bytes);

    expect(candidates).toContainEqual({
      url: "https://example.com/qr-resource",
      title: "qr resource",
      source: "QR",
      sourcePage: 1,
    });
  });

  it("ignores QR payloads that are not web URLs", async () => {
    const bytes = await makePdf({ imagePath: "tests/fixtures/qr-invalid.png" });
    const { candidates } = await discover(bytes);

    expect(candidates).toEqual([]);
  });

  it("finds URI link annotations with their page", async () => {
    const bytes = await makePdf({
      lines: ["Link page"],
      annotationUrl: "https://example.com/annotated-resource",
    });
    const { candidates } = await discover(bytes);

    expect(candidates).toContainEqual({
      url: "https://example.com/annotated-resource",
      title: "annotated resource",
      source: "ANNOTATION",
      sourcePage: 1,
    });
  });

  it("caps the number of discovered resources", async () => {
    const lines = Array.from({ length: 60 }, (_, index) => `https://example.com/resource-${index}`);
    const bytes = await makePdf({ lines });
    const { candidates } = await discover(bytes);

    expect(candidates).toHaveLength(MAX_RESOURCES_PER_LESSON);
  });

  it("applies QR image dimension and pixel caps", () => {
    expect(qrImageWithinLimits(1000, 1000)).toBe(true);
    expect(qrImageWithinLimits(MAX_QR_IMAGE_DIMENSION, 100)).toBe(true);
    expect(qrImageWithinLimits(MAX_QR_IMAGE_DIMENSION + 1, 100)).toBe(false);
    expect(qrImageWithinLimits(5000, 5000)).toBe(false);
    expect(qrImageWithinLimits(0, 100)).toBe(false);
    expect(MAX_QR_IMAGES_PER_PAGE).toBeGreaterThan(0);
    expect(MAX_QR_IMAGE_PIXELS).toBe(16_000_000);
  });

  it("expands 1- and 3-channel image data to RGBA", () => {
    const gray = toRgba({ data: new Uint8ClampedArray([7, 9]), width: 2, height: 1, channels: 1 });
    expect(Array.from(gray ?? [])).toEqual([7, 7, 7, 255, 9, 9, 9, 255]);

    const rgb = toRgba({ data: new Uint8ClampedArray([1, 2, 3]), width: 1, height: 1, channels: 3 });
    expect(Array.from(rgb ?? [])).toEqual([1, 2, 3, 255]);

    const rgba = new Uint8ClampedArray([4, 5, 6, 7]);
    expect(toRgba({ data: rgba, width: 1, height: 1, channels: 4 })).toBe(rgba);
  });
});
