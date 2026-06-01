/*
  assets/js/nexus-vanguard-requirement-library.js
  Project-wide Vanguard requirement library

  Purpose:
  - One shared local-first requirement store for CCS, Torque, Meg, L2, Pre-FOD, FPV, and Package Export.
  - Captures extracted requirements from documents and AI analysis.
  - Preserves approval/review state so field enforcement only uses approved or explicitly reviewed rules.
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;

  var VERSION = '1.0.0';
  var STORAGE_KEY = 'nexus_vanguard_requirement_library_v1';
  var AUDIT_KEY = 'nexus_vanguard_requirement_audit_v1';

  function now(){ return new Date().toISOString(); }
  function parse(raw, fallback){ try { return raw ? JSON.parse(raw) : fallback; } catch(e){ return fallback; } }
  function text(v){ return String(v == null ? '' : v).trim(); }
  function norm(v){ return text(v).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
  function id(prefix){ return (prefix || 'req') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8); }

  function load(){
    var lib = parse(localStorage.getItem(STORAGE_KEY), null);
    if (!lib || typeof lib !== 'object') lib = { version: VERSION, updatedAt: now(), requirements: [] };
    if (!Array.isArray(lib.requirements)) lib.requirements = [];
    return lib;
  }

  function save(lib){
    lib = lib || load();
    lib.version = VERSION;
    lib.updatedAt = now();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(lib)); } catch(e) {}
    try {
      if (window.NEXUS_OFFLINE && typeof window.NEXUS_OFFLINE.saveLocal === 'function') {
        window.NEXUS_OFFLINE.saveLocal('vanguard/requirements/library', lib, 'requirement-library');
      }
      if (window.NEXUS_FIREBASE && typeof window.NEXUS_FIREBASE.save === 'function') {
        window.NEXUS_FIREBASE.save('vanguard/requirements/library', lib);
      }
    } catch(e) {}
    window.dispatchEvent(new CustomEvent('nexus:vanguard-requirements-updated', { detail: lib }));
    return lib;
  }

  function audit(action, detail){
    var list = parse(localStorage.getItem(AUDIT_KEY), []);
    list.push({ id:id('audit'), action:action, detail:detail || {}, at:now() });
    if (list.length > 500) list = list.slice(list.length - 500);
    try { localStorage.setItem(AUDIT_KEY, JSON.stringify(list)); } catch(e) {}
  }

  function fingerprint(req){
    return [
      norm(req.type || req.category || 'general'),
      norm(req.equipmentType || req.eqType || req.scope || 'global'),
      norm(req.system || ''),
      text(req.value == null ? '' : req.value),
      norm(req.unit || ''),
      norm(req.text || req.description || req.title || '')
    ].join('|');
  }

  function normalizeRequirement(req, source){
    req = req || {};
    var out = Object.assign({}, req);
    out.id = out.id || id('req');
    out.type = text(out.type || out.category || 'general');
    out.title = text(out.title || out.name || out.text || out.description || out.type);
    out.text = text(out.text || out.description || out.title);
    out.unit = text(out.unit || '');
    out.source = Object.assign({}, typeof source === 'object' ? source : {}, typeof out.source === 'object' ? out.source : { name:text(out.source || '') });
    out.sourceName = text(out.sourceName || out.source.name || out.documentName || out.filename || 'Unknown Source');
    out.sourceType = text(out.sourceType || out.source.type || out.documentType || 'document');
    out.confidence = Math.max(0, Math.min(1, Number(out.confidence == null ? 0.5 : out.confidence)));
    out.state = text(out.state || 'review');
    out.approved = !!out.approved || out.state === 'approved';
    out.enforce = !!out.enforce || out.approved;
    out.createdAt = out.createdAt || now();
    out.updatedAt = now();
    out.fingerprint = out.fingerprint || fingerprint(out);
    return out;
  }

  function upsert(requirements, source){
    var incoming = Array.isArray(requirements) ? requirements : [requirements];
    var lib = load();
    var byFp = new Map(lib.requirements.map(function(r){ return [r.fingerprint || fingerprint(r), r]; }));
    var added = 0;
    var updated = 0;

    incoming.filter(Boolean).forEach(function(raw){
      var req = normalizeRequirement(raw, source);
      var existing = byFp.get(req.fingerprint);
      if (existing) {
        Object.assign(existing, req, {
          id: existing.id,
          createdAt: existing.createdAt || req.createdAt,
          updatedAt: now(),
          state: existing.approved ? 'approved' : (req.state || existing.state || 'review'),
          approved: !!existing.approved || !!req.approved,
          enforce: !!existing.enforce || !!req.enforce
        });
        updated++;
      } else {
        lib.requirements.push(req);
        byFp.set(req.fingerprint, req);
        added++;
      }
    });

    save(lib);
    audit('upsert', { added:added, updated:updated, source:source || {} });
    return { library:lib, added:added, updated:updated };
  }

  function query(filter){
    filter = filter || {};
    var lib = load();
    return lib.requirements.filter(function(r){
      if (filter.type && norm(r.type) !== norm(filter.type)) return false;
      if (filter.state && norm(r.state) !== norm(filter.state)) return false;
      if (filter.approved != null && !!r.approved !== !!filter.approved) return false;
      if (filter.enforce != null && !!r.enforce !== !!filter.enforce) return false;
      if (filter.text && (JSON.stringify(r).toLowerCase().indexOf(String(filter.text).toLowerCase()) === -1)) return false;
      return true;
    });
  }

  function approve(ids, meta){
    ids = Array.isArray(ids) ? ids : [ids];
    var set = new Set(ids.map(text));
    var lib = load();
    var count = 0;
    lib.requirements.forEach(function(r){
      if (set.has(r.id)) {
        r.approved = true;
        r.enforce = true;
        r.state = 'approved';
        r.approvedAt = now();
        r.approvedBy = meta && (meta.user || meta.approvedBy) || 'Engineer';
        r.updatedAt = now();
        count++;
      }
    });
    save(lib);
    audit('approve', { ids:Array.from(set), count:count, meta:meta || {} });
    return count;
  }

  function ingestAnalysis(analysis, source){
    if (!analysis) return { added:0, updated:0, library:load() };
    var requirements = [];
    if (Array.isArray(analysis.requirements)) requirements = requirements.concat(analysis.requirements);
    if (analysis.result && Array.isArray(analysis.result.requirements)) requirements = requirements.concat(analysis.result.requirements);
    if (analysis.payload && Array.isArray(analysis.payload.requirements)) requirements = requirements.concat(analysis.payload.requirements);
    return upsert(requirements, source || analysis.document || analysis.source || {});
  }

  function consumeForValidation(type){
    return query({ type:type, approved:true, enforce:true });
  }

  window.NEXUS_REQUIREMENTS = {
    version:VERSION,
    load:load,
    save:save,
    upsert:upsert,
    query:query,
    approve:approve,
    ingestAnalysis:ingestAnalysis,
    consumeForValidation:consumeForValidation
  };

  window.addEventListener('nexus:vanguard-document-analyzed', function(ev){
    try { ingestAnalysis(ev.detail, ev.detail && ev.detail.document); } catch(e) { console.warn('Requirement ingestion failed', e); }
  });

  window.addEventListener('nexus:ccs-ai-analysis-saved', function(ev){
    try { ingestAnalysis(ev.detail, { name:'CCS AI Analysis', type:'ccs' }); } catch(e) {}
  });

  window.dispatchEvent(new CustomEvent('nexus:vanguard-requirement-library-ready', { detail:{ version:VERSION } }));
})();
