import { extractPdfText } from '../services/pdf_extract.js';
import { extractOcrText } from '../services/ocr_extract.js';
import { extractRequirementsLocally } from '../services/local_requirement_rules.js';
import { extractRequirementsWithAI } from '../services/ai_requirement_extract.js';

function ext(name = '') {
  const parts = String(name).toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

function classify(filename = '', mime = '') {
  const e = ext(filename);
  if (mime === 'application/pdf' || e === 'pdf') return 'PDF';
  if (mime.startsWith('image/') || ['png','jpg','jpeg','webp','tif','tiff','bmp'].includes(e)) return 'IMAGE';
  if (['txt','csv','md','json','html','htm','xml'].includes(e)) return 'TEXT';
  if (['xlsx','xls'].includes(e)) return 'EXCEL';
  return 'UNKNOWN';
}

async function partToBuffer(part) {
  const chunks = [];
  for await (const chunk of part.file) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export async function vanguardDocumentRoutes(app) {
  app.post('/documents/extract', async (request, reply) => {
    const parts = request.parts();
    const outputs = [];

    for await (const part of parts) {
      if (part.type !== 'file') continue;

      const buffer = await partToBuffer(part);
      const kind = classify(part.filename, part.mimetype);

      let extraction = {
        status: 'UNSUPPORTED',
        method: 'NONE',
        text: '',
        notes: []
      };

      if (kind === 'PDF') {
        extraction = await extractPdfText(buffer);
        if (!extraction.text) {
          const ocr = await extractOcrText(buffer);
          extraction = {
            status: ocr.text ? 'EXTRACTED_WITH_OCR' : 'OCR_REQUIRED_OR_FAILED',
            method: `PDF_PARSE + ${ocr.method}`,
            text: ocr.text,
            pageCount: extraction.pageCount || 0,
            notes: [...(extraction.notes || []), ...(ocr.notes || [])],
            ocrConfidence: ocr.confidence || 0
          };
        }
      } else if (kind === 'IMAGE') {
        const ocr = await extractOcrText(buffer);
        extraction = {
          status: ocr.text ? 'EXTRACTED_WITH_OCR' : 'OCR_REQUIRED_OR_FAILED',
          method: ocr.method,
          text: ocr.text,
          notes: ocr.notes || [],
          ocrConfidence: ocr.confidence || 0
        };
      } else if (kind === 'TEXT') {
        extraction = {
          status: 'EXTRACTED',
          method: 'TEXT_BUFFER',
          text: buffer.toString('utf8'),
          notes: []
        };
      } else if (kind === 'EXCEL') {
        extraction = {
          status: 'ROUTE_TO_CCS_EXCEL_IMPORTER',
          method: 'EXCEL_NOT_PARSED_HERE',
          text: '',
          notes: ['Excel CCS templates should use the frontend CCS Excel importer.']
        };
      }

      const sourceDocument = part.filename || 'uploaded-document';
      const localRequirements = extractRequirementsLocally(extraction.text || '', { sourceDocument });
      const ai = await extractRequirementsWithAI({
        text: extraction.text || '',
        sourceDocument,
        localRequirements
      });

      outputs.push({
        id: `DOC-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        filename: part.filename,
        mimeType: part.mimetype,
        kind,
        size: buffer.length,
        extraction,
        localRequirements,
        aiRequirements: ai.requirements,
        aiConflicts: ai.conflicts,
        aiStatus: ai.status,
        aiModel: ai.model,
        aiNotes: ai.notes,
        requirements: [...localRequirements, ...ai.requirements],
        createdAt: new Date().toISOString()
      });
    }

    return {
      ok: true,
      documents: outputs
    };
  });

  app.post('/requirements/extract-text', async (request) => {
    const body = request.body || {};
    const text = String(body.text || '');
    const sourceDocument = String(body.sourceDocument || 'manual-text');
    const localRequirements = extractRequirementsLocally(text, { sourceDocument });
    const ai = await extractRequirementsWithAI({ text, sourceDocument, localRequirements });

    return {
      ok: true,
      sourceDocument,
      localRequirements,
      aiRequirements: ai.requirements,
      aiConflicts: ai.conflicts,
      aiStatus: ai.status,
      aiModel: ai.model,
      aiNotes: ai.notes,
      requirements: [...localRequirements, ...ai.requirements]
    };
  });
}
