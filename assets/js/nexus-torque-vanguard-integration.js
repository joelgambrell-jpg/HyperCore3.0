/*
  assets/js/nexus-torque-vanguard-integration.js
  Torque Log -> Vanguard requirement validation
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;

  var VERSION = '1.0.0';
  var PANEL_ID = 'nexusTorqueVanguardPanel';
  function qs(){ try { return new URLSearchParams(location.search); } catch(e){ return new URLSearchParams(''); } }
  function eq(){ return (qs().get('eq') || localStorage.getItem('nexus_active_equipment') || localStorage.getItem('nexus_active_eq') || 'NO_EQ').trim() || 'NO_EQ'; }
  function now(){ return new Date().toISOString(); }
  function text(v){ return String(v == null ? '' : v).trim(); }
  function parse(raw, fallback){ try { return raw ? JSON.parse(raw) : fallback; } catch(e){ return fallback; } }
  function storeKey(){ return 'nexus_' + eq() + '_torque_vanguard_validation_v1'; }

  function requirements(){
    if (!window.NEXUS_REQUIREMENTS || typeof window.NEXUS_REQUIREMENTS.consumeForValidation !== 'function') return [];
    return window.NEXUS_REQUIREMENTS.consumeForValidation('torque');
  }

  function readTorqueRows(){
    var rows = [];
    try {
      Object.keys(localStorage).forEach(function(k){
        if (k.toLowerCase().indexOf('torque') === -1 || k.indexOf(eq()) === -1) return;
        var v = parse(localStorage.getItem(k), null);
        if (Array.isArray(v)) rows = rows.concat(v);
        if (v && Array.isArray(v.rows)) rows = rows.concat(v.rows);
        if (v && Array.isArray(v.torqueRows)) rows = rows.concat(v.torqueRows);
      });
    } catch(e) {}
    return rows;
  }

  function extractEntry(row){
    row = row || {};
    var value = row.torque || row.value || row.measuredTorque || row.ftlb || row.ft_lbs || row.nm || row.reading;
    return {
      value:value,
      measuredValue:value,
      torque:value,
      row:row,
      eq:eq(),
      module:'torque'
    };
  }

  async function validateRows(){
    var reqs = requirements();
    var rows = readTorqueRows();
    var results = [];
    if (!reqs.length) {
      return save({ state:'review', summary:'No approved torque requirements found in Vanguard library.', requirements:[], rows:rows, results:[], updatedAt:now() });
    }
    if (!rows.length) {
      return save({ state:'review', summary:'No torque rows found to validate yet.', requirements:reqs, rows:[], results:[], updatedAt:now() });
    }
    for (var i=0;i<rows.length;i++) {
      var payload = { validationId:eq() + '_torque_' + i, eq:eq(), entry:extractEntry(rows[i]), requirements:reqs };
      var result;
      if (window.VANGUARD_AI_BRIDGE && typeof window.VANGUARD_AI_BRIDGE.validateEntry === 'function') result = await window.VANGUARD_AI_BRIDGE.validateEntry(payload);
      else if (window.NEXUS_AI_CLIENT && typeof window.NEXUS_AI_CLIENT.validateEntry === 'function') result = await window.NEXUS_AI_CLIENT.validateEntry(payload);
      else result = { state:'review', summary:'Vanguard AI client not loaded.', findings:[] };
      results.push(result);
    }
    var blocked = results.some(function(r){ return r.state === 'blocked'; });
    var state = blocked ? 'blocked' : results.every(function(r){ return r.state === 'pass'; }) ? 'pass' : 'review';
    return save({ state:state, summary:'Validated ' + rows.length + ' torque row(s) against ' + reqs.length + ' approved requirement(s).', requirements:reqs, rows:rows, results:results, updatedAt:now() });
  }

  function save(payload){
    try { localStorage.setItem(storeKey(), JSON.stringify(payload)); } catch(e) {}
    try {
      if (window.NEXUS_OFFLINE && typeof window.NEXUS_OFFLINE.saveLocal === 'function') window.NEXUS_OFFLINE.saveLocal('torque/' + eq() + '/vanguard-validation', payload, 'torque-vanguard');
      if (window.NEXUS_FIREBASE && typeof window.NEXUS_FIREBASE.save === 'function') window.NEXUS_FIREBASE.save('torque/' + eq() + '/vanguard-validation', payload);
    } catch(e) {}
    window.dispatchEvent(new CustomEvent('nexus:torque-vanguard-validated', { detail:payload }));
    render(payload);
    return payload;
  }

  function render(payload){
    if (!document.body) return;
    var panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      panel.style.cssText = 'position:fixed;right:12px;bottom:72px;z-index:99997;max-width:380px;padding:12px;border-radius:14px;background:rgba(8,18,36,.92);color:#e0f2fe;border:1px solid rgba(125,211,252,.55);font:13px Arial,sans-serif;box-shadow:0 10px 28px rgba(0,0,0,.35);';
      document.body.appendChild(panel);
    }
    payload = payload || parse(localStorage.getItem(storeKey()), null) || {};
    var state = payload.state || 'ready';
    panel.innerHTML = '<b>NEXUS Vanguard Torque</b><br>' +
      '<span>State: ' + state.toUpperCase() + '</span><br>' +
      '<span>' + text(payload.summary || 'Ready to validate torque against approved requirements.') + '</span><br>' +
      '<button type="button" id="nexusTorqueValidateBtn" style="margin-top:8px;padding:8px 10px;border:0;border-radius:10px;font-weight:900;background:#38bdf8;color:#03121f;cursor:pointer;">Validate Torque</button>';
    var btn = document.getElementById('nexusTorqueValidateBtn');
    if (btn) btn.onclick = function(){ validateRows().catch(function(err){ alert('Vanguard torque validation failed: ' + (err.message || err)); }); };
  }

  function init(){ render(); }
  window.NEXUS_TORQUE_VANGUARD = { version:VERSION, validateRows:validateRows, readTorqueRows:readTorqueRows, requirements:requirements };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
