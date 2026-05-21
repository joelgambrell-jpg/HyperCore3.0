/*
  assets/js/vanguard_extraction_engine.js
  NEXUS Vanguard Extraction Engine

  Purpose:
  - Real browser-side extraction where possible.
  - TXT/CSV/JSON/HTML/XML: extracted directly.
  - PDF: uses PDF.js if available; otherwise stores backend/OCR required status.
  - Images/scanned docs: flagged for OCR/backend instead of fake-parsed.
*/
(function(){
  'use strict';
  if (window.NEXUS_VANGUARD_EXTRACTION && window.NEXUS_VANGUARD_EXTRACTION.__installed) return;

  var VERSION = '0.2.0-extraction-engine';
  var DOC_KEY = 'nexus_vanguard_document_library_v2';

  function clean(v){ return String(v == null ? '' : v).trim(); }
  function lower(v){ return clean(v).toLowerCase(); }
  function nowISO(){ return new Date().toISOString(); }

  function safeJSON(raw, fallback){
    try { return JSON.parse(raw); } catch(e){ return fallback; }
  }

  function loadDocs(){
    try { return JSON.parse(localStorage.getItem(DOC_KEY) || '[]'); }
    catch(e){ return []; }
  }

  function saveDocs(items){
    localStorage.setItem(DOC_KEY, JSON.stringify(Array.isArray(items) ? items : []));
    try { window.dispatchEvent(new CustomEvent('vanguard:documents:updated', { detail: { count: items.length }})); } catch(e){}
    return items;
  }

  function getExtension(name){
    var n = lower(name || '');
    var parts = n.split('.');
    return parts.length > 1 ? parts.pop() : '';
  }

  function classifyFile(file){
    var name = file && file.name ? file.name : '';
    var type = file && file.type ? file.type : '';
    var ext = getExtension(name);

    if (type === 'application/pdf' || ext === 'pdf') return 'PDF';
    if (type.indexOf('image/') === 0 || ['png','jpg','jpeg','webp','tif','tiff','bmp'].indexOf(ext) !== -1) return 'IMAGE';
    if (['txt','csv','md','json','html','htm','xml'].indexOf(ext) !== -1) return 'TEXT';
    if (['xlsx','xls'].indexOf(ext) !== -1) return 'EXCEL';
    if (['doc','docx'].indexOf(ext) !== -1) return 'WORD';

    return 'UNKNOWN';
  }

  function readAsText(file){
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onload = function(){ resolve(String(reader.result || '')); };
      reader.onerror = function(){ reject(reader.error || new Error('File read failed')); };
      reader.readAsText(file);
    });
  }

  function readAsArrayBuffer(file){
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onload = function(){ resolve(reader.result); };
      reader.onerror = function(){ reject(reader.error || new Error('File read failed')); };
      reader.readAsArrayBuffer(file);
    });
  }

  async function extractPdfWithPdfJs(file){
    var pdfjs = window.pdfjsLib || window['pdfjs-dist/build/pdf'] || null;
    if (!pdfjs || typeof pdfjs.getDocument !== 'function') {
      return {
        text: '',
        method: 'PDFJS_NOT_AVAILABLE',
        status: 'OCR_OR_BACKEND_REQUIRED',
        pages: [],
        notes: ['PDF.js not available in this build. Send this file to backend extraction or add PDF.js.']
      };
    }

    var buffer = await readAsArrayBuffer(file);
    var loadingTask = pdfjs.getDocument({ data: buffer });
    var pdf = await loadingTask.promise;
    var pages = [];
    var text = '';

    for (var i = 1; i <= pdf.numPages; i += 1) {
      var page = await pdf.getPage(i);
      var content = await page.getTextContent();
      var pageText = content.items.map(function(item){ return item.str || ''; }).join(' ').replace(/\s+/g, ' ').trim();
      pages.push({ page: i, text: pageText });
      text += '\n\n[PAGE ' + i + ']\n' + pageText;
    }

    return {
      text: text.trim(),
      method: 'PDFJS_TEXT_EXTRACTION',
      status: text.trim() ? 'EXTRACTED' : 'OCR_OR_BACKEND_REQUIRED',
      pages: pages,
      notes: text.trim() ? [] : ['PDF had no extractable text; likely scanned/image-based. OCR required.']
    };
  }

  async function extractFile(file){
    var kind = classifyFile(file);
    var result = {
      id: 'DOC-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
      name: file.name || 'Unnamed Document',
      mimeType: file.type || '',
      size: file.size || 0,
      kind: kind,
      uploadedAt: nowISO(),
      status: 'PENDING',
      extractionMethod: '',
      extractedText: '',
      pages: [],
      requirements: [],
      notes: []
    };

    if (kind === 'TEXT') {
      var text = await readAsText(file);
      result.status = text ? 'EXTRACTED' : 'EMPTY';
      result.extractionMethod = 'BROWSER_TEXT_READ';
      result.extractedText = text;
    } else if (kind === 'PDF') {
      var pdf = await extractPdfWithPdfJs(file);
      result.status = pdf.status;
      result.extractionMethod = pdf.method;
      result.extractedText = pdf.text;
      result.pages = pdf.pages || [];
      result.notes = pdf.notes || [];
    } else if (kind === 'IMAGE') {
      result.status = 'OCR_OR_BACKEND_REQUIRED';
      result.extractionMethod = 'IMAGE_REQUIRES_OCR';
      result.notes = ['Image/scanned document requires OCR/backend extraction.'];
    } else if (kind === 'EXCEL') {
      result.status = 'USE_CCS_EXCEL_IMPORTER';
      result.extractionMethod = 'EXCEL_ROUTED_TO_CCS_IMPORTER';
      result.notes = ['Excel files should be processed through the CCS Excel importer.'];
    } else {
      result.status = 'UNSUPPORTED_NEEDS_BACKEND';
      result.extractionMethod = 'BACKEND_REQUIRED';
      result.notes = ['Unsupported document type requires backend parser.'];
    }

    if (window.VanguardRequirementExtractor && typeof window.VanguardRequirementExtractor.extract === 'function') {
      result.requirements = window.VanguardRequirementExtractor.extract(result.extractedText || '', {
        documentId: result.id,
        documentName: result.name,
        pages: result.pages || []
      });
    }

    var docs = loadDocs();
    docs.push(result);
    saveDocs(docs);

    if (window.VanguardDocumentIntake && typeof window.VanguardDocumentIntake.addDocument === 'function') {
      try { window.VanguardDocumentIntake.addDocument(result); } catch(e){}
    }

    return result;
  }

  async function extractFiles(fileList){
    var files = Array.prototype.slice.call(fileList || []);
    var out = [];
    for (var i = 0; i < files.length; i += 1) {
      out.push(await extractFile(files[i]));
    }
    return out;
  }

  var api = {
    __installed: true,
    version: VERSION,
    loadDocs: loadDocs,
    saveDocs: saveDocs,
    classifyFile: classifyFile,
    extractFile: extractFile,
    extractFiles: extractFiles
  };

  window.NEXUS_VANGUARD_EXTRACTION = api;
  window.VanguardExtractionEngine = api;
})();
