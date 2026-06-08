/*
  assets/js/vanguard_persistence_bridge.js
  HyperCore / NEXUS Vanguard Persistence Bridge

  Purpose:
  - Keep localStorage as the field-safe master during pre-Firebase rollout.
  - Mirror selected canonical HyperCore/Vanguard keys to Firebase when Firebase is enabled.
  - Queue failed syncs offline without changing any existing field page code.
  - Provide one Firebase-ready persistence API for package readiness, engineer alerts,
    workflow state, CCS, torque, meg, FPV, authority snapshots, and document conflicts.

  Design rules:
  - Additive only. Does not replace localStorage.
  - No hard dependency on Firebase SDK.
  - No field workflow blocking if cloud sync fails.
  - Safe on static GitHub Pages.
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_PERSISTENCE_BRIDGE && window.NEXUS_VANGUARD_PERSISTENCE_BRIDGE.__installed) return;

  var VERSION = '1.0.0-pre-firebase-bridge';
  var QUEUE_KEY = 'nexus_vanguard_persistence_queue_v1';
  var STATUS_KEY = 'nexus_vanguard_persistence_status_v1';
  var CONFIG_KEY = 'nexus_vanguard_persistence_config_v1';
  var MAX_QUEUE = 300;

  function clean(v){ return String(v == null ? '' : v).trim(); }
  function lower(v){ return clean(v).toLowerCase(); }
  function nowISO(){ return new Date().toISOString(); }
  function safeArray(v){ return Array.isArray(v) ? v : []; }

  function readJSON(key, fallback){
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch(e) {
      return fallback;
    }
  }

  function writeJSON(key, value){
    try { localStorage.setItem(key, JSON.stringify(value)); } catch(e) {}
    return value;
  }

  function readRaw(key){
    try { return localStorage.getItem(key); } catch(e) { return null; }
  }

  function writeRaw(key, value){
    try { localStorage.setItem(key, value); } catch(e) {}
    return value;
  }

  function getEq(input){
    if (input && typeof input === 'object') {
      var fromObject = clean(input.eq || input.equipmentId || input.equipment || '');
      if (fromObject) return fromObject;
    }
    var direct = clean(input || '');
    if (direct) return direct;
    try {
      var p = new URLSearchParams(location.search || '');
      var fromUrl = clean(p.get('eq') || p.get('equipment') || p.get('equipmentId') || '');
      if (fromUrl) return fromUrl;
    } catch(e) {}
    return clean(readRaw('nexus_active_equipment') || readRaw('nexus_active_eq') || 'NO_EQ') || 'NO_EQ';
  }

  function slug(v){
    return encodeURIComponent(clean(v || 'unknown').replace(/[.#$\[\]/]/g, '_'));
  }

  function defaultConfig(){
    var cfg = readJSON(CONFIG_KEY, null) || {};
    return {
      enabled: !!cfg.enabled,
      projectId: clean(cfg.projectId || readRaw('nexus_active_project') || readRaw('nexus_project_id') || 'local-project'),
      siteId: clean(cfg.siteId || readRaw('nexus_active_site') || readRaw('nexus_site_id') || 'local-site'),
      firebaseMode: clean(cfg.firebaseMode || 'auto'),
      dryRun: cfg.dryRun !== false,
      mirrorOnStorageEvents: cfg.mirrorOnStorageEvents !== false,
      queueLimit: Number(cfg.queueLimit || MAX_QUEUE) || MAX_QUEUE,
      updatedAt: cfg.updatedAt || nowISO()
    };
  }

  function saveConfig(next){
    var current = defaultConfig();
    var merged = Object.assign({}, current, next || {}, { updatedAt:nowISO() });
    writeJSON(CONFIG_KEY, merged);
    writeStatus({ config:merged });
    return merged;
  }

  function status(){
    return readJSON(STATUS_KEY, {
      version:VERSION,
      enabled:false,
      online:typeof navigator === 'undefined' ? true : !!navigator.onLine,
      firebaseAvailable:false,
      dryRun:true,
      queueDepth:0,
      lastSyncAt:'',
      lastError:'',
      updatedAt:nowISO()
    });
  }

  function writeStatus(patch){
    var out = Object.assign({}, status(), patch || {}, {
      version:VERSION,
      online:typeof navigator === 'undefined' ? true : !!navigator.onLine,
      queueDepth:queue().length,
      updatedAt:nowISO()
    });
    writeJSON(STATUS_KEY, out);
    try { window.dispatchEvent(new CustomEvent('vanguard:persistence:status', { detail:out })); } catch(e) {}
    return out;
  }

  function queue(){
    return safeArray(readJSON(QUEUE_KEY, []));
  }

  function saveQueue(items){
    var cfg = defaultConfig();
    var limit = Number(cfg.queueLimit || MAX_QUEUE) || MAX_QUEUE;
    var trimmed = safeArray(items).slice(Math.max(0, safeArray(items).length - limit));
    writeJSON(QUEUE_KEY, trimmed);
    writeStatus({ queueDepth:trimmed.length });
    return trimmed;
  }

  function localKeys(){
    var keys = [];
    try {
      for (var i=0;i<localStorage.length;i+=1) keys.push(localStorage.key(i));
    } catch(e) {}
    return keys.filter(Boolean).sort();
  }

  function keyMatchesEq(key, eq){
    eq = clean(eq);
    return key.indexOf('nexus_' + eq + '_') === 0 || key.indexOf(eq) !== -1;
  }

  function classifyKey(key, eq){
    var k = lower(key);
    var module = 'misc';
    var collection = 'misc';
    if (k.indexOf('package_readiness_canonical') !== -1) { module = 'package'; collection = 'packageReadiness'; }
    else if (k.indexOf('package_readiness') !== -1) { module = 'package'; collection = 'packageSummary'; }
    else if (k.indexOf('engineer_alert') !== -1 || k.indexOf('alert_index') !== -1) { module = 'alerts'; collection = 'engineerAlerts'; }
    else if (k.indexOf('authority_snapshot') !== -1 || k.indexOf('vanguard_authority') !== -1) { module = 'authority'; collection = 'authoritySnapshots'; }
    else if (k.indexOf('ccs') !== -1 || k.indexOf('construction_check_sheet') !== -1) { module = 'ccs'; collection = 'ccs'; }
    else if (k.indexOf('torque') !== -1) { module = 'torque'; collection = 'torque'; }
    else if (k.indexOf('meg') !== -1 || k.indexOf('megohmmeter') !== -1) { module = 'meg'; collection = 'meg'; }
    else if (k.indexOf('fpv') !== -1 || k.indexOf('finished_product') !== -1) { module = 'fpv'; collection = 'fpv'; }
    else if (k.indexOf('prefod') !== -1 || k.indexOf('pre_fod') !== -1 || k.indexOf('pre-fod') !== -1) { module = 'prefod'; collection = 'prefod'; }
    else if (k.indexOf('rif') !== -1 || k.indexOf('receipt') !== -1) { module = 'rif'; collection = 'rif'; }
    else if (k.indexOf('phenolic') !== -1 || k.indexOf('label') !== -1) { module = 'phenolic'; collection = 'phenolic'; }
    else if (k.indexOf('l2') !== -1 || k.indexOf('level_2') !== -1 || k.indexOf('level2') !== -1) { module = 'l2'; collection = 'l2'; }
    else if (k.indexOf('conflict') !== -1) { module = 'documents'; collection = 'conflicts'; }
    else if (k.indexOf('_step_') !== -1 || k.indexOf('workflow') !== -1) { module = 'workflow'; collection = 'workflow'; }

    return {
      key:key,
      eq:eq,
      module:module,
      collection:collection,
      firebasePath:firebasePath(eq, collection, key)
    };
  }

  function firebasePath(eq, collection, key){
    var cfg = defaultConfig();
    return [
      'projects', slug(cfg.projectId),
      'sites', slug(cfg.siteId),
      'equipment', slug(eq || 'NO_EQ'),
      collection || 'misc',
      slug(key)
    ].join('/');
  }

  function parseValue(raw){
    if (raw == null) return null;
    try { return JSON.parse(raw); } catch(e) { return raw; }
  }

  function buildRecord(key, eq, options){
    options = options || {};
    eq = getEq(eq);
    var raw = readRaw(key);
    var meta = classifyKey(key, eq);
    return {
      id:slug(key),
      key:key,
      eq:eq,
      module:meta.module,
      collection:meta.collection,
      firebasePath:meta.firebasePath,
      value:parseValue(raw),
      rawType:raw == null ? 'missing' : 'present',
      deleted:raw == null,
      source:'localStorage',
      bridgeVersion:VERSION,
      capturedAt:nowISO(),
      options:options.metadata || {}
    };
  }

  function firebaseApi(){
    var fb = window.NEXUS_FIREBASE || window.NexusFirebase || window.firebase || null;
    var db = window.NEXUS_FIRESTORE || window.firestore || null;
    return { firebase:fb, firestore:db };
  }

  function isFirebaseAvailable(){
    var api = firebaseApi();
    if (window.NEXUS_FIREBASE_BRIDGE && typeof window.NEXUS_FIREBASE_BRIDGE.set === 'function') return true;
    if (window.NEXUS_FIREBASE && typeof window.NEXUS_FIREBASE.set === 'function') return true;
    if (api.firestore && typeof api.firestore.doc === 'function') return true;
    if (api.firebase && api.firebase.firestore) return true;
    return false;
  }

  function writeRemote(record){
    var cfg = defaultConfig();
    if (!cfg.enabled) return Promise.resolve({ skipped:true, reason:'Persistence bridge disabled.', record:record });
    if (cfg.dryRun) return Promise.resolve({ skipped:true, reason:'Dry run enabled.', record:record });
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.reject(new Error('Offline. Queued for later sync.'));

    try {
      if (window.NEXUS_FIREBASE_BRIDGE && typeof window.NEXUS_FIREBASE_BRIDGE.set === 'function') {
        return Promise.resolve(window.NEXUS_FIREBASE_BRIDGE.set(record.firebasePath, record));
      }
      if (window.NEXUS_FIREBASE && typeof window.NEXUS_FIREBASE.set === 'function') {
        return Promise.resolve(window.NEXUS_FIREBASE.set(record.firebasePath, record));
      }
      if (window.NEXUS_FIRESTORE && typeof window.NEXUS_FIRESTORE.doc === 'function') {
        return Promise.resolve(window.NEXUS_FIRESTORE.doc(record.firebasePath).set(record, { merge:true }));
      }
      if (window.firebase && window.firebase.firestore) {
        return Promise.resolve(window.firebase.firestore().doc(record.firebasePath).set(record, { merge:true }));
      }
    } catch(e) {
      return Promise.reject(e);
    }

    return Promise.reject(new Error('Firebase SDK/bridge not available.'));
  }

  function enqueue(record, reason){
    var items = queue();
    items.push({
      id:'SYNC-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2,8).toUpperCase(),
      record:record,
      reason:clean(reason || 'Queued for sync.'),
      attempts:0,
      status:'QUEUED',
      createdAt:nowISO(),
      updatedAt:nowISO()
    });
    saveQueue(items);
    return items[items.length - 1];
  }

  function mirrorKey(key, eq, options){
    options = options || {};
    eq = getEq(eq);
    var record = buildRecord(key, eq, options);
    writeStatus({ enabled:defaultConfig().enabled, dryRun:defaultConfig().dryRun, firebaseAvailable:isFirebaseAvailable(), lastMirroredKey:key });

    return writeRemote(record).then(function(result){
      writeStatus({ lastSyncAt:nowISO(), lastError:'', firebaseAvailable:isFirebaseAvailable() });
      try { window.dispatchEvent(new CustomEvent('vanguard:persistence:mirrored', { detail:{ record:record, result:result } })); } catch(e) {}
      return { record:record, result:result, queued:false };
    }).catch(function(err){
      var queued = enqueue(record, err && err.message || err);
      writeStatus({ lastError:clean(err && err.message || err), firebaseAvailable:isFirebaseAvailable() });
      try { window.dispatchEvent(new CustomEvent('vanguard:persistence:queued', { detail:{ record:record, queued:queued } })); } catch(e2) {}
      return { record:record, queued:queued, queuedForSync:true, error:clean(err && err.message || err) };
    });
  }

  function mirrorEquipment(eq, options){
    options = options || {};
    eq = getEq(eq);

    if (window.NEXUS_VANGUARD_PACKAGE_READINESS && typeof window.NEXUS_VANGUARD_PACKAGE_READINESS.run === 'function') {
      try { window.NEXUS_VANGUARD_PACKAGE_READINESS.run(eq, { persist:true }); } catch(e) {}
    }

    var keys = localKeys().filter(function(key){
      if (!keyMatchesEq(key, eq)) return false;
      if (options.onlyCanonical) {
        return /package_readiness|engineer_alert|authority_snapshot|ccs_vanguard|torque_vanguard|meg_vanguard|fpv/i.test(key);
      }
      return /^nexus_/.test(key) || key.indexOf(eq) !== -1;
    });

    var chain = Promise.resolve([]);
    keys.forEach(function(key){
      chain = chain.then(function(results){
        return mirrorKey(key, eq, options).then(function(result){
          results.push(result);
          return results;
        });
      });
    });
    return chain.then(function(results){
      writeStatus({ lastEquipmentMirror:eq, lastEquipmentMirrorAt:nowISO(), lastEquipmentMirrorCount:results.length });
      return { eq:eq, count:results.length, results:results };
    });
  }

  function flushQueue(options){
    options = options || {};
    var cfg = defaultConfig();
    var items = queue();
    if (!items.length) return Promise.resolve({ flushed:0, remaining:0, results:[] });
    if (!cfg.enabled || cfg.dryRun) {
      writeStatus({ lastError:cfg.enabled ? 'Dry run enabled; queue retained.' : 'Persistence disabled; queue retained.' });
      return Promise.resolve({ flushed:0, remaining:items.length, skipped:true, reason:cfg.enabled ? 'dryRun' : 'disabled', results:[] });
    }

    var remaining = [];
    var results = [];
    var chain = Promise.resolve();
    items.forEach(function(item){
      chain = chain.then(function(){
        item.attempts = Number(item.attempts || 0) + 1;
        item.updatedAt = nowISO();
        return writeRemote(item.record).then(function(result){
          item.status = 'SYNCED';
          item.syncedAt = nowISO();
          results.push({ item:item, result:result, synced:true });
        }).catch(function(err){
          item.status = 'QUEUED';
          item.reason = clean(err && err.message || err || item.reason);
          remaining.push(item);
          results.push({ item:item, synced:false, error:item.reason });
        });
      });
    });

    return chain.then(function(){
      saveQueue(remaining);
      writeStatus({ lastFlushAt:nowISO(), lastFlushSynced:items.length - remaining.length, lastError:remaining.length ? 'Some sync records remain queued.' : '' });
      try { window.dispatchEvent(new CustomEvent('vanguard:persistence:flushed', { detail:{ flushed:items.length - remaining.length, remaining:remaining.length, results:results } })); } catch(e) {}
      return { flushed:items.length - remaining.length, remaining:remaining.length, results:results };
    });
  }

  function clearQueue(){
    saveQueue([]);
    writeStatus({ lastError:'', queueClearedAt:nowISO() });
    return true;
  }

  function enable(config){
    var cfg = saveConfig(Object.assign({}, config || {}, { enabled:true }));
    writeStatus({ enabled:true, dryRun:cfg.dryRun, firebaseAvailable:isFirebaseAvailable() });
    return cfg;
  }

  function disable(){
    var cfg = saveConfig({ enabled:false });
    writeStatus({ enabled:false });
    return cfg;
  }

  function setDryRun(value){
    var cfg = saveConfig({ dryRun:!!value });
    writeStatus({ dryRun:cfg.dryRun });
    return cfg;
  }

  function installAutoMirror(){
    if (installAutoMirror.__installed) return;
    installAutoMirror.__installed = true;
    var timer = null;

    function schedule(eq){
      var cfg = defaultConfig();
      if (!cfg.mirrorOnStorageEvents) return;
      clearTimeout(timer);
      timer = setTimeout(function(){
        try { mirrorEquipment(getEq(eq), { onlyCanonical:true, metadata:{ trigger:'auto' } }); } catch(e) {}
      }, 650);
    }

    window.addEventListener('vanguard:package-readiness:updated', function(ev){
      schedule(ev && ev.detail && ev.detail.eq);
    });
    window.addEventListener('vanguard:authority-adapter:updated', function(ev){
      schedule(ev && ev.detail && ev.detail.eq);
    });
    window.addEventListener('nexus-workflow-change', function(){ schedule(); });
    window.addEventListener('online', function(){ flushQueue(); schedule(); });
    window.addEventListener('offline', function(){ writeStatus({ online:false }); });

    setTimeout(function(){ schedule(); }, 1400);
  }

  var api = {
    __installed:true,
    version:VERSION,
    getEq:getEq,
    config:defaultConfig,
    saveConfig:saveConfig,
    enable:enable,
    disable:disable,
    setDryRun:setDryRun,
    status:status,
    queue:queue,
    clearQueue:clearQueue,
    flushQueue:flushQueue,
    firebasePath:firebasePath,
    classifyKey:classifyKey,
    buildRecord:buildRecord,
    mirrorKey:mirrorKey,
    mirrorEquipment:mirrorEquipment,
    isFirebaseAvailable:isFirebaseAvailable
  };

  window.NEXUS_VANGUARD_PERSISTENCE_BRIDGE = api;
  window.VanguardPersistenceBridge = api;
  window.NEXUS = window.NEXUS || {};
  window.NEXUS.VanguardPersistenceBridge = api;

  writeStatus({ enabled:defaultConfig().enabled, dryRun:defaultConfig().dryRun, firebaseAvailable:isFirebaseAvailable() });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installAutoMirror);
  else installAutoMirror();

  try { window.dispatchEvent(new CustomEvent('vanguard:persistence-ready', { detail:{ version:VERSION, status:status() } })); } catch(e) {}
})();