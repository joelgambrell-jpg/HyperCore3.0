/*
  assets/js/nexus-vanguard-auto-document-intake.js
  User-friendly automatic document intake for NEXUS Vanguard.

  Field behavior:
  - User drops/selects files.
  - System extracts what it can locally.
  - AI/local fallback analyzes extracted text.
  - Requirements go to review automatically.
  - Conflicts/readiness update automatically.
  - Unclear/scanned docs are routed to review without pretending they were parsed.
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;

  var VERSION = '1.0.0';
  var PANEL_ID = 'nexusVanguardAutoDocumentIntake';
  var STATUS_ID = 'nexusVanguardAutoDocumentStatus';

  function now(){ return new Date().toISOString(); }
  function text(v){ return String(v == null ? '' : v).trim(); }
  function qs(){ try { return new URLSearchParams(location.search); } catch(e){ return new URLSearchParams(''); } }
  function eq(){ return text(qs().get('eq') || localStorage.getItem('nexus_active_equipment') || localStorage.getItem('nexus_active_eq') || 'GENERAL'); }
  function project(){ return text(localStorage.getItem('nexus_active_project') || localStorage.getItem('nexus_project_name') || 'DEFAULT_PROJECT'); }

  function setStatus(message, tone){
    var el = document.getElementById(STATUS_ID);
    if (!el) return;
    el.textContent = message;
    el.style.color = tone === 'bad' ? '#fecaca' : tone === 'good' ? '#bbf7d0' : tone === 'warn' ? '#fde68a' : '#e0f2fe';
  }

  function ensurePanel(){
    if (document.getElementById(PANEL_ID)) return document.getElementById(PANEL_ID);
    if (!document.body) return null;

    var host = document.querySelector('main') || document.querySelector('.wrap') || document.querySelector('.container') || document.body;
    var panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.style.cssText = 'margin:14px auto;padding:14px;border-radius:18px;border:1px solid rgba(125,211,252,.55);background:rgba(8,18,36,.90);color:#e0f2fe;max-width:1180px;font-family:Arial,Helvetica,sans-serif;box-shadow:0 10px 28px rgba(0,0,0,.28);display:grid;gap:10px;';
    panel.innerHTML = '' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">' +
        '<div><div style="font-size:18px;font-weight:900;">NEXUS Vanguard Document Intake</div>' +
        '<div id="' + STATUS_ID + '" style="font-size:13px;line-height:1.35;opacity:.95;">Drop specs, submittals, drawings, or text documents here. Vanguard will sort them.</div></div>' +
        '<label style="display:inline-flex;align-items:center;gap:8px;padding:10px 12px;border-radius:12px;background:#38bdf8;color:#03121f;font-weight:900;cursor:pointer;">Choose Files<input id="nexusVanguardAutoDocInput" type="file" multiple style="display:none;"></label>' +
      '</div>' +
      '<div id="nexusVanguardAutoDocDrop" style="padding:18px;border:2px dashed rgba(125,211,252,.65);border-radius:16px;text-align:center;font-weight:900;background:rgba(255,255,255,.06);">Drop files here</div>' +
      '<div id="nexusVanguardAutoDocResults" style="display:grid;gap:8px;"></div>';

    if (host.firstChild) host.insertBefore(panel, host.firstChild); else host.appendChild(panel);

    var input = document.getElementById('nexusVanguardAutoDocInput');
    var drop = document.getElementById('nexusVanguardAutoDocDrop');
    if (input) input.addEventListener('change', function(){ processFiles(input.files); input.value = ''; });
    if (drop) {
      drop.addEventListener('dragover', function(ev){ ev.preventDefault(); drop.style.background = 'rgba(56,189,248,.16)'; });
      drop.addEventListener('dragleave', function(){ drop.style.background = 'rgba(255,255,255,.06)'; });
      drop.addEventListener('drop', function(ev){ ev.preventDefault(); drop.style.background = 'rgba(255,255,255,.06)'; processFiles(ev.dataTransfer && ev.dataTransfer.files); });
    }
    return panel;
  }

  function addResultCard(doc, analysis, libraryResult){
    var out = document.getElementById('nexusVanguardAutoDocResults');
    if (!out) return;
    var state = analysis && analysis.state || doc.status || 'review';
    var reqCount = analysis && Array.isArray(analysis.requirements) ? analysis.requirements.length : (doc.requirements || []).length;
    var color = state === 'blocked' || state === 'missing-info' || doc.status === 'OCR_OR_BACKEND_REQUIRED' ? '#fde68a' : reqCount ? '#bbf7d0' : '#e0f2fe';
    var card = document.createElement('div');
    card.style.cssText = 'padding:10px;border-radius:12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);';
    card.innerHTML = '<div style="font-weight:900;color:' + color + ';">' + escapeHtml(doc.name || 'Document') + '</div>' +
      '<div style="font-size:13px;opacity:.94;">Status: ' + escapeHtml(state.toUpperCase()) + ' • Requirements found: ' + reqCount + '</div>' +
      '<div style="font-size:12px;opacity:.82;">' + escapeHtml((analysis && analysis.summary) || (doc.notes && doc.notes.join(' ')) || 'Ready for review.') + '</div>';
    out.prepend(card);
  }

  function escapeHtml(s){
    return text(s).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; });
  }

  function normalizeForLibrary(req, doc){
    req = req || {};
    return Object.assign({}, req, {
      sourceName: req.sourceName || req.documentName || doc.name || 'Uploaded Document',
      sourceType: req.sourceType || doc.kind || doc.mimeType || 'document',
      documentId: req.documentId || doc.id || '',
      state: req.state || 'review',
      approved: false,
      enforce: false
    });
  }

  async function analyzeDoc(doc){
    var payload = {
      id: doc.id,
      name: doc.name,
      filename: doc.name,
      type: doc.kind || doc.mimeType || 'document',
      text: doc.extractedText || doc.text || '',
      metadata: { eq:eq(), project:project(), status:doc.status, extractionMethod:doc.extractionMethod }
    };

    if (window.VANGUARD_AI_BRIDGE && typeof window.VANGUARD_AI_BRIDGE.analyzeDocument === 'function') {
      return window.VANGUARD_AI_BRIDGE.analyzeDocument(payload);
    }
    if (window.NEXUS_AI_CLIENT && typeof window.NEXUS_AI_CLIENT.extractDocumentData === 'function') {
      return window.NEXUS_AI_CLIENT.extractDocumentData(payload);
    }
    if (window.NEXUS_VANGUARD_DOCUMENT_MAPPER && typeof window.NEXUS_VANGUARD_DOCUMENT_MAPPER.extractRequirementsFromText === 'function') {
      var reqs = window.NEXUS_VANGUARD_DOCUMENT_MAPPER.extractRequirementsFromText(payload.text, { name:doc.name, type:doc.kind });
      return { state:reqs.length ? 'review' : 'missing-info', summary:reqs.length ? 'Requirements extracted locally.' : 'No requirements found locally.', requirements:reqs, confidence:reqs.length ? 0.62 : 0.35 };
    }
    return { state:'review', summary:'No analysis engine loaded.', requirements:[], confidence:0.2 };
  }

  function ingestRequirements(analysis, doc){
    var reqs = [];
    if (analysis && Array.isArray(analysis.requirements)) reqs = analysis.requirements;
    if (!reqs.length && doc && Array.isArray(doc.requirements)) reqs = doc.requirements;
    reqs = reqs.map(function(r){ return normalizeForLibrary(r, doc); });
    if (window.NEXUS_REQUIREMENTS && typeof window.NEXUS_REQUIREMENTS.upsert === 'function' && reqs.length) {
      return window.NEXUS_REQUIREMENTS.upsert(reqs, { name:doc.name, type:doc.kind || doc.mimeType || 'document', documentId:doc.id });
    }
    return { added:0, updated:0 };
  }

  function refreshIntelligence(){
    try { if (window.NEXUS_VANGUARD_CONFLICTS && typeof window.NEXUS_VANGUARD_CONFLICTS.detect === 'function') window.NEXUS_VANGUARD_CONFLICTS.detect(); } catch(e){}
    try { if (window.NEXUS_VANGUARD_READINESS && typeof window.NEXUS_VANGUARD_READINESS.snapshot === 'function') window.NEXUS_VANGUARD_READINESS.snapshot(); } catch(e){}
    try { if (window.NEXUS_VANGUARD_VERIFY && typeof window.NEXUS_VANGUARD_VERIFY.verify === 'function') window.NEXUS_VANGUARD_VERIFY.verify(); } catch(e){}
  }

  async function processFiles(fileList){
    ensurePanel();
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return [];
    setStatus('Vanguard is reading ' + files.length + ' file(s)...', 'info');

    var results = [];
    for (var i=0;i<files.length;i++) {
      var file = files[i];
      try {
        setStatus('Reading ' + file.name + '...', 'info');
        var doc;
        if (window.NEXUS_VANGUARD_EXTRACTION && typeof window.NEXUS_VANGUARD_EXTRACTION.extractFile === 'function') {
          doc = await window.NEXUS_VANGUARD_EXTRACTION.extractFile(file);
        } else {
          doc = { id:'DOC-' + Date.now(), name:file.name, status:'REVIEW', notes:['Extraction engine not loaded.'] };
        }

        setStatus('Analyzing ' + doc.name + '...', 'info');
        var analysis = await analyzeDoc(doc);
        var libraryResult = ingestRequirements(analysis, doc);
        refreshIntelligence();
        addResultCard(doc, analysis, libraryResult);
        results.push({ doc:doc, analysis:analysis, library:libraryResult });
      } catch(err) {
        var failed = { id:'DOC-' + Date.now(), name:file.name, status:'REVIEW', notes:[err && err.message ? err.message : String(err)] };
        addResultCard(failed, { state:'review', summary:'File needs manual review: ' + failed.notes[0], requirements:[] }, null);
        results.push({ doc:failed, error:failed.notes[0] });
      }
    }

    var totalReqs = results.reduce(function(sum, r){ return sum + ((r.analysis && r.analysis.requirements && r.analysis.requirements.length) || 0); }, 0);
    setStatus('Done. ' + totalReqs + ' requirement(s) routed to review. Anything unclear was safely held for engineer review.', totalReqs ? 'good' : 'warn');
    window.dispatchEvent(new CustomEvent('nexus:vanguard-auto-document-intake-complete', { detail:{ results:results, requirementCount:totalReqs, completedAt:now() } }));
    return results;
  }

  function init(){
    var shouldShow = /vanguard|document|supporting|index|equipment|package|construction_check_sheet/i.test(location.pathname || '');
    if (shouldShow) ensurePanel();
  }

  window.NEXUS_VANGUARD_AUTO_DOCS = { version:VERSION, processFiles:processFiles, ensurePanel:ensurePanel, analyzeDoc:analyzeDoc, ingestRequirements:ingestRequirements };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
