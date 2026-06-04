/*
  assets/js/vanguard_authority_adapters.js
  HyperCore / NEXUS Vanguard Authority Adapters

  Purpose:
  - Maps real/legacy HyperCore localStorage and Vanguard state shapes into the
    Validation Authority Engine without changing existing pages.
  - Defensive by design: missing data becomes REVIEW/BLOCKED in the authority result,
    but this file does not mutate workflow state unless a caller explicitly asks.
  - Stabilized to prevent UI event/render loops.
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_AUTHORITY_ADAPTERS && window.NEXUS_VANGUARD_AUTHORITY_ADAPTERS.__installed) return;

  var VERSION = '1.1.0-stable-dispatch';

  function clean(v){ return String(v == null ? '' : v).trim(); }
  function lower(v){ return clean(v).toLowerCase(); }
  function nowISO(){ return new Date().toISOString(); }

  function readJSON(key, fallback){
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch(e){ return fallback; }
  }

  function writeJSON(key, value){
    try { localStorage.setItem(key, JSON.stringify(value)); } catch(e) {}
    return value;
  }

  function getEq(input){
    if (input && typeof input === 'object') {
      var i = clean(input.eq || input.equipmentId || input.equipment || '');
      if (i) return i;
    }
    try {
      var p = new URLSearchParams(location.search);
      var q = clean(p.get('eq') || p.get('equipment') || p.get('equipmentId') || '');
      if (q) return q;
    } catch(e) {}
    return clean(localStorage.getItem('nexus_active_equipment') || localStorage.getItem('nexus_active_eq') || 'NO_EQ') || 'NO_EQ';
  }

  function truthy(v){
    return ['1','true','yes','complete','completed','done','pass','passed','validated','ready'].indexOf(lower(v)) !== -1;
  }

  function firstExisting(keys){
    for (var i=0;i<keys.length;i+=1){
      var raw = localStorage.getItem(keys[i]);
      if (raw != null && raw !== '') return { key:keys[i], value:raw };
    }
    return null;
  }

  function normalizeRows(raw){
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw.rows)) return raw.rows;
    if (Array.isArray(raw.items)) return raw.items;
    if (Array.isArray(raw.steps)) return raw.steps;
    if (Array.isArray(raw.results)) return raw.results;
    if (raw.data && Array.isArray(raw.data.rows)) return raw.data.rows;
    return [];
  }

  function workflowStep(eq, id, label, aliases){
    aliases = aliases || [id];
    var keys = [];
    aliases.forEach(function(a){
      keys.push('nexus_' + eq + '_step_' + a);
      keys.push('nexus_' + eq + '_' + a + '_complete');
      keys.push('nexus_' + eq + '_' + a + '_completed');
      keys.push('nexus_' + eq + '_' + a + '_done');
      keys.push('nexus_' + eq + '_' + a + '_validated');
      keys.push('nexus_' + eq + '_' + a + '_signed_off');
    });
    var found = firstExisting(keys);
    return {
      id:id,
      label:label,
      complete:!!(found && truthy(found.value)),
      sourceKey:found ? found.key : '',
      rawValue:found ? found.value : ''
    };
  }

  function getWorkflowSnapshot(eq){
    eq = clean(eq || getEq());
    var steps = [
      workflowStep(eq, 'rif', 'Receipt Inspection', ['rif','receipt','receipt_inspection']),
      workflowStep(eq, 'phenolic', 'Phenolic Display', ['phenolic','phenolic_display','labels','labeling']),
      workflowStep(eq, 'torque', 'Torque', ['torque','torque_log','torque_application']),
      workflowStep(eq, 'l2', 'L2 Verification', ['l2','l2_verification','level2','level_2']),
      workflowStep(eq, 'meg', 'Megohmmeter Testing', ['meg','meg_log','megohmmeter']),
      workflowStep(eq, 'prefod', 'Pre-FOD', ['prefod','pre_fod','pre-fod','fod']),
      workflowStep(eq, 'fpv', 'Finished Product Verification', ['fpv','fpv_photo','finished_product']),
      workflowStep(eq, 'ccs', 'Construction Check Sheet', ['ccs','construction_check_sheet'])
    ];

    var megLine = firstExisting(['nexus_' + eq + '_step_megohmmeter_line','nexus_' + eq + '_meg_line_complete']);
    var megLoad = firstExisting(['nexus_' + eq + '_step_megohmmeter_load','nexus_' + eq + '_meg_load_complete']);
    var meg = steps.filter(function(s){ return s.id === 'meg'; })[0];
    if (meg && !meg.complete && megLine && megLoad && truthy(megLine.value) && truthy(megLoad.value)) {
      meg.complete = true;
      meg.sourceKey = megLine.key + ' + ' + megLoad.key;
      meg.rawValue = 'line/load complete';
    }

    return {
      eq:eq,
      steps:steps,
      complete:steps.filter(function(s){ return s.complete; }).length,
      total:steps.length,
      remaining:steps.filter(function(s){ return !s.complete; }).length,
      percent:steps.length ? Math.round((steps.filter(function(s){ return s.complete; }).length / steps.length) * 100) : 0,
      updatedAt:nowISO()
    };
  }

  function getCcsSnapshot(eq){
    eq = clean(eq || getEq());
    var exportPayload = readJSON('nexus_' + eq + '_ccs_vanguard_export', null);
    var validation = readJSON('nexus_' + eq + '_ccs_vanguard_validation', null);
    var twoTab = readJSON('nexus_' + eq + '_ccs_two_tab_v1', null);
    var rows = normalizeRows(exportPayload || validation || twoTab);

    return {
      eq:eq,
      exportPayload:exportPayload,
      validation:validation,
      source: exportPayload ? 'ccs_vanguard_export' : validation ? 'ccs_vanguard_validation' : twoTab ? 'ccs_two_tab_v1' : 'none',
      rows:rows,
      status: clean((exportPayload && exportPayload.status) || (validation && validation.status) || ''),
      complete: !!(exportPayload && exportPayload.complete),
      finalSignoff: exportPayload && exportPayload.finalSignoff || twoTab && twoTab.finalSignoff || null,
      updatedAt: nowISO()
    };
  }

  function getTorqueSnapshot(eq){
    eq = clean(eq || getEq());
    var candidates = [
      'nexus_' + eq + '_torque_vanguard_validation_v1',
      'nexus_' + eq + '_torque_validation',
      'nexus_' + eq + '_torque_log',
      'nexus_' + eq + '_torque_rows',
      'nexus_torque_' + eq,
      'torque_' + eq
    ];
    var found = null;
    for (var i=0;i<candidates.length;i+=1){
      var obj = readJSON(candidates[i], null);
      if (obj) { found = { key:candidates[i], value:obj }; break; }
    }
    var rows = found ? normalizeRows(found.value) : [];
    var blocked = found && /blocked|fail|failed/i.test(clean(found.value.state || found.value.status || ''));
    return {
      eq:eq,
      found:!!found,
      sourceKey:found ? found.key : '',
      raw:found ? found.value : null,
      rows:rows,
      status:found ? clean(found.value.state || found.value.status || '') : '',
      blocked:!!blocked,
      complete:truthy(localStorage.getItem('nexus_' + eq + '_step_torque')),
      updatedAt:nowISO()
    };
  }

  function getMegSnapshot(eq){
    eq = clean(eq || getEq());
    var candidates = [
      'nexus_' + eq + '_meg_vanguard_validation_v1',
      'nexus_' + eq + '_meg_validation',
      'nexus_' + eq + '_meg_log',
      'nexus_' + eq + '_meg_rows',
      'nexus_meg_' + eq,
      'meg_' + eq
    ];
    var found = null;
    for (var i=0;i<candidates.length;i+=1){
      var obj = readJSON(candidates[i], null);
      if (obj) { found = { key:candidates[i], value:obj }; break; }
    }
    var rows = found ? normalizeRows(found.value) : [];
    var line = truthy(localStorage.getItem('nexus_' + eq + '_step_megohmmeter_line'));
    var load = truthy(localStorage.getItem('nexus_' + eq + '_step_megohmmeter_load'));
    return {
      eq:eq,
      found:!!found,
      sourceKey:found ? found.key : '',
      raw:found ? found.value : null,
      rows:rows,
      status:found ? clean(found.value.state || found.value.status || '') : '',
      lineComplete:line,
      loadComplete:load,
      complete:truthy(localStorage.getItem('nexus_' + eq + '_step_meg')) || (line && load),
      updatedAt:nowISO()
    };
  }

  function getPackageReadinessSnapshot(eq){
    eq = clean(eq || getEq());
    var readiness = readJSON('nexus_' + eq + '_package_readiness', null);
    return {
      eq:eq,
      found:!!readiness,
      raw:readiness,
      status:readiness ? clean(readiness.status || '') : '',
      blockers:readiness && Array.isArray(readiness.blockers) ? readiness.blockers : [],
      blockedCount:Number(readiness && readiness.blockedCount || 0),
      updatedAt:nowISO()
    };
  }

  function buildAuthorityInput(eq){
    eq = clean(eq || getEq());
    return {
      eq:eq,
      workflow:getWorkflowSnapshot(eq),
      ccs:getCcsSnapshot(eq),
      torque:getTorqueSnapshot(eq),
      meg:getMegSnapshot(eq),
      packageReadiness:getPackageReadinessSnapshot(eq),
      requirements:readJSON('nexus_vanguard_requirements', {}),
      conflicts:readJSON('nexus_vanguard_conflicts_v1', { conflicts:[] }),
      capturedAt:nowISO()
    };
  }

  function runAuthority(eq, options){
    options = options || {};
    eq = clean(eq || getEq());
    var authority = window.NEXUS_VANGUARD_VALIDATION_AUTHORITY || window.VanguardValidationAuthority;
    if (!authority || typeof authority.validatePackage !== 'function') {
      return { status:'REVIEW', canPass:false, message:'Validation Authority Engine is not loaded.', eq:eq, capturedAt:nowISO() };
    }
    var input = buildAuthorityInput(eq);
    var result = authority.validatePackage(eq, { input:input, mode:options.mode || 'FIELD' });
    result.input = input;
    writeJSON('nexus_' + eq + '_authority_snapshot_v1', result);
    if (!options.silent) {
      try { window.dispatchEvent(new CustomEvent('vanguard:authority-adapter:updated', { detail:result })); } catch(e) {}
    }
    return result;
  }

  function installAutoSnapshot(){
    if (installAutoSnapshot.__installed) return;
    installAutoSnapshot.__installed = true;
    var timer = null;
    function schedule(){
      clearTimeout(timer);
      timer = setTimeout(function(){ try { runAuthority(getEq(), { silent:false }); } catch(e) {} }, 250);
    }
    window.addEventListener('storage', schedule);
    window.addEventListener('nexus-workflow-change', schedule);
    window.addEventListener('vanguard:update', schedule);
    window.addEventListener('vanguard:document-intelligence:updated', schedule);
    setTimeout(schedule, 750);
  }

  var api = {
    __installed:true,
    version:VERSION,
    getEq:getEq,
    getWorkflowSnapshot:getWorkflowSnapshot,
    getCcsSnapshot:getCcsSnapshot,
    getTorqueSnapshot:getTorqueSnapshot,
    getMegSnapshot:getMegSnapshot,
    getPackageReadinessSnapshot:getPackageReadinessSnapshot,
    buildAuthorityInput:buildAuthorityInput,
    runAuthority:runAuthority,
    installAutoSnapshot:installAutoSnapshot
  };

  window.NEXUS_VANGUARD_AUTHORITY_ADAPTERS = api;
  window.VanguardAuthorityAdapters = api;
  window.NEXUS = window.NEXUS || {};
  window.NEXUS.VanguardAuthorityAdapters = api;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installAutoSnapshot);
  else installAutoSnapshot();
})();