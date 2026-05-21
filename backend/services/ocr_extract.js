import { createWorker } from 'tesseract.js';

export async function extractOcrText(buffer, options = {}) {
  if (String(process.env.OCR_ENABLED || 'true') !== 'true') {
    return {
      status: 'OCR_DISABLED',
      method: 'TESSERACT',
      text: '',
      confidence: 0,
      notes: ['OCR is disabled by OCR_ENABLED=false.']
    };
  }

  const worker = await createWorker('eng');

  try {
    const result = await worker.recognize(buffer);
    const text = String(result?.data?.text || '').trim();
    const confidence = Number(result?.data?.confidence || 0);

    return {
      status: text ? 'EXTRACTED' : 'OCR_EMPTY',
      method: 'TESSERACT',
      text,
      confidence,
      notes: text ? [] : ['OCR did not return readable text.']
    };
  } catch (err) {
    return {
      status: 'OCR_FAILED',
      method: 'TESSERACT',
      text: '',
      confidence: 0,
      notes: [String(err && err.message ? err.message : err)]
    };
  } finally {
    await worker.terminate();
  }
}
