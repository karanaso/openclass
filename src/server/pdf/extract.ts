import { extractText, getDocumentProxy } from "unpdf";

export type ExtractedPage = { pageNumber: number; text: string };

export async function extractPdfPages(bytes: Uint8Array): Promise<ExtractedPage[]> {
  const pdf = await getDocumentProxy(bytes);
  const result = await extractText(pdf, { mergePages: false });
  const texts = Array.isArray(result.text) ? result.text : [result.text];
  return texts.map((text, index) => ({ pageNumber: index + 1, text: String(text ?? "").trim() }));
}

export async function getPdfPageCount(bytes: Uint8Array): Promise<number> {
  const pdf = await getDocumentProxy(bytes);
  return pdf.numPages;
}
