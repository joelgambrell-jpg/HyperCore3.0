/*
  assets/js/vanguard_document_intelligence_layer.js
  HyperCore / NEXUS Vanguard Document Intelligence Layer

  Front-end only. No Firebase Functions. No Gemini backend.

  Purpose:
  - Orchestrates existing Vanguard document intake, extraction, requirement normalizing,
    requirement storage, conflict detection, and alert queue handoff.
  - Provides the front-end contract the future Firebase/Gemini backend can plug into.
  - Keeps AI/document outputs in REVIEW until human approval.
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_DOCUMENT_INTELLIGENCE && window.NEXUS_VANGUARD_DOCUMENT_INTELLIGENCE.__installed) return;

  var VERSION = '1.0.0-front-end-document-intelligence';
  var DOC_KEY = 'nexus_vanguard_documents';
  var REQ_KEY = 'nexus_vanguard_requirements';
  var REVIEW_KEY = 'nexus_vanguard_requirement_review_queue_v1';
  var CONFLICT_KEY = 'nexus_vanguard_conflicts_v1';
  var ALERT_KEY = 'nexus_vanguard_alert_queue_v1';

  function clean(v){ return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
  function upper(v){ return clean(v).toUpperCase(); }
  function nowISO(){ return new Date().toISOString(); }
  function id(prefix){ return (prefix || 'VGD') + '-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2,8).toUpperCase(); }

  function readJSON(key, fallback){
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch(e){ return fallback; }
  }
  function writeJSON(key, value){
    try { localStorage.setItem(key, JSON.stringify(value)); } catch(e) {}
    return value;
  }

  function getEq(){
    try {
      var p = new URLSearchParams(location.search);
      var fromUrl = clean(p.get('eq') || p.get('equipment') || p.get('equipmentId'));
      if (fromUrl) return fromUrl;
    } catch(e) {}
    return clean(localStorage.getItem('nexus_active_equipment') || localStorage.getItem('nexus_active_eq') || 'NO_EQ') || 'NO_EQ';
  }

  function sourceTypeFromName(name){
    var n = upper(name);
    if (/SPEC|PROJECT REQUIREMENT|AWS|GRAY/.test(n)) return 'PROJECT_SPEC';
    if (/SUBMITTAL|OEM|MANUFACTURER|CUT SHEET|CUTSHEET|EATON|SCHNEIDER|SIEMENS|ABB/.test(n)) return 'MANUFACTURER_SUBMITTAL';
    if (/RFI/.test(n)) return 'RFI';
    if (/DRAWING|PRINT|E-|M-|P-/.test(n)) return 'DRAWING';
    if (/SOP|MOP|PROCEDURE/.test(n)) return 'PROCEDURE';
    return 'DOCUMENT';
  }

  function normalizeRequirement(raw, doc){
    if (window.NEXUS_REQUIREMENT_NORMALIZER && typeof window.NEXUS_REQUIREMENT_NORMALIZER.normalizeRequirement === 'function') {
      return window.NEXUS_REQUIREMENT_NORMALIZER.normalizeRequirement(raw, doc || {});
    }

    raw = raw || {};
    doc = doc || {};
    return {
      id: clean(raw.id) || id('REQ'),
      type: clean(raw.type || raw.requirementType || 'GENERAL'),
      requirementType: clean(raw.requirementType || raw.type || 'GENERAL'),
      title: clean(raw.title || raw.exactText || raw.text || raw.value || 'Requirement'),
      text: clean(raw.text || raw.exactText || raw.value || ''),
      value: raw.numericValue != null ? Number(raw.numericValue) : raw.value,
      numericValue: raw.numericValue != null ? Number(raw.numericValue) : null,
      unit: clean(raw.unit || raw.units || ''),
      units: clean(raw.units || raw.unit || ''),
      sourceName: clean(raw.sourceName || raw.sourceDocument || doc.name || doc.fileName || 'Uploaded Document'),
      sourceType: clean(raw.sourceType || doc.sourceType || sourceTypeFromName(doc.name || doc.fileName || '')),
      sourceDocument: clean(raw.sourceDocument || doc.name || doc.fileName || ''),
      page: clean(raw.page || ''),
      section: clean(raw.section || ''),
      confidence: Number(raw.confidence == null ? 0.65 : raw.confidence > 1 ? raw.confidence / 100 : raw.confidence),
      state: 'review',
      approved: false,
      enforce: false,
      citations: [{
        source: clean(raw.sourceDocument || doc.name || doc.fileName || 'Uploaded Document'),
        locator: clean(raw.page ? 'p. ' + raw.page : (raw.line ? 'line ' + raw.line : '')),
        quote: clean(raw.exactText || raw.text || raw.value || ''),
        confidence: Number(raw.confidence == null ? 0.65 : raw.confidence > 1 ? raw.confidence / 100 : raw.confidence)
      }],
      createdAt: nowISO(),
      updatedAt: nowISO()
    };
  }

  function extractRequirements(text, doc){
    var requirements = [];
    if (window.NEXUS_VANGUARD_REQUIREMENT_EXTRACTOR && typeof window.NEXUS_VANGUARD_REQUIREMENT_EXTRACTOR.extract === 'function') {
      requirements = window.NEXUS_VANGUARD_REQUIREMENT_EXTRACTOR.extract(text || '', {
        documentName: doc.name || doc.fileName || '',
        sourceDocument: doc.name || doc.fileName || '',
        sourceType: doc.sourceType || sourceTypeFromName(doc.name || doc.fileName || ''),
        documentId: doc.id || ''
      }) || [];
    }
    return requirements.map(function(req){ return normalizeRequirement(req, doc); });
  }

  function readDocumentText(file){
    return new Promise(function(resolve){
      if (!file) { resolve(''); return; }
      var reader = new FileReader();
      reader.onload = function(ev){ resolve(String(ev.target && ev.target.result || '')); };
      reader.onerror = function(){ resolve(''); };
      if (/text|csv|json|xml|html|plain/i.test(file.type || '') || /\.(txt|csv|json|xml|html|htm|md)$/i.test(file.name || '')) {
        reader.readAsText(file);
      } else {
        resolve('');
      }
    });
  }

  function saveDocument(doc){
    var docs = readJSON(DOC_KEY, []);
    docs.push(doc);
    writeJSON(DOC_KEY, docs);
    if (window.VanguardDocumentIntake && typeof window.VanguardDocumentIntake.addDocument === 'function') {
      try { window.VanguardDocumentIntake.addDocument(doc); } catch(e) {}
    }
    return doc;
  }

  function saveRequirements(requirements){
    var existing = readJSON(REQ_KEY, {});
    var list = Array.isArray(existing) ? existing : Object.keys(existing || {}).map(function(k){ return existing[k]; });
    var byId = {};
    list.forEach(function(req){ if (req && req.id) byId[req.id] = req; });
    (requirements || []).forEach(function(req){ if (req && req.id) byId[req.id] = req; });
    writeJSON(REQ_KEY, byId);

    if (window.VanguardRequirementMapper && typeof window.VanguardRequirementMapper.setRequirement === 'function') {
      (requirements || []).forEach(function(req){ try { window.VanguardRequirementMapper.setRequirement(req.id, req); } catch(e) {} });
    }

    return Object.keys(byId).map(function(k){ return byId[k]; });
  }

  function saveReviewQueue(requirements, doc){
    var queue = readJSON(REVIEW_KEY, []);
    (requirements || []).forEach(function(req){
      queue.push({
        id: id('REV'),
        requirementId: req.id,
        status: 'REVIEW',
        reason: 'AI/local extraction requires engineer approval before enforcement.',
        equipmentId: getEq(),
        sourceDocument: req.sourceName || doc.name || doc.fileName || '',
        requirement: req,
        createdAt: nowISO()
      });
    });
    return writeJSON(REVIEW_KEY, queue);
  }

  function detectAndSaveConflicts(allRequirements){
    var conflicts = [];
    if (window.NEXUS_VANGUARD_CONFLICT_ENGINE && typeof window.NEXUS_VANGUARD_CONFLICT_ENGINE.findConflicts === 'function') {
      conflicts = window.NEXUS_VANGUARD_CONFLICT_ENGINE.findConflicts(allRequirements || []) || [];
      if (window.NEXUS_VANGUARD_CONFLICT_ENGINE.autoSelectConflicts) {
        conflicts = window.NEXUS_VANGUARD_CONFLICT_ENGINE.autoSelectConflicts(conflicts) || conflicts;
      }
    }
    writeJSON(CONFLICT_KEY, { conflicts:conflicts, updatedAt:nowISO(), source:'vanguard_document_intelligence_layer' });
    return conflicts;
  }

  function pushAlerts(result){
    var alerts = readJSON(ALERT_KEY, []);
    if (result.requirements.length) {
      alerts.push({ id:id('ALERT'), type:'REQUIREMENT_REVIEW', status:'OPEN', equipmentId:getEq(), message:result.requirements.length + ' extracted requirement(s) need engineer review.', sourceDocument:result.document.name, createdAt:nowISO() });
    }
    if (result.conflicts.length) {
      alerts.push({ id:id('ALERT'), type:'DOCUMENT_CONFLICT', status:'OPEN', equipmentId:getEq(), message:result.conflicts.length + ' document requirement conflict(s) require review.', sourceDocument:result.document.name, createdAt:nowISO() });
    }
    writeJSON(ALERT_KEY, alerts);
    return alerts;
  }

  async function ingestText(name, text, options){
    options = options || {};
    var doc = {
      id: id('DOC'),
      name: clean(name || 'Pasted Document'),
      fileName: clean(name || 'Pasted Document'),
      sourceType: clean(options.sourceType || sourceTypeFromName(name || '')),
      text: String(text || ''),
      textLength: String(text || '').length,
      equipmentId: clean(options.eq || getEq()),
      uploadedAt: nowISO(),
      extractionMode: 'FRONT_END_LOCAL_RULES',
      backendRequired: false
    };

    saveDocument(doc);
    var requirements = extractRequirements(doc.text, doc);
    var allRequirements = saveRequirements(requirements);
    var conflicts = detectAndSaveConflicts(allRequirements);
    saveReviewQueue(requirements, doc);

    var result = { document:doc, requirements:requirements, allRequirements:allRequirements, conflicts:conflicts, createdAt:nowISO() };
    pushAlerts(result);
    dispatch(result);
    return result;
  }

  async function ingestFile(file, options){
    options = options || {};
    var text = await readDocumentText(file);
    var binaryNeedsBackend = !text;
    var docName = file && file.name ? file.name : 'Uploaded Document';
    if (binaryNeedsBackend) {
      var doc = {
        id:id('DOC'), name:docName, fileName:docName,
        sourceType:clean(options.sourceType || sourceTypeFromName(docName)),
        text:'', textLength:0, equipmentId:clean(options.eq || getEq()), uploadedAt:nowISO(),
        extractionMode:'BACKEND_REQUIRED', backendRequired:true,
        backendReason:'PDF/image/Office document requires Firebase/Gemini/OCR backend extraction.'
      };
      saveDocument(doc);
      var emptyResult = { document:doc, requirements:[], allRequirements:saveRequirements([]), conflicts:detectAndSaveConflicts(saveRequirements([])), createdAt:nowISO(), backendRequired:true };
      pushAlerts(emptyResult);
      dispatch(emptyResult);
      return emptyResult;
    }
    return ingestText(docName, text, options);
  }

  function approveRequirement(requirementId, approver, reason){
    var data = readJSON(REQ_KEY, {});
    var req = data[requirementId];
    if (!req) return null;
    req.state = 'approved';
    req.approved = true;
    req.enforce = true;
    req.approvedBy = clean(approver || 'ENGINEER');
    req.approvedAt = nowISO();
    req.approvalReason = clean(reason || 'Approved for Vanguard enforcement.');
    data[requirementId] = req;
    writeJSON(REQ_KEY, data);
    dispatch({ approvedRequirement:req, createdAt:nowISO() });
    return req;
  }

  function rejectRequirement(requirementId, reviewer, reason){
    var data = readJSON(REQ_KEY, {});
    var req = data[requirementId];
    if (!req) return null;
    req.state = 'rejected';
    req.approved = false;
    req.enforce = false;
    req.rejectedBy = clean(reviewer || 'ENGINEER');
    req.rejectedAt = nowISO();
    req.rejectionReason = clean(reason || 'Rejected by reviewer.');
    data[requirementId] = req;
    writeJSON(REQ_KEY, data);
    dispatch({ rejectedRequirement:req, createdAt:nowISO() });
    return req;
  }

  function dispatch(detail){
    try { window.dispatchEvent(new CustomEvent('vanguard:document-intelligence:updated', { detail: detail || {} })); } catch(e) {}
  }

  function renderReviewPanel(mount){
    var host = typeof mount === 'string' ? document.querySelector(mount) : mount;
    if (!host) return null;
    var reqData = readJSON(REQ_KEY, {});
    var reqs = Object.keys(reqData || {}).map(function(k){ return reqData[k]; });
    var conflicts = (readJSON(CONFLICT_KEY, { conflicts:[] }).conflicts || []);
    host.innerHTML = '<section style="margin:14px 0;padding:16px;border-radius:18px;border:2px solid rgba(255,255,255,.22);background:#111827;color:#fff;font-family:Arial,Helvetica,sans-serif;">'
      + '<h2 style="margin:0 0 10px;font-size:22px;font-weight:1000;">Vanguard Document Intelligence</h2>'
      + '<div style="font-weight:900;margin-bottom:10px;">Requirements needing review: ' + reqs.filter(function(r){ return r && !r.approved && r.state !== 'rejected'; }).length + ' | Conflicts: ' + conflicts.length + '</div>'
      + reqs.slice(-20).reverse().map(function(req){
        return '<div style="margin:8px 0;padding:10px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);">'
          + '<b>' + escapeHtml(req.type || req.requirementType || 'Requirement') + '</b> — ' + escapeHtml(req.title || req.text || req.value || '')
          + '<br><span style="font-size:12px;opacity:.88;">Source: ' + escapeHtml(req.sourceName || req.sourceDocument || '') + ' ' + escapeHtml(req.page || req.section || '') + ' | State: ' + escapeHtml(req.state || 'review') + '</span>'
          + '</div>';
      }).join('')
      + '</section>';
    return host;
  }

  var api = {
    __installed:true,
    version:VERSION,
    ingestText:ingestText,
    ingestFile:ingestFile,
    extractRequirements:extractRequirements,
    saveRequirements:saveRequirements,
    detectAndSaveConflicts:detectAndSaveConflicts,
    approveRequirement:approveRequirement,
    rejectRequirement:rejectRequirement,
    renderReviewPanel:renderReviewPanel,
    keys:{ documents:DOC_KEY, requirements:REQ_KEY, reviewQueue:REVIEW_KEY, conflicts:CONFLICT_KEY, alerts:ALERT_KEY }
  };

  window.NEXUS_VANGUARD_DOCUMENT_INTELLIGENCE = api;
  window.VanguardDocumentIntelligence = api;
  window.NEXUS = window.NEXUS || {};
  window.NEXUS.VanguardDocumentIntelligence = api;

  try { window.dispatchEvent(new CustomEvent('vanguard:document-intelligence:ready', { detail:{ version:VERSION } })); } catch(e) {}
})();
