/*
  assets/js/nexus-vanguard-requirement-normalizer.js
  HyperCore / NEXUS Vanguard requirement schema normalizer

  Purpose:
  - Makes old/backend/document/AI requirement shapes enforceable through one canonical schema.
  - Does not call any backend.
  - Keeps AI extracted requirements in REVIEW until engineer-approved.
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.NEXUS_REQUIREMENT_NORMALIZER && window.NEXUS_REQUIREMENT_NORMALIZER.__installed) return;

  var VERSION = '1.0.0-front-end-hardening';

  function now(){ return new Date().toISOString(); }
  function clean(v){ return String(v == null ? '' : v).trim(); }
  function lower(v){ return clean(v).toLowerCase(); }
  function toNum(v){
    if (v == null || v === '') return null;
    var n = Number(String(v).replace(/[^0-9.\-]/g,''));
    return isFinite(n) ? n : null;
  }
  function id(prefix){ return (prefix || 'req') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8); }

  function normalizeCitation(c){
    c = c || {};
    return {
      source: clean(c.source || c.sourceName || c.document || c.documentName || ''),
      locator: clean(c.locator || c.page || c.section || c.reference || ''),
      quote: clean(c.quote || c.excerpt || c.text || ''),
      confidence: Math.max(0, Math.min(1, Number(c.confidence == null ? .5 : c.confidence)))
    };
  }

  function normalizeRequirement(raw, source){
    raw = raw || {};
    source = source || {};
    var sourceObj = typeof raw.source === 'object' ? raw.source : {};
    var value = raw.value;
    if (value == null || value === '') value = raw.numericValue;
    if (value == null || value === '') value = raw.requiredValue;
    if (value == null || value === '') value = raw.minimumValue;

    var unit = clean(raw.unit || raw.units || raw.uom || raw.measurementUnit || '');
    var type = clean(raw.type || raw.requirementType || raw.category || raw.ruleType || 'general');
    var sourceName = clean(raw.sourceName || raw.documentName || raw.filename || raw.fileName || source.name || source.documentName || sourceObj.name || raw.source || 'Unknown Source');
    var sourceType = clean(raw.sourceType || raw.documentType || source.type || sourceObj.type || 'document');
    var page = clean(raw.page || raw.pageNumber || raw.sheet || '');
    var section = clean(raw.section || raw.specSection || raw.paragraph || raw.locator || '');

    var citations = [];
    if (Array.isArray(raw.citations)) citations = raw.citations.map(normalizeCitation);
    if (!citations.length && (sourceName || page || section || raw.quote || raw.text)) {
      citations.push(normalizeCitation({
        source: sourceName,
        locator: [page ? 'p. ' + page : '', section].filter(Boolean).join(' '),
        quote: raw.quote || raw.excerpt || raw.text || raw.description || '',
        confidence: raw.confidence
      }));
    }

    var state = clean(raw.state || raw.status || 'review');
    var approved = !!raw.approved || lower(state) === 'approved';

    return {
      id: clean(raw.id || raw.requirementId) || id('req'),
      type: type,
      requirementType: type,
      title: clean(raw.title || raw.name || raw.text || raw.description || type || 'Requirement'),
      text: clean(raw.text || raw.description || raw.requirement || raw.title || ''),
      value: toNum(value),
      numericValue: toNum(value),
      unit: unit,
      units: unit,
      comparator: clean(raw.comparator || raw.operator || raw.compare || ''),
      tolerancePercent: toNum(raw.tolerancePercent || raw.tolerance || raw.allowedTolerancePercent),
      equipmentType: clean(raw.equipmentType || raw.eqType || raw.scope || ''),
      system: clean(raw.system || raw.bus || raw.circuit || ''),
      sourceName: sourceName,
      sourceType: sourceType,
      source: { name: sourceName, type: sourceType, page: page, section: section },
      page: page,
      section: section,
      confidence: Math.max(0, Math.min(1, Number(raw.confidence == null ? .5 : raw.confidence > 1 ? raw.confidence / 100 : raw.confidence))),
      state: approved ? 'approved' : (state || 'review'),
      approved: approved,
      enforce: !!raw.enforce || approved,
      citations: citations,
      createdAt: raw.createdAt || now(),
      updatedAt: now()
    };
  }

  function normalizeList(list, source){
    return (Array.isArray(list) ? list : []).filter(Boolean).map(function(item){ return normalizeRequirement(item, source); });
  }

  function normalizeAnalysis(analysis, source){
    analysis = analysis || {};
    var next = Object.assign({}, analysis);
    next.requirements = normalizeList(analysis.requirements || [], source || analysis.document || analysis.source || {});
    if (next.result && Array.isArray(next.result.requirements)) next.result.requirements = normalizeList(next.result.requirements, source || next.document || {});
    if (next.payload && Array.isArray(next.payload.requirements)) next.payload.requirements = normalizeList(next.payload.requirements, source || next.document || {});
    return next;
  }

  function installRequirementLibraryPatch(){
    if (!window.NEXUS_REQUIREMENTS || window.NEXUS_REQUIREMENTS.__normalizerPatched) return false;
    var originalUpsert = window.NEXUS_REQUIREMENTS.upsert;
    var originalIngest = window.NEXUS_REQUIREMENTS.ingestAnalysis;

    if (typeof originalUpsert === 'function') {
      window.NEXUS_REQUIREMENTS.upsert = function(requirements, source){
        var normalized = Array.isArray(requirements)
          ? normalizeList(requirements, source)
          : normalizeRequirement(requirements, source);
        return originalUpsert.call(window.NEXUS_REQUIREMENTS, normalized, source);
      };
    }

    if (typeof originalIngest === 'function') {
      window.NEXUS_REQUIREMENTS.ingestAnalysis = function(analysis, source){
        return originalIngest.call(window.NEXUS_REQUIREMENTS, normalizeAnalysis(analysis, source), source);
      };
    }

    window.NEXUS_REQUIREMENTS.__normalizerPatched = true;
    return true;
  }

  var api = {
    __installed:true,
    version:VERSION,
    normalizeRequirement:normalizeRequirement,
    normalizeList:normalizeList,
    normalizeAnalysis:normalizeAnalysis,
    installRequirementLibraryPatch:installRequirementLibraryPatch
  };

  window.NEXUS_REQUIREMENT_NORMALIZER = api;
  window.VanguardRequirementNormalizer = api;
  window.NEXUS = window.NEXUS || {};
  window.NEXUS.RequirementNormalizer = api;

  function boot(){ installRequirementLibraryPatch(); }
  window.addEventListener('nexus:vanguard-requirement-library-ready', boot);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
