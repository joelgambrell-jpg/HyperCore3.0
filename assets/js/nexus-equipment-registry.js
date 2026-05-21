/* assets/js/nexus-equipment-registry.js
   Compatibility registry for NEXUS/Vanguard pages. */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.NEXUS_EQUIPMENT && window.NEXUS_EQUIPMENT.__installed) return;

  function clean(v){ return String(v == null ? '' : v).trim(); }
  function readJSON(k,f){ try{ var r=localStorage.getItem(k); return r ? JSON.parse(r) : f; }catch(e){ return f; } }
  function writeJSON(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch(e){ return false; } }
  function list(){
    var raw = readJSON('nexus_project_equipment', []);
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') return Object.keys(raw).map(function(k){ return Object.assign({eq:k,id:k}, raw[k] || {}); });
    return [];
  }
  function matchId(rec, id){
    id = clean(id).toLowerCase();
    if (!id) return false;
    return [rec.eq, rec.id, rec.equipmentId, rec.name, rec.tag].some(function(v){ return clean(v).toLowerCase() === id; });
  }
  function get(id){
    var records = list();
    for (var i=0;i<records.length;i+=1){ if (matchId(records[i], id)) return records[i]; }
    var direct = readJSON('nexus_equipment_' + clean(id), null);
    if (direct) return Object.assign({eq:clean(id), id:clean(id)}, direct);
    var meta = readJSON('nexus_meta_' + clean(id), null);
    if (meta) return Object.assign({eq:clean(id), id:clean(id)}, meta);
    return null;
  }
  function upsert(record){
    record = record || {};
    var id = clean(record.eq || record.id || record.equipmentId || record.name);
    if (!id) return null;
    var records = list();
    var found = false;
    records = records.map(function(r){ if (matchId(r,id)){ found=true; return Object.assign({}, r, record, {eq:id,id:id}); } return r; });
    if (!found) records.push(Object.assign({}, record, {eq:id,id:id}));
    writeJSON('nexus_project_equipment', records);
    writeJSON('nexus_equipment_' + id, Object.assign({}, record, {eq:id,id:id}));
    return get(id);
  }
  function hydrateMetaToRegistry(id){
    var existing = get(id);
    if (existing) return existing;
    var meta = readJSON('nexus_meta_' + clean(id), null) || {};
    return upsert(Object.assign({eq:clean(id), id:clean(id)}, meta));
  }

  var api = { __installed:true, list:list, all:list, get:get, getEquipment:get, upsert:upsert, save:upsert, hydrateMetaToRegistry:hydrateMetaToRegistry };
  window.NEXUS_EQUIPMENT = api;
  window.NEXUS_REGISTRY = window.NEXUS_REGISTRY || api;
  window.NEXUS = window.NEXUS || {};
  window.NEXUS.EquipmentRegistry = api;
})();
