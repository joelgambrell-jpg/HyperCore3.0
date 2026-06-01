/* assets/js/nexus-equipment-registry.js
   Compatibility registry for NEXUS/Vanguard pages.

   Freeze-hardening notes:
   - This file is loaded by index_equipment_registry.html before the inline page script.
   - It must provide the full NEXUS_REGISTRY API used by that page.
   - It must be safe when the browser restores the page from back/forward cache.
   - It must not start Firebase listeners, module validators, or new workflow features.
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.NEXUS_EQUIPMENT && window.NEXUS_EQUIPMENT.__installed && window.NEXUS_EQUIPMENT.__freezeHardened) return;

  var REGISTRY_KEY = 'nexus_project_equipment';
  var ACTIVE_PROJECT_KEY = 'nexus_active_project';
  var DEFAULT_PROJECT = 'AWS CMH098';
  var MAX_LOCALSTORAGE_SCAN = 2500;

  var registryCacheRaw = null;
  var registryCacheRows = null;
  var progressCache = Object.create(null);
  var progressCacheAt = 0;
  var firebaseUnsubs = [];

  function clean(v){ return String(v == null ? '' : v).trim(); }

  function safeGet(k){
    try{ return localStorage.getItem(k); }
    catch(e){ return null; }
  }

  function safeSet(k,v){
    try{
      if (localStorage.getItem(k) === v) return true;
      localStorage.setItem(k,v);
      return true;
    }catch(e){
      try{ console.warn('NEXUS registry storage write failed:', k, e); }catch(_e){}
      return false;
    }
  }

  function safeRemove(k){
    try{ localStorage.removeItem(k); return true; }
    catch(e){ return false; }
  }

  function readJSON(k,f){
    try{
      var r = localStorage.getItem(k);
      return r ? JSON.parse(r) : f;
    }catch(e){
      return f;
    }
  }

  function writeJSON(k,v){
    try{
      var next = JSON.stringify(v);
      if (localStorage.getItem(k) === next) return true;
      localStorage.setItem(k, next);
      return true;
    }catch(e){
      try{ console.warn('NEXUS registry JSON write failed:', k, e); }catch(_e){}
      return false;
    }
  }

  function now(){ return Date.now(); }

  function getActiveProject(){
    return clean(safeGet(ACTIVE_PROJECT_KEY)) || DEFAULT_PROJECT;
  }

  function setActiveProject(project){
    var value = clean(project) || DEFAULT_PROJECT;
    safeSet(ACTIVE_PROJECT_KEY, value);
    return value;
  }

  function normalizeRecord(record){
    record = record || {};
    var id = clean(record.eq || record.id || record.equipmentId || record.name || record.tag);
    if (!id) return null;
    var type = clean(record.type || record.equipmentType || record.template || 'equipment');
    var project = clean(record.project || getActiveProject());
    return Object.assign({}, record, {
      eq: id,
      id: clean(record.id || id) || id,
      equipmentId: clean(record.equipmentId || id) || id,
      type: type,
      project: project,
      building: clean(record.building || record.bldg || ''),
      phase: clean(record.phase || ''),
      pod: clean(record.pod || ''),
      updatedAt: record.updatedAt || now()
    });
  }

  function invalidateCaches(){
    registryCacheRaw = null;
    registryCacheRows = null;
    progressCache = Object.create(null);
    progressCacheAt = 0;
  }

  function list(){
    var raw;
    try{ raw = localStorage.getItem(REGISTRY_KEY) || '[]'; }
    catch(e){ raw = '[]'; }

    if (raw === registryCacheRaw && Array.isArray(registryCacheRows)) return registryCacheRows.slice();

    var parsed = [];
    try{ parsed = raw ? JSON.parse(raw) : []; }
    catch(e){ parsed = []; }

    var rows;
    if (Array.isArray(parsed)){
      rows = parsed;
    } else if (parsed && typeof parsed === 'object'){
      rows = Object.keys(parsed).map(function(k){ return Object.assign({ eq:k, id:k, equipmentId:k }, parsed[k] || {}); });
    } else {
      rows = [];
    }

    rows = rows.map(normalizeRecord).filter(Boolean);
    rows.sort(function(a,b){ return String(a.eq).localeCompare(String(b.eq), undefined, { numeric:true, sensitivity:'base' }); });

    registryCacheRaw = raw;
    registryCacheRows = rows;
    return rows.slice();
  }

  function writeList(rows){
    rows = (Array.isArray(rows) ? rows : []).map(normalizeRecord).filter(Boolean);
    rows.sort(function(a,b){ return String(a.eq).localeCompare(String(b.eq), undefined, { numeric:true, sensitivity:'base' }); });
    if (writeJSON(REGISTRY_KEY, rows)){
      registryCacheRaw = JSON.stringify(rows);
      registryCacheRows = rows.slice();
      return true;
    }
    return false;
  }

  function matchId(rec, id){
    id = clean(id).toLowerCase();
    if (!id || !rec) return false;
    return [rec.eq, rec.id, rec.equipmentId, rec.name, rec.tag].some(function(v){ return clean(v).toLowerCase() === id; });
  }

  function get(id){
    id = clean(id);
    if (!id) return null;

    var records = list();
    for (var i=0;i<records.length;i+=1){
      if (matchId(records[i], id)) return records[i];
    }

    var direct = readJSON('nexus_equipment_' + id, null);
    if (direct) return normalizeRecord(Object.assign({ eq:id, id:id, equipmentId:id }, direct));

    var meta = readJSON('nexus_meta_' + id, null);
    if (meta) return normalizeRecord(Object.assign({ eq:id, id:id, equipmentId:id }, meta));

    return null;
  }

  function listByProject(project){
    var p = clean(project || getActiveProject());
    return list().filter(function(row){ return !p || !row.project || row.project === p; });
  }

  function upsert(record){
    var normalized = normalizeRecord(record);
    if (!normalized) return null;

    var id = normalized.eq;
    var records = list();
    var found = false;

    records = records.map(function(r){
      if (matchId(r,id)){
        found = true;
        return normalizeRecord(Object.assign({}, r, normalized, { eq:id, id:id, equipmentId:id, updatedAt:now() }));
      }
      return r;
    });

    if (!found){
      records.push(normalizeRecord(Object.assign({}, normalized, {
        eq:id,
        id:id,
        equipmentId:id,
        createdAt: normalized.createdAt || now(),
        updatedAt: now()
      })));
    }

    writeList(records);
    writeJSON('nexus_equipment_' + id, Object.assign({}, normalized, { eq:id, id:id, equipmentId:id }));
    return get(id);
  }

  function deleteEquipment(id){
    id = clean(id);
    if (!id) return false;
    var next = list().filter(function(row){ return !matchId(row, id); });
    safeRemove('nexus_equipment_' + id);
    return writeList(next);
  }

  function hydrateMetaToRegistry(id){
    id = clean(id);
    if (!id) return null;
    var existing = get(id);
    var meta = readJSON('nexus_meta_' + id, null) || {};
    var row = Object.assign({}, existing || {}, meta || {}, {
      eq: id,
      id: id,
      equipmentId: id,
      type: clean(meta.equipmentType || meta.type || (existing && existing.type) || 'transformer'),
      building: clean(meta.building || (existing && existing.building) || ''),
      phase: clean(meta.phase || (existing && existing.phase) || ''),
      pod: clean(meta.pod || (existing && existing.pod) || ''),
      project: getActiveProject()
    });
    return upsert(row);
  }

  function hasAnyProgress(id){
    id = clean(id);
    if (!id) return false;

    var t = now();
    if (progressCacheAt && (t - progressCacheAt) < 2000 && Object.prototype.hasOwnProperty.call(progressCache, id)){
      return !!progressCache[id];
    }

    var found = false;
    try{
      if (localStorage.getItem('nexus_' + id + '_ccs_signed_off') === '1') found = true;
      if (!found && localStorage.getItem('nexus_' + id + '_torque_photo')) found = true;
      if (!found){
        var prefixes = [
          'nexus_' + id + '_step_',
          'nexus_' + id + '_torque_',
          'nexus_' + id + '_meg_',
          'nexus_' + id + '_prefod_',
          'nexus_' + id + '_rif_',
          'nexus_' + id + '_l2_'
        ];
        var len = Math.min(localStorage.length, MAX_LOCALSTORAGE_SCAN);
        for (var i=0; i<len && !found; i+=1){
          var k = localStorage.key(i) || '';
          for (var p=0; p<prefixes.length; p+=1){
            if (k.indexOf(prefixes[p]) === 0){ found = true; break; }
          }
        }
      }
    }catch(e){
      found = false;
    }

    progressCache[id] = found;
    progressCacheAt = t;
    return found;
  }

  function registerFirebaseUnsub(fn){
    if (typeof fn === 'function') firebaseUnsubs.push(fn);
    return fn;
  }

  function cleanup(){
    while(firebaseUnsubs.length){
      var fn = firebaseUnsubs.pop();
      try{ fn(); }catch(e){}
    }
    invalidateCaches();
  }

  function stabilizeRegistryPage(){
    var path = String(location.pathname || '').toLowerCase();
    if (path.indexOf('index_equipment_registry') === -1) return;

    window.__NEXUS_REGISTRY_PAGE = true;
    window.__NEXUS_REGISTRY_STABILIZED = true;
    window.__NEXUS_DISABLE_FLOATING_MODULE_PANELS = true;
    window.__NEXUS_DISABLE_MODULE_VALIDATION_ON_REGISTRY = true;
    window.__NEXUS_DISABLE_AUTO_DOC_INTAKE_ON_REGISTRY = true;
    window.__NEXUS_DISABLE_WORKFLOW_VERIFIER_ON_REGISTRY = true;
    window.__NEXUS_REGISTRY_SAFETY_PATCH_LOADED__ = true;
    window.__NEXUS_REGISTRY_BACK_NAVIGATION_FIX_LOADED__ = true;

    ['nexusTorqueVanguardPanel','nexusMegVanguardPanel','nexusCcsAiPanel','nexusVanguardWorkflowVerifier','nexusVanguardAutoDocumentIntake'].forEach(function(id){
      var el = document.getElementById(id);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });

    window.NEXUS_TORQUE_VANGUARD = Object.assign({}, window.NEXUS_TORQUE_VANGUARD || {}, {
      validateRows:function(){ return Promise.resolve({ state:'registry-disabled', summary:'Open a specific torque page to validate torque.' }); }
    });
    window.NEXUS_MEG_VANGUARD = Object.assign({}, window.NEXUS_MEG_VANGUARD || {}, {
      validate:function(){ return Promise.resolve({ state:'registry-disabled', summary:'Open a specific meg page to validate meg readings.' }); }
    });
    window.NEXUS_CCS_AI = Object.assign({}, window.NEXUS_CCS_AI || {}, {
      analyzeCurrentChecklist:function(){ return Promise.resolve({ state:'registry-disabled', summary:'Open the CCS page to map checklist requirements.' }); }
    });
  }

  window.addEventListener('pagehide', cleanup, { capture:true });
  window.addEventListener('beforeunload', cleanup, { capture:true });
  window.addEventListener('pageshow', function(ev){
    window.__NEXUS_REGISTRY_RETURNED_FROM_CACHE = !!(ev && ev.persisted);
    invalidateCaches();
    stabilizeRegistryPage();
    setTimeout(stabilizeRegistryPage, 100);
    setTimeout(stabilizeRegistryPage, 700);
  }, { capture:true });
  window.addEventListener('focus', function(){ setTimeout(stabilizeRegistryPage, 100); });
  window.addEventListener('storage', function(ev){
    if (!ev || ev.key === REGISTRY_KEY || String(ev.key || '').indexOf('nexus_') === 0) invalidateCaches();
  });

  var api = {
    __installed:true,
    __freezeHardened:true,
    _version:'hypercore3-freeze-hardening-2026-06-01',
    list:list,
    all:list,
    listByProject:listByProject,
    get:get,
    getEquipment:get,
    upsert:upsert,
    upsertEquipment:upsert,
    save:upsert,
    deleteEquipment:deleteEquipment,
    hydrateMetaToRegistry:hydrateMetaToRegistry,
    getActiveProject:getActiveProject,
    setActiveProject:setActiveProject,
    hasAnyProgress:hasAnyProgress,
    registerFirebaseUnsub:registerFirebaseUnsub,
    cleanup:cleanup,
    invalidateCaches:invalidateCaches
  };

  window.NEXUS_EQUIPMENT = api;
  window.NEXUS_REGISTRY = api;
  window.NEXUS = window.NEXUS || {};
  window.NEXUS.EquipmentRegistry = api;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', stabilizeRegistryPage, { once:true });
  else stabilizeRegistryPage();
})();
