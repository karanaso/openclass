import { PDFDocument, StandardFonts } from "pdf-lib";

export async function makeTestPdf(text = "Photosynthesis converts light energy into chemical energy."): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([600, 400]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 40, y: 340, size: 14, font, maxWidth: 520, lineHeight: 18 });
  page.drawText("Plants use chlorophyll to absorb light.", { x: 40, y: 280, size: 14, font, maxWidth: 520, lineHeight: 18 });
  return new Uint8Array(await document.save());
}
