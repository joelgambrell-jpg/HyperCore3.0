/* NEXUS local-first offline store + status banner */
(function(){
  "use strict";
  const APP_VERSION = "HyperCore3.0-offline-2026-05-27";
  const DEVICE_KEY = "nexus_device_id";
  const QUEUE_KEY = "nexus_sync_queue_v1";
  const INDEX_KEY = "nexus_offline_index_v1";
  const STATUS_ID = "nexusOfflineStatusBanner";

  function now(){ return new Date().toISOString(); }
  function jsonParse(raw, fallback){ try { return raw ? JSON.parse(raw) : fallback; } catch(e){ return fallback; } }
  function getDeviceId(){
    try{
      let id = localStorage.getItem(DEVICE_KEY);
      if(!id){
        id = "dev_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,10);
        localStorage.setItem(DEVICE_KEY, id);
      }
      return id;
    }catch(e){ return "dev_unavailable"; }
  }
  function getUser(){
    try{
      return jsonParse(localStorage.getItem("nexus_current_user"), null) ||
        jsonParse(localStorage.getItem("nexus_user_profile"), null) || {};
    }catch(e){ return {}; }
  }
  function readQueue(){ return jsonParse(localStorage.getItem(QUEUE_KEY), []); }
  function writeQueue(q){ try{ localStorage.setItem(QUEUE_KEY, JSON.stringify(q || [])); }catch(e){} updateBanner(); }
  function readIndex(){ return jsonParse(localStorage.getItem(INDEX_KEY), {}); }
  function writeIndex(idx){ try{ localStorage.setItem(INDEX_KEY, JSON.stringify(idx || {})); }catch(e){} }
  function normalizeKey(key){ return String(key == null ? "" : key).trim(); }
  function localDocKey(key){ return "nexus_doc_" + normalizeKey(key).replace(/[^a-zA-Z0-9_.:-]+/g,"_"); }

  function wrapPayload(key, payload, source){
    const user = getUser();
    const prior = getLocal(key);
    const priorVersion = prior && prior._offlineMeta && Number(prior._offlineMeta.version || 0) || 0;
    return Object.assign({}, payload || {}, {
      _offlineMeta: Object.assign({}, (payload && payload._offlineMeta) || {}, {
        key: normalizeKey(key),
        version: priorVersion + 1,
        updatedAt: now(),
        updatedBy: user.displayName || user.email || "Local User",
        updatedByEmail: user.email || "",
        updatedByRole: user.role || "",
        deviceId: getDeviceId(),
        source: source || "local-first",
        appVersion: APP_VERSION,
        syncState: navigator.onLine ? "pending-sync" : "offline-pending-sync"
      })
    });
  }

  function saveLocal(key, payload, source){
    key = normalizeKey(key);
    if(!key) return null;
    const doc = wrapPayload(key, payload, source);
    try{
      localStorage.setItem(localDocKey(key), JSON.stringify(doc));
      const idx = readIndex();
      idx[key] = { key, localKey: localDocKey(key), updatedAt: doc._offlineMeta.updatedAt, version: doc._offlineMeta.version };
      writeIndex(idx);
      window.dispatchEvent(new CustomEvent("nexus:local-save", { detail:{ key, doc } }));
    }catch(e){ console.warn("NEXUS_OFFLINE.saveLocal failed", e); }
    updateBanner();
    return doc;
  }

  function getLocal(key){
    key = normalizeKey(key);
    try{ return jsonParse(localStorage.getItem(localDocKey(key)), null); }catch(e){ return null; }
  }

  function enqueue(action, key, payload){
    key = normalizeKey(key);
    if(!key) return null;
    const doc = payload && payload._offlineMeta ? payload : wrapPayload(key, payload, "queued");
    const item = {
      id: "q_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,8),
      action: action || "set",
      key,
      payload: doc,
      createdAt: now(),
      attempts: 0,
      lastError: ""
    };
    const q = readQueue();
    q.push(item);
    writeQueue(q);
    window.dispatchEvent(new CustomEvent("nexus:sync-queued", { detail:item }));
    return item;
  }

  async function flushWith(writer){
    if(typeof writer !== "function") return { ok:false, reason:"missing-writer" };
    if(!navigator.onLine) return { ok:false, reason:"offline" };
    const q = readQueue();
    const remaining = [];
    let synced = 0;
    for(const item of q){
      try{
        item.attempts = Number(item.attempts || 0) + 1;
        await writer(item.key, item.payload, item);
        synced++;
        const local = getLocal(item.key);
        if(local && local._offlineMeta){
          local._offlineMeta.syncState = "synced";
          local._offlineMeta.syncedAt = now();
          try{ localStorage.setItem(localDocKey(item.key), JSON.stringify(local)); }catch(e){}
        }
      }catch(e){
        item.lastError = e && e.message ? e.message : String(e || "sync failed");
        item.lastAttemptAt = now();
        remaining.push(item);
      }
    }
    writeQueue(remaining);
    window.dispatchEvent(new CustomEvent("nexus:sync-flushed", { detail:{ synced, remaining:remaining.length } }));
    updateBanner();
    return { ok:true, synced, remaining:remaining.length };
  }

  function exportBackup(){
    const idx = readIndex();
    const docs = {};
    Object.keys(idx).forEach(function(key){ docs[key] = getLocal(key); });
    return {
      exportedAt: now(),
      appVersion: APP_VERSION,
      deviceId: getDeviceId(),
      localStorageSnapshot: Object.keys(localStorage).filter(k => k.indexOf("nexus_") === 0).reduce((acc,k)=>{ acc[k]=localStorage.getItem(k); return acc; },{}),
      docs,
      queue: readQueue()
    };
  }

  function importBackup(backup){
    if(!backup || typeof backup !== "object") return false;
    if(backup.localStorageSnapshot){
      Object.keys(backup.localStorageSnapshot).forEach(function(k){
        try{ localStorage.setItem(k, backup.localStorageSnapshot[k]); }catch(e){}
      });
    }
    if(backup.docs){
      Object.keys(backup.docs).forEach(function(key){ saveLocal(key, backup.docs[key], "backup-import"); });
    }
    updateBanner();
    return true;
  }

  function downloadBackup(filename){
    const data = exportBackup();
    const blob = new Blob([JSON.stringify(data,null,2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || ("nexus-backup-" + new Date().toISOString().replace(/[:.]/g,"-") + ".json");
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  function ensureBanner(){
    if(document.getElementById(STATUS_ID)) return document.getElementById(STATUS_ID);
    const el = document.createElement("div");
    el.id = STATUS_ID;
    el.setAttribute("role", "status");
    el.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:999999;padding:10px 14px;border-radius:14px;font:700 13px Arial,sans-serif;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.25);display:none;";
    document.body.appendChild(el);
    return el;
  }

  function updateBanner(){
    if(!document.body) return;
    const el = ensureBanner();
    const pending = readQueue().length;
    const online = navigator.onLine;
    if(online && pending === 0){
      el.textContent = "Online • Synced";
      el.style.background = "#0b6b3a";
      el.style.color = "#fff";
      el.style.display = "none";
      return;
    }
    if(!online){
      el.textContent = pending ? `Offline • Saved locally • ${pending} sync pending` : "Offline • Saved locally";
      el.style.background = "#7a4a00";
      el.style.color = "#fff";
      el.style.display = "block";
      return;
    }
    el.textContent = `${pending} sync pending • Online`;
    el.style.background = "#0f3d73";
    el.style.color = "#fff";
    el.style.display = "block";
  }

  function registerServiceWorker(){
    if(!("serviceWorker" in navigator)) return;
    const path = (window.NEXUS_OFFLINE_SW_PATH || "service-worker.js");
    try{
      navigator.serviceWorker.register(path).catch(function(e){ console.warn("NEXUS service worker registration failed", e); });
    }catch(e){ console.warn("NEXUS service worker unavailable", e); }
  }

  window.NEXUS_OFFLINE = window.NEXUS_OFFLINE || {};
  Object.assign(window.NEXUS_OFFLINE, {
    APP_VERSION,
    getDeviceId,
    saveLocal,
    getLocal,
    enqueue,
    readQueue,
    flushWith,
    exportBackup,
    importBackup,
    downloadBackup,
    updateBanner,
    registerServiceWorker
  });

  window.addEventListener("online", function(){ updateBanner(); window.dispatchEvent(new CustomEvent("nexus:online")); });
  window.addEventListener("offline", function(){ updateBanner(); window.dispatchEvent(new CustomEvent("nexus:offline")); });
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", function(){ updateBanner(); registerServiceWorker(); });
  else { updateBanner(); registerServiceWorker(); }
})();
