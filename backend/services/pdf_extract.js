import pdfParse from 'pdf-parse';

export async function extractPdfText(buffer) {
  const result = {
    status: 'PENDING',
    method: 'PDF_PARSE',
    text: '',
    pageCount: 0,
    notes: []
  };

  try {
    const parsed = await pdfParse(buffer);
    result.text = String(parsed.text || '').trim();
    result.pageCount = Number(parsed.numpages || 0);
    result.status = result.text ? 'EXTRACTED' : 'OCR_REQUIRED';

    if (!result.text) {
      result.notes.push('PDF contains no extractable text. It may be scanned or image-based.');
    }

    return result;
  } catch (err) {
    return {
      status: 'PDF_EXTRACT_FAILED',
      method: 'PDF_PARSE',
      text: '',
      pageCount: 0,
      notes: [String(err && err.message ? err.message : err)]
    };
  }
}
