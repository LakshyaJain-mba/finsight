// PDF text extraction using pdf-parse v2's PDFParse class.
import { PDFParse } from 'pdf-parse';

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // The constructor accepts a Node Buffer and converts it to a Uint8Array.
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return normalizeText(result.text ?? '');
  } finally {
    await parser.destroy();
  }
}

/**
 * Collapse the noisy whitespace typical of PDF extraction while preserving
 * paragraph breaks, so downstream chunking stays meaningful.
 */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
