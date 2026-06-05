/*
  assets/js/vanguard_storage_audit.js
  HyperCore / NEXUS Vanguard Storage Audit + Authority Test Harness

  Purpose:
  - Map actual localStorage keys/payload shapes used by HyperCore/Vanguard.
  - Identify unmapped or ambiguous data sources before authority enforcement.
  - Run safe local tests against the Authority Engine without changing field workflow.

  This file is diagnostic only.
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_STORAGE_AUDIT && window.NEXUS_VANGUARD_STORAGE_AUDIT.__installed) return;

  var VERSION = '1.0.0-storage-audit';

  function clean(v){ return String(v == null ? '' : v).trim(); }
  function lower(v){ return clean(v).toLowerCase(); }
  function nowISO(){ return new Date().toISOString(); }

  function readJSON(key, fallback){
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch(e){ return fallback; }
  }

  function truthy(v){
    return ['1','true','yes','complete','completed','done','pass','passed','validated','ready'].indexOf(lower(v)) !== -1;
  }

  function getEq(input){
    var direct = clean(input || '');
    if (direct) return direct;
    try {
      var p = new URLSearchParams(location.search || '');
      var q = clean(p.get('eq') || p.get('equipment') || p.get('equipmentId'));
      if (q) return q;
    } catch(e) {}
    return clean(localStorage.getItem('nexus_active_equipment') || localStorage.getItem('nexus_active_eq') || 'NO_EQ') || 'NO_EQ';
  }

  function localKeys(){
    var keys = [];
    try {
      for (var i = 0; i < localStorage.length; i += 1) keys.push(localStorage.key(i));
    } catch(e) {}
    return keys.filter(Boolean).sort();
  }

  function existingKeys(patterns){
    var keys = localKeys();
    return keys.filter(function(key){
      return patterns.some(function(pattern){
        if (pattern instanceof RegExp) return pattern.test(key);
        return key.indexOf(String(pattern)) !== -1;
      });
    });
  }

  function shapeOf(value){
    if (value == null) return { type:'missing' };
    if (Array.isArray(value)) return { type:'array', length:value.length, firstKeys:value[0] && typeof value[0] === 'object' ? Object.keys(value[0]).slice(0,20) : [] };
    if (typeof value === 'object') {
      var out = { type:'object', keys:Object.keys(value).slice(0,30) };
      ['rows','items','steps','results','requirements','validation','finalSignoff','status','state','complete'].forEach(function(k){
        if (value[k] != null) out[k] = Array.isArray(value[k]) ? { type:'array', length:value[k].length } : typeof value[k];
      });
      return out;
    }
    return { type:typeof value, sample:String(value).slice(0,80) };
  }

  function readShape(key){
    var raw = null;
    try { raw = localStorage.getItem(key); } catch(e) {}
    if (raw == null) return { key:key, exists:false, shape:{ type:'missing' } };
    var parsed = readJSON(key, raw);
    return { key:key, exists:true, shape:shapeOf(parsed) };
  }

  function workflowAudit(eq){
    eq = getEq(eq);
    var wf = window.NEXUS_WORKFLOW || null;
    var workflow = null;
    if (wf && typeof wf.getAllSteps === 'function' && typeof wf.getProgress === 'function') {
      workflow = { source:'NEXUS_WORKFLOW', steps:wf.getAllSteps(eq), progress:wf.getProgress(eq), readiness: wf.getPackageReadiness ? wf.getPackageReadiness(eq) : null };
    } else {
      workflow = { source:'fallback', steps:[], progress:null, readiness:null, warning:'NEXUS_WORKFLOW is not loaded.' };
    }
    return workflow;
  }

  function ccsAudit(eq){
    eq = getEq(eq);
    var keys = [
      'nexus_' + eq + '_ccs_vanguard_export',
      'nexus_' + eq + '_ccs_vanguard_validation',
      'nexus_' + eq + '_ccs_two_tab_v1',
      'nexus_' + eq + '_ccs_signed_off',
      'nexus_' + eq + '_step_ccs'
    ];
    return {
      module:'ccs',
      sourceOfTruth:'construction_check_sheet_import.html writes nexus_<eq>_ccs_vanguard_export and workflow key nexus_<eq>_step_ccs when complete.',
      keys:keys.map(readShape),
      status:clean((readJSON(keys[0], {}) || {}).status || ''),
      complete:!!((readJSON(keys[0], {}) || {}).complete || truthy(localStorage.getItem(keys[3])) || truthy(localStorage.getItem(keys[4]))),
      risk: readJSON(keys[0], null) ? 'LOW' : 'MEDIUM',
      note: readJSON(keys[0], null) ? 'CCS Vanguard export payload exists.' : 'CCS export payload not found for this equipment yet.'
    };
  }

  function torqueAudit(eq){
    eq = getEq(eq);
    var keys = [
      'nexus_' + eq + '_torque_vanguard_validation_v1',
      'nexus_' + eq + '_torque_validation',
      'nexus_' + eq + '_torque_log',
      'nexus_' + eq + '_torque_rows',
      'nexus_' + eq + '_step_torque'
    ];
    return {
      module:'torque',
      sourceOfTruth:'assets/js/nexus-torque-vanguard-integration.js writes nexus_<eq>_torque_vanguard_validation_v1. Workflow completion uses nexus_<eq>_step_torque.',
      keys:keys.map(readShape),
      validationExists:!!readJSON(keys[0], null),
      complete:truthy(localStorage.getItem(keys[4])),
      risk: readJSON(keys[0], null) ? 'LOW' : 'MEDIUM',
      note: readJSON(keys[0], null) ? 'Torque Vanguard validation payload exists.' : 'Torque validation payload not found; authority can still use workflow completion but cannot inspect torque rows.'
    };
  }

  function megAudit(eq){
    eq = getEq(eq);
    var keys = [
      'nexus_' + eq + '_meg_vanguard_validation_v1',
      'nexus_' + eq + '_meg_validation',
      'nexus_' + eq + '_meg_log',
      'nexus_' + eq + '_meg_rows',
      'nexus_' + eq + '_step_meg',
      'nexus_' + eq + '_step_megohmmeter_line',
      'nexus_' + eq + '_step_megohmmeter_load'
    ];
    var line = truthy(localStorage.getItem(keys[5]));
    var load = truthy(localStorage.getItem(keys[6]));
    return {
      module:'meg',
      sourceOfTruth:'Workflow completion is canonical through NEXUS_WORKFLOW: nexus_<eq>_step_meg OR line/load complete. A dedicated meg Vanguard validation payload is not confirmed yet.',
      keys:keys.map(readShape),
      validationExists:!!readJSON(keys[0], null),
      complete:truthy(localStorage.getItem(keys[4])) || (line && load),
      lineComplete:line,
      loadComplete:load,
      risk: readJSON(keys[0], null) ? 'LOW' : 'MEDIUM',
      note: readJSON(keys[0], null) ? 'Meg Vanguard validation payload exists.' : 'Dedicated Meg Vanguard validation payload not confirmed. Authority should not infer row-level meg correctness yet.'
    };
  }

  function genericWorkflowModuleAudit(eq, id, label){
    eq = getEq(eq);
    var keys = ['nexus_' + eq + '_step_' + id, 'nexus_' + eq + '_' + id + '_complete', 'nexus_' + eq + '_' + id + '_completed', 'nexus_' + eq + '_' + id + '_done'];
    return { module:id, label:label, sourceOfTruth:'NEXUS_WORKFLOW step status', keys:keys.map(readShape), complete:keys.some(function(k){ return truthy(localStorage.getItem(k)); }), risk:'LOW' };
  }

  function packageAudit(eq){
    eq = getEq(eq);
    var keys = ['nexus_' + eq + '_package_readiness', 'nexus_' + eq + '_authority_snapshot_v1', 'nexus_vanguard_authority_' + eq];
    var adapters = window.NEXUS_VANGUARD_AUTHORITY_ADAPTERS || window.VanguardAuthorityAdapters;
    var authority = null;
    try { authority = adapters && typeof adapters.runAuthority === 'function' ? adapters.runAuthority(eq, { silent:true }) : readJSON(keys[1], null); } catch(e) { authority = { status:'REVIEW', message:'Authority run failed: ' + (e.message || e) }; }
    return {
      module:'package',
      sourceOfTruth:'NEXUS_WORKFLOW progress for field completion + Authority snapshot for reviews/stops.',
      keys:keys.map(readShape),
      authority: authority ? { status:authority.status, blockerCount:authority.blockerCount, reviewCount:authority.reviewCount, message:authority.message } : null,
      risk: authority ? 'LOW' : 'MEDIUM'
    };
  }

  function runAudit(eq){
    eq = getEq(eq);
    var audit = {
      version:VERSION,
      eq:eq,
      generatedAt:nowISO(),
      workflow:workflowAudit(eq),
      modules:[
        genericWorkflowModuleAudit(eq, 'rif', 'Receipt Inspection'),
        genericWorkflowModuleAudit(eq, 'phenolic', 'Phenolic Display'),
        torqueAudit(eq),
        genericWorkflowModuleAudit(eq, 'l2', 'L2 Verification'),
        megAudit(eq),
        genericWorkflowModuleAudit(eq, 'prefod', 'Pre-FOD'),
        genericWorkflowModuleAudit(eq, 'fpv', 'Finished Product Verification'),
        ccsAudit(eq),
        packageAudit(eq)
      ],
      nearbyKeys: existingKeys([new RegExp('^nexus_' + eq.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '_'), new RegExp(eq.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))]).slice(0,200)
    };
    try { localStorage.setItem('nexus_' + eq + '_storage_audit_v1', JSON.stringify(audit)); } catch(e) {}
    return audit;
  }

  function runAuthorityTests(eq){
    eq = getEq(eq);
    var authority = window.NEXUS_VANGUARD_VALIDATION_AUTHORITY || window.VanguardValidationAuthority;
    var adapters = window.NEXUS_VANGUARD_AUTHORITY_ADAPTERS || window.VanguardAuthorityAdapters;
    var results = [];

    function push(name, pass, detail){ results.push({ name:name, pass:!!pass, detail:detail || null }); }

    push('Authority engine loaded', !!(authority && authority.version), authority && authority.version);
    push('Authority adapters loaded', !!(adapters && adapters.version), adapters && adapters.version);
    push('NEXUS_WORKFLOW loaded', !!(window.NEXUS_WORKFLOW && window.NEXUS_WORKFLOW.getProgress), window.NEXUS_WORKFLOW && window.NEXUS_WORKFLOW.VERSION);

    var workflow = workflowAudit(eq);
    push('Workflow snapshot available', !!(workflow && workflow.progress && Array.isArray(workflow.steps)), workflow.progress || workflow.warning);

    var adapterInput = null;
    try { adapterInput = adapters && adapters.buildAuthorityInput ? adapters.buildAuthorityInput(eq) : null; } catch(e) { adapterInput = { error:e.message || String(e) }; }
    push('Adapter input builds', !!(adapterInput && adapterInput.workflow && adapterInput.ccs && adapterInput.torque && adapterInput.meg), adapterInput && adapterInput.error ? adapterInput.error : null);

    var packageResult = null;
    try { packageResult = adapters && adapters.runAuthority ? adapters.runAuthority(eq, { silent:true }) : null; } catch(e2) { packageResult = { error:e2.message || String(e2) }; }
    push('Authority package run completes', !!(packageResult && !packageResult.error && packageResult.status), packageResult && (packageResult.error || packageResult.status));

    if (packageResult && packageResult.input && packageResult.input.workflow && workflow.progress) {
      push('Authority workflow percent matches NEXUS_WORKFLOW', packageResult.input.workflow.percent === workflow.progress.percent, { authorityPercent:packageResult.input.workflow.percent, workflowPercent:workflow.progress.percent });
      push('Authority workflow complete count matches NEXUS_WORKFLOW', packageResult.input.workflow.complete === workflow.progress.complete, { authorityComplete:packageResult.input.workflow.complete, workflowComplete:workflow.progress.complete });
    } else {
      push('Authority workflow consistency check skipped', false, 'Missing authority input workflow or canonical workflow progress.');
    }

    var ccs = ccsAudit(eq);
    push('CCS source classified', !!ccs.sourceOfTruth, ccs.note);
    var torque = torqueAudit(eq);
    push('Torque source classified', !!torque.sourceOfTruth, torque.note);
    var meg = megAudit(eq);
    push('Meg source classified honestly', meg.validationExists || meg.risk === 'MEDIUM', meg.note);

    var out = { version:VERSION, eq:eq, generatedAt:nowISO(), pass:results.every(function(r){ return r.pass; }), results:results };
    try { localStorage.setItem('nexus_' + eq + '_authority_test_results_v1', JSON.stringify(out)); } catch(e3) {}
    return out;
  }

  var api = { __installed:true, version:VERSION, runAudit:runAudit, runAuthorityTests:runAuthorityTests, keys:localKeys, existingKeys:existingKeys };
  window.NEXUS_VANGUARD_STORAGE_AUDIT = api;
  window.VanguardStorageAudit = api;
  window.NEXUS = window.NEXUS || {};
  window.NEXUS.VanguardStorageAudit = api;
})();
