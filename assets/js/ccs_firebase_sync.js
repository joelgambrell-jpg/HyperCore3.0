/*
  assets/js/ccs_firebase_sync.js
  NEXUS CCS Firebase Sync

  Purpose:
  - Central save/load bridge for imported Construction Check Sheet templates.
  - Keeps localStorage working when Firebase is unavailable.
  - Saves CCS payload, Vanguard validation payload, and package status together.
  - Provides remote hydration hook for construction_check_sheet_import.html.
  - Additive and defensive: page continues working even if Firebase is offline.
*/

(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.NEXUS_CCS_FIREBASE_SYNC && window.NEXUS_CCS_FIREBASE_SYNC.__installed) return;

  var VERSION = '0.1.0-ccs-firebase-sync';
  var QUEUE_KEY = 'nexus_ccs_sync_queue_v1';

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function safeEq(eq) {
    var value = clean(eq || getEq() || 'NO_EQ');
    return value.replace(/[.#$\[\]\/]/g, '_') || 'NO_EQ';
  }

  function getEq() {
    try {
      var params = new URL(window.location.href).searchParams;
      var fromUrl = clean(params.get('eq') || params.get('equipment') || params.get('equipmentId') || '');
      if (fromUrl) return fromUrl;
    } catch (err) {}

    try {
      if (window.NEXUS && typeof window.NEXUS.getEq === 'function') {
        var nxEq = clean(window.NEXUS.getEq());
        if (nxEq) return nxEq;
      }
    } catch (err2) {}

    return clean(
      readText('nexus_active_eq', '') ||
      readText('nexus_active_equipment', '') ||
      readText('nexus_current_eq', '') ||
      readText('eq', '')
    );
  }

  function readText(key, fallback) {
    try {
      var value = localStorage.getItem(key);
      return value == null ? (fallback || '') : value;
    } catch (err) {
      return fallback || '';
    }
  }

  function writeText(key, value) {
    try {
      localStorage.setItem(key, String(value == null ? '' : value));
      return true;
    } catch (err) {
      return false;
    }
  }

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }

  function keys(eq) {
    var id = safeEq(eq);
    return {
      ccs: 'nexus_' + id + '_ccs_two_tab_v1',
      exportPayload: 'nexus_' + id + '_ccs_vanguard_export',
      validation: 'nexus_' + id + '_ccs_vanguard_validation',
      packageStatus: 'nexus_' + id + '_packageStatus_ccs',
      syncStatus: 'nexus_' + id + '_ccs_sync_status',
      signed: 'nexus_' + id + '_ccs_signed_off',
      step: 'nexus_' + id + '_step_ccs'
    };
  }

  function queue() {
    return readJSON(QUEUE_KEY, []);
  }

  function writeQueue(list) {
    writeJSON(QUEUE_KEY, Array.isArray(list) ? list : []);
  }

  function enqueue(eq, section, payload, reason) {
    var list = queue();
    list.push({
      id: 'CCS-QUEUE-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
      eq: safeEq(eq),
      section: clean(section),
      reason: clean(reason || 'queued'),
      payload: payload || {},
      createdAt: nowISO(),
      synced: false
    });
    writeQueue(list);
    return list;
  }

  function markQueueSynced(ids) {
    var map = {};
    (ids || []).forEach(function (id) { map[id] = true; });
    var list = queue().map(function (item) {
      if (map[item.id]) {
        item.synced = true;
        item.syncedAt = nowISO();
      }
      return item;
    });
    writeQueue(list.filter(function (item) { return !item.synced; }));
  }

  function syncStatus(eq, patch) {
    var k = keys(eq).syncStatus;
    var current = readJSON(k, {}) || {};
    var next = Object.assign({}, current, patch || {}, {
      eq: safeEq(eq),
      queueCount: queue().length,
      online: typeof navigator === 'undefined' ? true : !!navigator.onLine,
      updatedAt: nowISO(),
      version: VERSION
    });
    writeJSON(k, next);
    try {
      window.dispatchEvent(new CustomEvent('nexus:ccs-sync-status', { detail: next }));
    } catch (err) {}
    return next;
  }

  function saveLocal(eq, payload, reason) {
    var id = safeEq(eq);
    var k = keys(id);
    var data = Object.assign({}, payload || {}, {
      eq: id,
      updatedAt: (payload && payload.updatedAt) || nowISO(),
      syncReason: clean(reason || 'local-save')
    });

    writeJSON(k.exportPayload, data);

    if (data.validation) writeJSON(k.validation, data.validation);

    if (Array.isArray(data.steps)) {
      writeJSON(k.ccs, {
        eq: id,
        schema: data.schema || 'ccs_two_tab_references_v1',
        steps: data.steps,
        finalSignoff: data.finalSignoff || null,
        expanded: data.expanded !== false,
        importInfo: data.importInfo || null,
        updatedAt: data.updatedAt
      });
    }

    writeJSON(k.packageStatus, {
      section: 'ccs',
      status: data.status || 'REVIEW',
      complete: !!data.complete,
      issueCount: data.validation && Array.isArray(data.validation.issues) ? data.validation.issues.length : 0,
      updatedAt: data.updatedAt
    });

    if (data.complete) writeText(k.step, '1');

    syncStatus(id, {
      localSaved: true,
      lastLocalSave: nowISO(),
      lastReason: clean(reason || 'local-save')
    });

    return data;
  }

  function loadLocal(eq) {
    var k = keys(eq);
    var state = readJSON(k.ccs, null);
    var payload = readJSON(k.exportPayload, null);
    return {
      state: state,
      payload: payload,
      validation: readJSON(k.validation, null),
      packageStatus: readJSON(k.packageStatus, null),
      syncStatus: readJSON(k.syncStatus, null)
    };
  }

  async function saveWithNexusLiveSync(eq, payload) {
    if (!window.NexusLiveSync || typeof window.NexusLiveSync.save !== 'function') return false;

    var id = safeEq(eq);
    await window.NexusLiveSync.save(id, 'ccs', payload);
    await window.NexusLiveSync.save(id, 'ccsVanguardValidation', payload.validation || {});
    await window.NexusLiveSync.save(id, 'packageStatus', {
      section: 'ccs',
      status: payload.status || 'REVIEW',
      complete: !!payload.complete,
      issueCount: payload.validation && Array.isArray(payload.validation.issues) ? payload.validation.issues.length : 0,
      updatedAt: payload.updatedAt || nowISO()
    });
    return true;
  }

  async function saveWithFirestoreBridge(eq, payload) {
    if (!window.NEXUS_FIREBASE || typeof window.NEXUS_FIREBASE.save !== 'function') return false;

    var id = safeEq(eq);
    await window.NEXUS_FIREBASE.save('equipment/' + id + '/forms/ccs', payload);
    if (payload.validation) {
      await window.NEXUS_FIREBASE.save('equipment/' + id + '/forms/ccsVanguardValidation', payload.validation);
    }
    return true;
  }

  async function savePayload(eq, payload, reason) {
    var id = safeEq(eq);
    var data = saveLocal(id, payload || {}, reason || 'save-payload');
    var online = typeof navigator === 'undefined' ? true : !!navigator.onLine;
    var firebaseSaved = false;
    var errors = [];

    if (!online) {
      enqueue(id, 'ccs', data, reason || 'offline');
      syncStatus(id, { firebaseSaved: false, queued: true, lastError: 'offline' });
      return { localSaved: true, firebaseSaved: false, queued: true, payload: data };
    }

    try {
      firebaseSaved = await saveWithNexusLiveSync(id, data);
    } catch (err) {
      errors.push(clean(err && err.message ? err.message : err));
    }

    try {
      var firestoreSaved = await saveWithFirestoreBridge(id, data);
      firebaseSaved = firebaseSaved || firestoreSaved;
    } catch (err2) {
      errors.push(clean(err2 && err2.message ? err2.message : err2));
    }

    if (!firebaseSaved) {
      enqueue(id, 'ccs', data, reason || 'firebase-unavailable');
    }

    syncStatus(id, {
      firebaseSaved: firebaseSaved,
      queued: !firebaseSaved,
      lastFirebaseSave: firebaseSaved ? nowISO() : '',
      lastError: errors.join(' | ')
    });

    return {
      localSaved: true,
      firebaseSaved: firebaseSaved,
      queued: !firebaseSaved,
      errors: errors,
      payload: data
    };
  }

  async function flushQueue() {
    var list = queue();
    var syncedIds = [];

    for (var i = 0; i < list.length; i += 1) {
      var item = list[i];
      try {
        var result = await savePayload(item.eq, item.payload, item.reason || 'queue-flush');
        if (result && result.firebaseSaved) syncedIds.push(item.id);
      } catch (err) {}
    }

    markQueueSynced(syncedIds);
    return { attempted: list.length, synced: syncedIds.length, remaining: queue().length };
  }

  function getRemoteCcsFromLiveData(data) {
    if (!data || typeof data !== 'object') return null;
    if (data.ccs && Array.isArray(data.ccs.steps)) return data.ccs;
    if (data.forms && data.forms.ccs && Array.isArray(data.forms.ccs.steps)) return data.forms.ccs;
    return null;
  }

  function newerThan(a, b) {
    var at = Date.parse((a && a.updatedAt) || '') || 0;
    var bt = Date.parse((b && b.updatedAt) || '') || 0;
    return at > bt;
  }

  function attach(options) {
    options = options || {};
    var eq = safeEq(options.eq || getEq());
    var getState = typeof options.getState === 'function' ? options.getState : null;
    var setState = typeof options.setState === 'function' ? options.setState : null;
    var render = typeof options.render === 'function' ? options.render : function () {};
    var onStatus = typeof options.onStatus === 'function' ? options.onStatus : function () {};

    syncStatus(eq, { attached: true, attachAt: nowISO() });

    var local = loadLocal(eq);
    if (local.state && setState) {
      var current = getState ? getState() : null;
      if (!current || !Array.isArray(current.steps) || !current.steps.length || newerThan(local.state, current)) {
        setState(local.state, 'local-hydrate');
        render();
      }
    }

    onStatus(syncStatus(eq, { hydrationChecked: true }));

    var unsubscribe = function () {};

    if (window.NexusLiveSync && typeof window.NexusLiveSync.listen === 'function') {
      try {
        unsubscribe = window.NexusLiveSync.listen(eq, function (data) {
          var remote = getRemoteCcsFromLiveData(data);
          syncStatus(eq, {
            firebaseConnected: !!data,
            lastRemoteSeen: data ? nowISO() : '',
            remoteHasCcs: !!remote
          });

          if (remote && setState) {
            var current = getState ? getState() : null;
            if (newerThan(remote, current)) {
              setState(remote, 'firebase-hydrate');
              saveLocal(eq, remote, 'firebase-hydrate-cache');
              render();
            }
          }
        });
      } catch (err) {
        syncStatus(eq, { firebaseConnected: false, lastError: clean(err && err.message ? err.message : err) });
      }
    }

    return unsubscribe;
  }

  function bindOnlineFlush() {
    if (window.__NEXUS_CCS_SYNC_ONLINE_BOUND) return;
    window.__NEXUS_CCS_SYNC_ONLINE_BOUND = true;

    window.addEventListener('online', function () {
      flushQueue().catch(function () {});
    });
  }

  bindOnlineFlush();

  var api = {
    __installed: true,
    version: VERSION,
    keys: keys,
    saveLocal: saveLocal,
    loadLocal: loadLocal,
    savePayload: savePayload,
    queue: queue,
    flushQueue: flushQueue,
    syncStatus: syncStatus,
    attach: attach
  };

  window.NEXUS_CCS_FIREBASE_SYNC = api;
  window.CCSFirebaseSync = api;
  window.NEXUS = window.NEXUS || {};
  window.NEXUS.CCSFirebaseSync = api;
})();
