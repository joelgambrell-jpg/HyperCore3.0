/*
  assets/js/vanguard_realtime_sync.js
  NEXUS Vanguard Realtime Sync

  Purpose:
  - Uses Firebase when available.
  - Falls back to localStorage cleanly.
  - Provides a single project-level save/load API.
*/
(function(){
  'use strict';
  if (window.NEXUS_VANGUARD_REALTIME_SYNC && window.NEXUS_VANGUARD_REALTIME_SYNC.__installed) return;

  var VERSION = '0.2.0-realtime-sync';
  var PREFIX = 'nexus_realtime_';

  function clean(v){ return String(v == null ? '' : v).trim(); }
  function nowISO(){ return new Date().toISOString(); }

  function hasFirestore(){
    return !!(window.firebase && typeof window.firebase.firestore === 'function');
  }

  function projectId(){
    return clean(localStorage.getItem('nexus_active_project') || localStorage.getItem('nexus_active_building') || 'default_project');
  }

  async function save(collection, id, data){
    collection = clean(collection || 'state');
    id = clean(id || 'default');
    var payload = Object.assign({}, data || {}, { syncedAt: nowISO() });

    if (hasFirestore()) {
      await window.firebase.firestore()
        .collection('nexusProjects').doc(projectId())
        .collection(collection).doc(id).set(payload, { merge: true });
      return { mode: 'firebase', data: payload };
    }

    localStorage.setItem(PREFIX + projectId() + '_' + collection + '_' + id, JSON.stringify(payload));
    return { mode: 'localStorage', data: payload };
  }

  async function load(collection, id){
    collection = clean(collection || 'state');
    id = clean(id || 'default');

    if (hasFirestore()) {
      var snap = await window.firebase.firestore()
        .collection('nexusProjects').doc(projectId())
        .collection(collection).doc(id).get();
      return snap.exists ? snap.data() : null;
    }

    try { return JSON.parse(localStorage.getItem(PREFIX + projectId() + '_' + collection + '_' + id) || 'null'); }
    catch(e){ return null; }
  }

  function status(){
    return {
      firebaseAvailable: hasFirestore(),
      projectId: projectId(),
      mode: hasFirestore() ? 'firebase' : 'localStorage'
    };
  }

  var api = {
    __installed: true,
    version: VERSION,
    save: save,
    load: load,
    status: status
  };

  window.NEXUS_VANGUARD_REALTIME_SYNC = api;
  window.VanguardRealtimeSync = api;
})();
