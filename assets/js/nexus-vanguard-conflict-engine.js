/*
  assets/js/nexus-vanguard-conflict-engine.js
  Conflict + source hierarchy engine for NEXUS Vanguard.

  Detects contradictory extracted requirements and recommends the safest/stricter item by default.
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;

  var VERSION = '1.0.0';
  var STORE_KEY = 'nexus_vanguard_conflicts_v1';

  function now(){ return new Date().toISOString(); }
  function parse(raw, fallback){ try { return raw ? JSON.parse(raw) : fallback; } catch(e){ return fallback; } }
  function text(v){ return String(v == null ? '' : v).trim(); }
  function norm(v){ return text(v).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
  function id(prefix){ return (prefix || 'conflict') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8); }

  function cfg(){ return window.NEXUS_AI_CONFIG && window.NEXUS_AI_CONFIG.load ? window.NEXUS_AI_CONFIG.load() : { stricterRequirementWins:true, sourceHierarchy:['project-specification','approved-submittal','manufacturer-instructions','drawing','field-entry','manual-override'] }; }
  function allRequirements(){ return window.NEXUS_REQUIREMENTS && window.NEXUS_REQUIREMENTS.load ? window.NEXUS_REQUIREMENTS.load().requirements || [] : []; }

  function groupKey(r){
    return [norm(r.type || 'general'), norm(r.equipmentType || r.eqType || r.scope || 'global'), norm(r.system || '')].join('|');
  }

  function sourceRank(r){
    var c = cfg();
    var h = Array.isArray(c.sourceHierarchy) ? c.sourceHierarchy.map(norm) : [];
    var st = norm(r.sourceType || (r.source && r.source.type) || r.documentType || r.sourceName || 'unknown');
    var idx = h.indexOf(st);
    return idx === -1 ? 999 : idx;
  }

  function comparable(a,b){
    if (norm(a.type) !== norm(b.type)) return false;
    if (norm(a.unit) !== norm(b.unit)) return false;
    var av = Number(a.value), bv = Number(b.value);
    return isFinite(av) && isFinite(bv) && av !== bv;
  }

  function stricter(a,b){
    var type = norm(a.type);
    var av = Number(a.value), bv = Number(b.value);
    if (!isFinite(av)) return b;
    if (!isFinite(bv)) return a;
    if (type.indexOf('torque') !== -1) return av >= bv ? a : b;
    if (type.indexOf('meg') !== -1 || type.indexOf('resistance') !== -1) return av >= bv ? a : b;
    if (type.indexOf('voltage') !== -1) return av >= bv ? a : b;
    return av >= bv ? a : b;
  }

  function recommend(items){
    if (!items.length) return null;
    var c = cfg();
    var pick = items[0];
    items.slice(1).forEach(function(r){
      if (c.stricterRequirementWins !== false && comparable(pick, r)) {
        pick = stricter(pick, r);
      } else if (sourceRank(r) < sourceRank(pick)) {
        pick = r;
      }
    });
    return pick;
  }

  function detect(){
    var reqs = allRequirements();
    var groups = new Map();
    reqs.forEach(function(r){
      var key = groupKey(r);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });
    var conflicts = [];
    groups.forEach(function(items, key){
      var values = new Set(items.map(function(r){ return [text(r.value), norm(r.unit)].join('|'); }).filter(function(v){ return v !== '|'; }));
      if (values.size <= 1) return;
      var rec = recommend(items);
      conflicts.push({
        id:id('conflict'),
        key:key,
        state:'review',
        type:items[0] && items[0].type || 'general',
        detectedAt:now(),
        recommendedRequirementId:rec && rec.id || '',
        recommended:rec,
        reason:'Conflicting requirement values detected. Default recommendation follows source hierarchy and stricter/better requirement rule.',
        items:items.map(function(r){ return { id:r.id, type:r.type, title:r.title, text:r.text, value:r.value, unit:r.unit, sourceName:r.sourceName, sourceType:r.sourceType, confidence:r.confidence, approved:r.approved, enforce:r.enforce }; })
      });
    });
    save(conflicts);
    return conflicts;
  }

  function save(conflicts){
    var payload = { version:VERSION, updatedAt:now(), conflicts:conflicts || [] };
    try { localStorage.setItem(STORE_KEY, JSON.stringify(payload)); } catch(e) {}
    try {
      if (window.NEXUS_OFFLINE && typeof window.NEXUS_OFFLINE.saveLocal === 'function') window.NEXUS_OFFLINE.saveLocal('vanguard/conflicts', payload, 'conflict-engine');
      if (window.NEXUS_FIREBASE && typeof window.NEXUS_FIREBASE.save === 'function') window.NEXUS_FIREBASE.save('vanguard/conflicts', payload);
    } catch(e) {}
    window.dispatchEvent(new CustomEvent('nexus:vanguard-conflicts-updated', { detail:payload }));
    return payload;
  }

  function load(){ return parse(localStorage.getItem(STORE_KEY), { version:VERSION, conflicts:[] }); }

  function approveRecommendation(conflictId){
    var data = load();
    var conflict = (data.conflicts || []).find(function(c){ return c.id === conflictId; });
    if (!conflict || !conflict.recommendedRequirementId || !window.NEXUS_REQUIREMENTS) return false;
    window.NEXUS_REQUIREMENTS.approve(conflict.recommendedRequirementId, { approvedBy:'Engineer via conflict engine' });
    conflict.state = 'resolved';
    conflict.resolvedAt = now();
    conflict.resolution = 'approved-recommended-requirement';
    save(data.conflicts);
    return true;
  }

  window.NEXUS_VANGUARD_CONFLICTS = { version:VERSION, detect:detect, load:load, save:save, approveRecommendation:approveRecommendation };
  window.addEventListener('nexus:vanguard-requirements-updated', function(){ setTimeout(detect, 200); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(detect, 500); }); else setTimeout(detect, 500);
})();
