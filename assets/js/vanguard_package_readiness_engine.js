/*
  assets/js/vanguard_package_readiness_engine.js
  HyperCore / NEXUS Vanguard Package Readiness Engine

  Purpose:
  - Additive pre-Firebase risk mitigation layer.
  - Builds one canonical package readiness snapshot from existing localStorage,
    NEXUS_WORKFLOW, Authority Adapters, Validation Authority, CCS, torque, meg,
    FPV, and document conflict data.
  - Generates engineer-facing alert records without blocking field workflow.
  - Writes Firebase-ready snapshot keys while preserving every existing page key.
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_PACKAGE_READINESS && window.NEXUS_VANGUARD_PACKAGE_READINESS.__installed) return;

  var VERSION = '1.0.0-canonical-pre-firebase';
  var SNAPSHOT_SUFFIX = '_package_readiness_canonical_v1';
  var ALERT_SUFFIX = '_engineer_alerts_v1';
  var INDEX_KEY = 'nexus_vanguard_engineer_alert_index_v1';

  function clean(v){ return String(v == null ? '' : v).trim(); }
  function lower(v){ return clean(v).toLowerCase(); }
  function upper(v){ return clean(v).toUpperCase(); }
  function nowISO(){ return new Date().toISOString(); }

  function truthy(v){
    return ['1','true','yes','complete','completed','done','pass','passed','validated','ready'].indexOf(lower(v)) !== -1;
  }

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
    return clean(localStorage.getItem('nexus_active_equipment') || localStorage.getItem('nexus_active_eq') || 'NO_EQ') || 'NO_EQ';
  }

  function localStepComplete(eq, step){
    var aliases = [step];
    if (step === 'ccs') aliases.push('construction_check_sheet');
    if (step === 'prefod') aliases.push('pre_fod','pre-fod','fod');
    if (step === 'fpv') aliases.push('fpv_photo','finished_product');
    if (step === 'meg') aliases.push('megohmmeter','meg_log');
    if (step === 'torque') aliases.push('torque_log');
    if (step === 'phenolic') aliases.push('phenolic_display','labels');
    if (step === 'l2') aliases.push('level2','level_2','l2_verification');
    if (step === 'rif') aliases.push('receipt','receipt_inspection');

    var keys = [];
    aliases.forEach(function(a){
      keys.push('nexus_' + eq + '_step_' + a);
      keys.push('nexus_' + eq + '_' + a + '_complete');
      keys.push('nexus_' + eq + '_' + a + '_completed');
      keys.push('nexus_' + eq + '_' + a + '_done');
      keys.push('nexus_' + eq + '_' + a + '_validated');
      keys.push('nexus_' + eq + '_' + a + '_signed_off');
    });

    for (var i=0;i<keys.length;i+=1) {
      var raw = localStorage.getItem(keys[i]);
      if (truthy(raw)) return { complete:true, sourceKey:keys[i], rawValue:raw };
    }

    if (step === 'meg') {
      var lineKey = 'nexus_' + eq + '_step_megohmmeter_line';
      var loadKey = 'nexus_' + eq + '_step_megohmmeter_load';
      if (truthy(localStorage.getItem(lineKey)) && truthy(localStorage.getItem(loadKey))) {
        return { complete:true, sourceKey:lineKey + ' + ' + loadKey, rawValue:'line/load complete' };
      }
    }

    return { complete:false, sourceKey:'', rawValue:'' };
  }

  function fallbackWorkflow(eq){
    var defs = [
      { id:'rif', label:'Receipt Inspection' },
      { id:'phenolic', label:'Phenolic Display' },
      { id:'torque', label:'Torque' },
      { id:'l2', label:'L2 Verification' },
      { id:'meg', label:'Megohmmeter Testing' },
      { id:'prefod', label:'Pre-FOD' },
      { id:'fpv', label:'Finished Product Verification' },
      { id:'ccs', label:'Construction Check Sheet' }
    ];
    var steps = defs.map(function(def){
      var found = localStepComplete(eq, def.id);
      return { id:def.id, label:def.label, complete:found.complete, sourceKey:found.sourceKey, rawValue:found.rawValue };
    });
    var complete = steps.filter(function(s){ return s.complete; }).length;
    return { eq:eq, source:'package-readiness-fallback', steps:steps, complete:complete, total:steps.length, remaining:steps.length - complete, percent:steps.length ? Math.round((complete / steps.length) * 100) : 0, updatedAt:nowISO() };
  }

  function workflowSnapshot(eq){
    var adapters = window.NEXUS_VANGUARD_AUTHORITY_ADAPTERS || window.VanguardAuthorityAdapters;
    try {
      if (adapters && typeof adapters.getWorkflowSnapshot === 'function') {
        var adapterWorkflow = adapters.getWorkflowSnapshot(eq);
        if (adapterWorkflow && Array.isArray(adapterWorkflow.steps)) {
          adapterWorkflow.source = adapterWorkflow.source || 'authority-adapter';
          return adapterWorkflow;
        }
      }
    } catch(e) {}

    try {
      var wf = window.NEXUS_WORKFLOW;
      if (wf && typeof wf.getAllSteps === 'function' && typeof wf.getProgress === 'function') {
        var steps = wf.getAllSteps(eq) || [];
        var progress = wf.getProgress(eq) || {};
        return { eq:eq, source:'NEXUS_WORKFLOW', steps:steps, complete:Number(progress.complete || 0), total:Number(progress.total || steps.length || 0), remaining:Number(progress.remaining || 0), percent:Number(progress.percent || 0), updatedAt:nowISO() };
      }
    } catch(e2) {}

    return fallbackWorkflow(eq);
  }

  function normalizeRows(raw){
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw.steps)) return raw.steps;
    if (Array.isArray(raw.rows)) return raw.rows;
    if (Array.isArray(raw.items)) return raw.items;
    if (Array.isArray(raw.results)) return raw.results;
    if (raw.data && Array.isArray(raw.data.rows)) return raw.data.rows;
    return [];
  }

  function ccsSnapshot(eq){
    var adapters = window.NEXUS_VANGUARD_AUTHORITY_ADAPTERS || window.VanguardAuthorityAdapters;
    try {
      if (adapters && typeof adapters.getCcsSnapshot === 'function') return adapters.getCcsSnapshot(eq);
    } catch(e) {}
    var exportPayload = readJSON('nexus_' + eq + '_ccs_vanguard_export', null);
    var validation = readJSON('nexus_' + eq + '_ccs_vanguard_validation', null);
    var twoTab = readJSON('nexus_' + eq + '_ccs_two_tab_v1', null);
    var rows = normalizeRows(exportPayload || validation || twoTab);
    return { eq:eq, source:exportPayload ? 'ccs_vanguard_export' : validation ? 'ccs_vanguard_validation' : twoTab ? 'ccs_two_tab_v1' : 'none', exportPayload:exportPayload, validation:validation, rows:rows, status:clean((exportPayload && exportPayload.status) || (validation && validation.status) || ''), complete:!!(exportPayload && exportPayload.complete) || truthy(localStorage.getItem('nexus_' + eq + '_step_ccs')), finalSignoff:exportPayload && exportPayload.finalSignoff || twoTab && twoTab.finalSignoff || null, updatedAt:nowISO() };
  }

  function torqueSnapshot(eq){
    var adapters = window.NEXUS_VANGUARD_AUTHORITY_ADAPTERS || window.VanguardAuthorityAdapters;
    try {
      if (adapters && typeof adapters.getTorqueSnapshot === 'function') return adapters.getTorqueSnapshot(eq);
    } catch(e) {}
    var keys = ['nexus_' + eq + '_torque_vanguard_validation_v1','nexus_' + eq + '_torque_validation','nexus_' + eq + '_torque_log','nexus_' + eq + '_torque_rows','nexus_torque_' + eq,'torque_' + eq];
    var found = null;
    for (var i=0;i<keys.length;i+=1) {
      var obj = readJSON(keys[i], null);
      if (obj) { found = { key:keys[i], value:obj }; break; }
    }
    return { eq:eq, found:!!found, sourceKey:found ? found.key : '', raw:found ? found.value : null, rows:found ? normalizeRows(found.value) : [], status:found ? clean(found.value.state || found.value.status || '') : '', blocked:!!(found && /blocked|fail|failed/i.test(clean(found.value.state || found.value.status || ''))), complete:truthy(localStorage.getItem('nexus_' + eq + '_step_torque')), updatedAt:nowISO() };
  }

  function megSnapshot(eq){
    var adapters = window.NEXUS_VANGUARD_AUTHORITY_ADAPTERS || window.VanguardAuthorityAdapters;
    try {
      if (adapters && typeof adapters.getMegSnapshot === 'function') return adapters.getMegSnapshot(eq);
    } catch(e) {}
    var line = truthy(localStorage.getItem('nexus_' + eq + '_step_megohmmeter_line'));
    var load = truthy(localStorage.getItem('nexus_' + eq + '_step_megohmmeter_load'));
    var keys = ['nexus_' + eq + '_meg_vanguard_validation_v1','nexus_' + eq + '_meg_validation','nexus_' + eq + '_meg_log','nexus_' + eq + '_meg_rows','nexus_meg_' + eq,'meg_' + eq];
    var found = null;
    for (var i=0;i<keys.length;i+=1) {
      var obj = readJSON(keys[i], null);
      if (obj) { found = { key:keys[i], value:obj }; break; }
    }
    return { eq:eq, found:!!found, sourceKey:found ? found.key : '', raw:found ? found.value : null, rows:found ? normalizeRows(found.value) : [], status:found ? clean(found.value.state || found.value.status || '') : '', lineComplete:line, loadComplete:load, complete:truthy(localStorage.getItem('nexus_' + eq + '_step_meg')) || (line && load), updatedAt:nowISO() };
  }

  function fpvSnapshot(eq){
    var keys = [
      'nexus_' + eq + '_fpv_photo',
      'nexus_' + eq + '_fpv_photos',
      'nexus_' + eq + '_fpv_vanguard_validation_v1',
      'nexus_' + eq + '_fpv_validation'
    ];
    var found = null;
    for (var i=0;i<keys.length;i+=1) {
      var raw = localStorage.getItem(keys[i]);
      if (raw) { found = { key:keys[i], value:readJSON(keys[i], raw) }; break; }
    }
    return { eq:eq, found:!!found, sourceKey:found ? found.key : '', raw:found ? found.value : null, photoPresent:!!found, complete:truthy(localStorage.getItem('nexus_' + eq + '_step_fpv')), updatedAt:nowISO() };
  }

  function conflictsSnapshot(){
    var conflictEngine = window.NEXUS_VANGUARD_CONFLICTS || window.VanguardConflicts;
    try {
      if (conflictEngine && typeof conflictEngine.load === 'function') {
        var loaded = conflictEngine.load() || {};
        var list = safeArray(loaded.conflicts || loaded);
        return summarizeConflicts(list, 'conflict-engine');
      }
    } catch(e) {}
    var raw = readJSON('nexus_vanguard_conflicts_v1', { conflicts:[] });
    return summarizeConflicts(Array.isArray(raw) ? raw : safeArray(raw.conflicts), 'localStorage');
  }

  function summarizeConflicts(list, source){
    var unresolved = safeArray(list).filter(function(c){
      var s = upper(c && (c.status || c.state || 'REVIEW'));
      return !(s === 'PASS' || s === 'RESOLVED' || s === 'APPROVED' || s === 'CLOSED' || s === 'OVERRIDDEN');
    });
    return { source:source, conflicts:safeArray(list), unresolved:unresolved, unresolvedCount:unresolved.length, status:unresolved.length ? 'REVIEW' : 'PASS', updatedAt:nowISO() };
  }

  function authoritySnapshot(eq){
    var adapters = window.NEXUS_VANGUARD_AUTHORITY_ADAPTERS || window.VanguardAuthorityAdapters;
    try {
      if (adapters && typeof adapters.runAuthority === 'function') {
        var result = adapters.runAuthority(eq, { silent:true });
        if (result && result.status) return result;
      }
    } catch(e) {
      return { status:'REVIEW', canPass:false, message:'Authority run failed: ' + clean(e && e.message || e), error:clean(e && e.message || e), eq:eq, createdAt:nowISO() };
    }
    return readJSON('nexus_' + eq + '_authority_snapshot_v1', null) || readJSON('nexus_vanguard_authority_' + eq, null) || { status:'REVIEW', canPass:false, message:'Validation Authority Engine is not loaded.', eq:eq, createdAt:nowISO() };
  }

  function severityRank(severity){
    var s = upper(severity);
    if (s === 'BLOCKER' || s === 'STOP' || s === 'BLOCKED') return 3;
    if (s === 'REVIEW' || s === 'CHECK') return 2;
    return 1;
  }

  function makeAlert(eq, source, code, severity, message, detail){
    return {
      id:'ALERT-' + eq + '-' + code + '-' + Math.random().toString(36).slice(2,8).toUpperCase(),
      eq:eq,
      source:source,
      code:code,
      severity:severity,
      message:message,
      detail:detail || {},
      status:'OPEN',
      createdAt:nowISO()
    };
  }

  function buildAlerts(eq, snapshot){
    var alerts = [];
    var workflow = snapshot.workflow || {};
    safeArray(workflow.steps).forEach(function(step){
      if (!step.complete) alerts.push(makeAlert(eq, 'workflow', 'WORKFLOW_STEP_INCOMPLETE_' + upper(step.id || step.step || 'STEP'), 'BLOCKER', clean(step.label || step.id || 'Workflow step') + ' is not complete.', step));
      if (step.complete && !clean(step.sourceKey || step.updatedAt || step.completedAt)) alerts.push(makeAlert(eq, 'workflow', 'WORKFLOW_SOURCE_WEAK_' + upper(step.id || step.step || 'STEP'), 'REVIEW', clean(step.label || step.id || 'Workflow step') + ' is complete but source traceability is weak.', step));
    });

    if (!snapshot.ccs || snapshot.ccs.source === 'none') alerts.push(makeAlert(eq, 'ccs', 'MISSING_CCS_PAYLOAD', 'REVIEW', 'CCS Vanguard export payload is missing.', snapshot.ccs));
    if (snapshot.ccs && snapshot.ccs.status && /blocked|fail/i.test(snapshot.ccs.status)) alerts.push(makeAlert(eq, 'ccs', 'CCS_BLOCKED_OR_FAILED', 'BLOCKER', 'CCS reports a blocked or failed status.', snapshot.ccs));
    if (snapshot.ccs && snapshot.ccs.rows && snapshot.ccs.rows.length) {
      snapshot.ccs.rows.forEach(function(row, index){
        var status = upper(row && (row.status || row.result || row.passFail || ''));
        var title = clean(row && (row.title || row.description || row.stepDescription || row.step || ('CCS row ' + (index + 1))));
        var hasRef = !!clean(row && (row.source || row.sourceName || row.sourceDocument || row.reference || row.documentReference));
        var needsRef = /DOCUMENT|REFERENCE|SOURCE|DRAWING|SPEC|SUBMITTAL|REQUIREMENT/.test(upper([row && row.validationRule, row && row.rule, row && row.evidenceRequired, row && row.source, title].join(' ')));
        if (status === 'FAIL') alerts.push(makeAlert(eq, 'ccs', 'CCS_FAIL_ROW_' + (index + 1), 'BLOCKER', title + ' is marked FAIL.', row));
        if (status === 'REVIEW') alerts.push(makeAlert(eq, 'ccs', 'CCS_REVIEW_ROW_' + (index + 1), 'REVIEW', title + ' requires review.', row));
        if ((status === 'PASS' || needsRef) && !hasRef) alerts.push(makeAlert(eq, 'ccs', 'CCS_MISSING_REFERENCE_ROW_' + (index + 1), 'REVIEW', title + ' is missing source/reference traceability.', row));
      });
    }

    if (!snapshot.torque || !snapshot.torque.complete) alerts.push(makeAlert(eq, 'torque', 'TORQUE_NOT_COMPLETE', 'BLOCKER', 'Torque workflow is not complete.', snapshot.torque));
    if (snapshot.torque && snapshot.torque.blocked) alerts.push(makeAlert(eq, 'torque', 'TORQUE_BLOCKED_STATUS', 'BLOCKER', 'Torque validation reports blocked/failed status.', snapshot.torque));
    if (snapshot.torque && snapshot.torque.complete && !snapshot.torque.found) alerts.push(makeAlert(eq, 'torque', 'TORQUE_VALIDATION_PAYLOAD_MISSING', 'REVIEW', 'Torque is complete but no dedicated validation payload was found.', snapshot.torque));

    if (!snapshot.meg || !snapshot.meg.complete) alerts.push(makeAlert(eq, 'meg', 'MEG_NOT_COMPLETE', 'BLOCKER', 'Megohmmeter workflow is not complete.', snapshot.meg));
    if (snapshot.meg && snapshot.meg.complete && (!snapshot.meg.lineComplete || !snapshot.meg.loadComplete)) alerts.push(makeAlert(eq, 'meg', 'MEG_LINE_LOAD_TRACEABILITY_REVIEW', 'REVIEW', 'Meg is complete but line/load traceability is incomplete.', snapshot.meg));
    if (snapshot.meg && snapshot.meg.complete && !snapshot.meg.found) alerts.push(makeAlert(eq, 'meg', 'MEG_VALIDATION_PAYLOAD_MISSING', 'REVIEW', 'Meg is complete but no dedicated validation payload was found.', snapshot.meg));

    if (!snapshot.fpv || !snapshot.fpv.complete) alerts.push(makeAlert(eq, 'fpv', 'FPV_NOT_COMPLETE', 'BLOCKER', 'Finished Product Verification is not complete.', snapshot.fpv));
    if (snapshot.fpv && snapshot.fpv.complete && !snapshot.fpv.photoPresent) alerts.push(makeAlert(eq, 'fpv', 'FPV_PHOTO_MISSING', 'REVIEW', 'FPV is complete but photo evidence was not found.', snapshot.fpv));

    if (snapshot.conflicts && snapshot.conflicts.unresolvedCount) alerts.push(makeAlert(eq, 'documents', 'UNRESOLVED_DOCUMENT_CONFLICTS', 'REVIEW', snapshot.conflicts.unresolvedCount + ' unresolved document conflict(s) require engineering review.', snapshot.conflicts.unresolved));

    safeArray(snapshot.authority && snapshot.authority.issues).forEach(function(issue, index){
      alerts.push(makeAlert(eq, 'authority', clean(issue.code || ('AUTHORITY_ISSUE_' + (index + 1))), upper(issue.severity || 'REVIEW'), clean(issue.message || 'Authority issue requires review.'), issue));
    });

    alerts.sort(function(a,b){ return severityRank(b.severity) - severityRank(a.severity) || a.createdAt.localeCompare(b.createdAt); });
    return alerts;
  }

  function summarize(snapshot, alerts){
    var blockers = alerts.filter(function(a){ return severityRank(a.severity) >= 3; });
    var reviews = alerts.filter(function(a){ return severityRank(a.severity) === 2; });
    var authorityStatus = upper(snapshot.authority && snapshot.authority.status || 'REVIEW');
    var status = blockers.length ? 'BLOCKED' : (reviews.length || authorityStatus === 'REVIEW' ? 'REVIEW' : 'PASS');
    return {
      status:status,
      canFieldContinue:status !== 'BLOCKED',
      readyForEnergization:status === 'PASS',
      blockerCount:blockers.length,
      reviewCount:reviews.length,
      alertCount:alerts.length,
      workflowPercent:Number(snapshot.workflow && snapshot.workflow.percent || 0),
      message:status === 'BLOCKED' ? 'Required field workflow has blockers.' : status === 'REVIEW' ? 'Field workflow can continue, but engineering review items remain.' : 'Package readiness is clear.'
    };
  }

  function updateAlertIndex(eq, alerts){
    var index = readJSON(INDEX_KEY, {});
    index[eq] = { eq:eq, openCount:alerts.length, blockerCount:alerts.filter(function(a){ return severityRank(a.severity) >= 3; }).length, reviewCount:alerts.filter(function(a){ return severityRank(a.severity) === 2; }).length, updatedAt:nowISO() };
    writeJSON(INDEX_KEY, index);
    return index[eq];
  }

  function buildSnapshot(eq, options){
    options = options || {};
    eq = getEq(eq);
    var snapshot = {
      version:VERSION,
      eq:eq,
      generatedAt:nowISO(),
      source:'vanguard_package_readiness_engine',
      workflow:workflowSnapshot(eq),
      ccs:ccsSnapshot(eq),
      torque:torqueSnapshot(eq),
      meg:megSnapshot(eq),
      fpv:fpvSnapshot(eq),
      conflicts:conflictsSnapshot(),
      authority:authoritySnapshot(eq),
      firebaseReady:true,
      firebasePathPreview:'projects/{projectId}/equipment/' + encodeURIComponent(eq) + '/packageReadiness'
    };
    snapshot.alerts = buildAlerts(eq, snapshot);
    snapshot.summary = summarize(snapshot, snapshot.alerts);

    if (options.persist !== false) {
      writeJSON('nexus_' + eq + SNAPSHOT_SUFFIX, snapshot);
      writeJSON('nexus_' + eq + ALERT_SUFFIX, snapshot.alerts);
      writeJSON('nexus_' + eq + '_package_readiness', snapshot.summary);
      updateAlertIndex(eq, snapshot.alerts);
    }

    return snapshot;
  }

  function run(eq, options){
    var snapshot = buildSnapshot(eq, options || {});
    try { window.dispatchEvent(new CustomEvent('vanguard:package-readiness:updated', { detail:snapshot })); } catch(e) {}
    return snapshot;
  }

  function installAutoRun(){
    if (installAutoRun.__installed) return;
    installAutoRun.__installed = true;
    var timer = null;
    function schedule(){
      clearTimeout(timer);
      timer = setTimeout(function(){ try { run(getEq(), { persist:true }); } catch(e) {} }, 350);
    }
    window.addEventListener('storage', schedule);
    window.addEventListener('nexus-workflow-change', schedule);
    window.addEventListener('vanguard:update', schedule);
    window.addEventListener('vanguard:authority-adapter:updated', schedule);
    window.addEventListener('vanguard:document-intelligence:updated', schedule);
    window.addEventListener('vanguard:validation-authority-ready', schedule);
    setTimeout(schedule, 900);
  }

  var api = {
    __installed:true,
    version:VERSION,
    getEq:getEq,
    buildSnapshot:buildSnapshot,
    run:run,
    workflowSnapshot:workflowSnapshot,
    ccsSnapshot:ccsSnapshot,
    torqueSnapshot:torqueSnapshot,
    megSnapshot:megSnapshot,
    fpvSnapshot:fpvSnapshot,
    conflictsSnapshot:conflictsSnapshot,
    authoritySnapshot:authoritySnapshot,
    buildAlerts:buildAlerts
  };

  window.NEXUS_VANGUARD_PACKAGE_READINESS = api;
  window.VanguardPackageReadiness = api;
  window.NEXUS = window.NEXUS || {};
  window.NEXUS.VanguardPackageReadiness = api;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installAutoRun);
  else installAutoRun();

  try { window.dispatchEvent(new CustomEvent('vanguard:package-readiness-ready', { detail:{ version:VERSION } })); } catch(e) {}
})();