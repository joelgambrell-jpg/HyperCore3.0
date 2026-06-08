/*
  assets/js/vanguard_regression_harness.js
  HyperCore / NEXUS Vanguard Validation Regression Harness

  Purpose:
  - Front-end-only validation test harness for pre-Firebase releases.
  - Runs isolated equipment scenarios against Authority, Package Readiness,
    Engineer Alerts, Hard Gates, and Persistence Bridge without touching real equipment.
  - Restores all localStorage keys it changes after every test run.

  Use from browser console:
    VanguardRegressionHarness.runAll()
    VanguardRegressionHarness.run('missingTorque')
    VanguardRegressionHarness.latest()
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_REGRESSION_HARNESS && window.NEXUS_VANGUARD_REGRESSION_HARNESS.__installed) return;

  var VERSION = '1.0.0-validation-regression';
  var RESULT_KEY = 'nexus_vanguard_regression_results_v1';
  var PREFIX = 'REGRESSION_EQ_';

  function clean(v){ return String(v == null ? '' : v).trim(); }
  function upper(v){ return clean(v).toUpperCase(); }
  function nowISO(){ return new Date().toISOString(); }
  function safeArray(v){ return Array.isArray(v) ? v : []; }
  function clone(v){ try { return JSON.parse(JSON.stringify(v)); } catch(e) { return v; } }

  function readRaw(key){ try { return localStorage.getItem(key); } catch(e) { return null; } }
  function writeRaw(key, value){ try { localStorage.setItem(key, value); } catch(e) {} }
  function removeRaw(key){ try { localStorage.removeItem(key); } catch(e) {} }
  function readJSON(key, fallback){ try { var raw = readRaw(key); return raw ? JSON.parse(raw) : fallback; } catch(e) { return fallback; } }
  function writeJSON(key, value){ writeRaw(key, JSON.stringify(value)); return value; }

  function localKeys(){
    var keys = [];
    try { for (var i=0;i<localStorage.length;i+=1) keys.push(localStorage.key(i)); } catch(e) {}
    return keys.filter(Boolean).sort();
  }

  function capture(keys){
    var out = {};
    keys.forEach(function(key){ out[key] = { existed:readRaw(key) != null, value:readRaw(key) }; });
    return out;
  }

  function restore(snapshot){
    Object.keys(snapshot || {}).forEach(function(key){
      if (snapshot[key].existed) writeRaw(key, snapshot[key].value);
      else removeRaw(key);
    });
  }

  function cleanupRegressionKeys(){
    localKeys().forEach(function(key){
      if (key.indexOf(PREFIX) !== -1 || key.indexOf('nexus_' + PREFIX) === 0) removeRaw(key);
    });
  }

  function eqFor(name){ return PREFIX + String(name || 'CASE').toUpperCase().replace(/[^A-Z0-9]+/g,'_'); }

  function stepKey(eq, step){ return 'nexus_' + eq + '_step_' + step; }

  function setComplete(eq, step, complete){ writeRaw(stepKey(eq, step), complete === false ? 'false' : 'true'); }

  function baseCcsPayload(eq){
    return {
      eq:eq,
      status:'PASS',
      complete:true,
      finalSignoff:{ foreman:'Regression Foreman', date:nowISO(), status:'SIGNED' },
      steps:[
        { id:'1', stepId:'1', title:'Verify nameplate against approved submittal', status:'PASS', source:'Approved Submittal', sourceDocument:'SUB-001', page:'4', notes:'Regression fixture.' },
        { id:'2', stepId:'2', title:'Verify torque requirement reference', status:'PASS', source:'Torque Spec', sourceDocument:'SPEC-260500', page:'18', notes:'Regression fixture.' },
        { id:'3', stepId:'3', title:'Verify pre-FOD inspection complete', status:'PASS', source:'Project Checklist', sourceDocument:'QCP-001', page:'11', notes:'Regression fixture.' }
      ],
      validationSummary:{ status:'PASS', generatedBy:'VanguardRegressionHarness', generatedAt:nowISO() }
    };
  }

  function baseTorquePayload(eq){
    return {
      eq:eq,
      status:'PASS',
      state:'PASS',
      foremanVerified:true,
      rows:[
        { id:'T1', connection:'A Phase Lug', torque:'110', unit:'ft-lb', status:'PASS', source:'Torque Spec', page:'18' },
        { id:'T2', connection:'B Phase Lug', torque:'110', unit:'ft-lb', status:'PASS', source:'Torque Spec', page:'18' }
      ],
      updatedAt:nowISO()
    };
  }

  function baseMegPayload(eq){
    return {
      eq:eq,
      status:'PASS',
      state:'PASS',
      rows:[
        { id:'M1', conductor:'A-G', resistance:'11', unit:'MΩ', status:'PASS', source:'AWS Meg Requirement', page:'7' },
        { id:'M2', conductor:'B-G', resistance:'11', unit:'MΩ', status:'PASS', source:'AWS Meg Requirement', page:'7' }
      ],
      updatedAt:nowISO()
    };
  }

  function baseFpvPayload(eq){
    return { eq:eq, status:'PASS', photoPresent:true, photos:[{ id:'P1', name:'fpv-regression.jpg', capturedAt:nowISO() }], updatedAt:nowISO() };
  }

  function baseRequirements(){
    return {
      torque:{ id:'REQ-TORQUE', type:'TORQUE', approved:true, enforce:true, value:110, unit:'ft-lb', comparator:'=', sourceDocument:'SPEC-260500', page:'18', text:'Torque value 110 ft-lb.' },
      meg:{ id:'REQ-MEG', type:'MEG', approved:true, enforce:true, value:11, unit:'MΩ', comparator:'>=', sourceDocument:'AWS-MEG', page:'7', text:'Minimum insulation resistance 11 MΩ.' }
    };
  }

  function writeGoodFixture(eq){
    ['rif','phenolic','torque','l2','meg','prefod','fpv','ccs'].forEach(function(step){ setComplete(eq, step, true); });
    writeRaw('nexus_' + eq + '_step_megohmmeter_line', 'true');
    writeRaw('nexus_' + eq + '_step_megohmmeter_load', 'true');
    writeJSON('nexus_' + eq + '_ccs_vanguard_export', baseCcsPayload(eq));
    writeJSON('nexus_' + eq + '_torque_vanguard_validation_v1', baseTorquePayload(eq));
    writeJSON('nexus_' + eq + '_meg_vanguard_validation_v1', baseMegPayload(eq));
    writeJSON('nexus_' + eq + '_fpv_vanguard_validation_v1', baseFpvPayload(eq));
    writeRaw('nexus_' + eq + '_fpv_photo', 'data:image/jpeg;base64,REGRESSION');
    writeJSON('nexus_vanguard_requirements', baseRequirements());
    writeJSON('nexus_vanguard_conflicts_v1', { conflicts:[] });
  }

  function keysForEq(eq){
    return localKeys().filter(function(key){ return key.indexOf(eq) !== -1 || key === 'nexus_vanguard_requirements' || key === 'nexus_vanguard_conflicts_v1' || key === 'nexus_active_equipment' || key === 'nexus_active_eq'; });
  }

  function buildScenario(name, mutate, expect){
    return { name:name, eq:eqFor(name), mutate:mutate || function(){}, expect:expect || {} };
  }

  var SCENARIOS = [
    buildScenario('completePackage', function(){}, { status:'PASS', blockerCount:0 }),
    buildScenario('missingCCS', function(eq){ removeRaw('nexus_' + eq + '_ccs_vanguard_export'); setComplete(eq, 'ccs', false); }, { status:'BLOCKED', code:'MISSING_CCS_PAYLOAD' }),
    buildScenario('missingTorque', function(eq){ removeRaw('nexus_' + eq + '_torque_vanguard_validation_v1'); setComplete(eq, 'torque', false); }, { status:'BLOCKED', code:'TORQUE_NOT_COMPLETE' }),
    buildScenario('missingMeg', function(eq){ removeRaw('nexus_' + eq + '_meg_vanguard_validation_v1'); setComplete(eq, 'meg', false); removeRaw('nexus_' + eq + '_step_megohmmeter_line'); removeRaw('nexus_' + eq + '_step_megohmmeter_load'); }, { status:'BLOCKED', code:'MEG_NOT_COMPLETE' }),
    buildScenario('missingFPV', function(eq){ removeRaw('nexus_' + eq + '_fpv_vanguard_validation_v1'); removeRaw('nexus_' + eq + '_fpv_photo'); setComplete(eq, 'fpv', false); }, { status:'BLOCKED', code:'FPV_NOT_COMPLETE' }),
    buildScenario('missingReferences', function(eq){ var ccs = baseCcsPayload(eq); ccs.steps[0].source = ''; ccs.steps[0].sourceDocument = ''; ccs.steps[0].page = ''; writeJSON('nexus_' + eq + '_ccs_vanguard_export', ccs); }, { status:'REVIEW', code:'CCS_MISSING_REFERENCE_ROW_1' }),
    buildScenario('failWithNotes', function(eq){ var ccs = baseCcsPayload(eq); ccs.status = 'REVIEW'; ccs.steps[1].status = 'FAIL'; ccs.steps[1].notes = 'Documented issue routed to foreman.'; ccs.steps[1].reason = 'Fixture issue.'; writeJSON('nexus_' + eq + '_ccs_vanguard_export', ccs); }, { status:'BLOCKED', code:'CCS_FAIL_ROW_2' }),
    buildScenario('failWithoutNotes', function(eq){ var ccs = baseCcsPayload(eq); ccs.status = 'REVIEW'; ccs.steps[1].status = 'FAIL'; ccs.steps[1].notes = ''; ccs.steps[1].reason = ''; writeJSON('nexus_' + eq + '_ccs_vanguard_export', ccs); }, { status:'BLOCKED', code:'CCS_FAIL_ROW_2' }),
    buildScenario('naWithReason', function(eq){ var ccs = baseCcsPayload(eq); ccs.status = 'REVIEW'; ccs.steps[2].status = 'N/A'; ccs.steps[2].reason = 'Not included in this equipment lineup.'; ccs.steps[2].source = 'Approved Scope Matrix'; ccs.steps[2].sourceDocument = 'SCOPE-001'; ccs.steps[2].page = '2'; writeJSON('nexus_' + eq + '_ccs_vanguard_export', ccs); }, { status:'REVIEW' }),
    buildScenario('naWithoutReason', function(eq){ var ccs = baseCcsPayload(eq); ccs.status = 'REVIEW'; ccs.steps[2].status = 'N/A'; ccs.steps[2].reason = ''; ccs.steps[2].notes = ''; ccs.steps[2].source = ''; ccs.steps[2].sourceDocument = ''; ccs.steps[2].page = ''; writeJSON('nexus_' + eq + '_ccs_vanguard_export', ccs); }, { status:'REVIEW', code:'CCS_MISSING_REFERENCE_ROW_3' }),
    buildScenario('engineerOverride', function(eq){ var conflicts = { conflicts:[{ id:'C1', status:'OVERRIDDEN', state:'OVERRIDDEN', message:'Regression conflict overridden by engineer.' }] }; writeJSON('nexus_vanguard_conflicts_v1', conflicts); }, { status:'PASS', blockerCount:0 }),
    buildScenario('unresolvedConflict', function(){ writeJSON('nexus_vanguard_conflicts_v1', { conflicts:[{ id:'C1', status:'REVIEW', state:'OPEN', message:'Spec/submittal conflict requires engineer review.' }] }); }, { status:'REVIEW', code:'UNRESOLVED_DOCUMENT_CONFLICTS' }),
    buildScenario('persistenceQueueDryRun', function(eq){ var bridge = window.NEXUS_VANGUARD_PERSISTENCE_BRIDGE || window.VanguardPersistenceBridge; if (bridge) { bridge.enable({ dryRun:true, projectId:'REGRESSION', siteId:'TEST' }); } writeJSON('nexus_' + eq + '_package_readiness_canonical_v1', { eq:eq, status:'PASS', regression:true }); }, { persistence:true })
  ];

  function getEngines(){
    return {
      authority:window.NEXUS_VANGUARD_VALIDATION_AUTHORITY || window.VanguardValidationAuthority || null,
      packageReadiness:window.NEXUS_VANGUARD_PACKAGE_READINESS || window.VanguardPackageReadiness || null,
      hardGates:window.NEXUS_VANGUARD_HARD_GATES || window.VanguardHardGates || null,
      persistence:window.NEXUS_VANGUARD_PERSISTENCE_BRIDGE || window.VanguardPersistenceBridge || null,
      adapters:window.NEXUS_VANGUARD_AUTHORITY_ADAPTERS || window.VanguardAuthorityAdapters || null
    };
  }

  function evaluateScenario(scenario, snapshot, authorityResult, persistenceResult){
    var expect = scenario.expect || {};
    var alerts = safeArray(snapshot && snapshot.alerts);
    var summary = snapshot && snapshot.summary || {};
    var failures = [];

    if (expect.status && upper(summary.status) !== upper(expect.status)) failures.push('Expected summary.status ' + expect.status + ', got ' + summary.status + '.');
    if (expect.blockerCount != null && Number(summary.blockerCount || 0) !== Number(expect.blockerCount)) failures.push('Expected blockerCount ' + expect.blockerCount + ', got ' + summary.blockerCount + '.');
    if (expect.code && !alerts.some(function(a){ return upper(a.code) === upper(expect.code); })) failures.push('Expected alert code ' + expect.code + ' was not found.');
    if (expect.persistence && !persistenceResult) failures.push('Expected persistence result was not produced.');
    if (!snapshot || !snapshot.version) failures.push('Package readiness snapshot was not produced.');
    if (!authorityResult || !authorityResult.status) failures.push('Authority result was not produced.');

    return {
      pass:failures.length === 0,
      failures:failures,
      observed:{
        status:summary.status || '',
        blockerCount:Number(summary.blockerCount || 0),
        reviewCount:Number(summary.reviewCount || 0),
        alertCodes:alerts.map(function(a){ return a.code; }).slice(0,25),
        authorityStatus:authorityResult && authorityResult.status || '',
        persistenceQueued:!!(persistenceResult && persistenceResult.queuedForSync)
      }
    };
  }

  function runScenario(nameOrScenario, options){
    options = options || {};
    var scenario = typeof nameOrScenario === 'string' ? SCENARIOS.filter(function(s){ return s.name === nameOrScenario; })[0] : nameOrScenario;
    if (!scenario) return { pass:false, error:'Unknown regression scenario: ' + clean(nameOrScenario), name:clean(nameOrScenario) };

    var eq = scenario.eq;
    var importantKeys = localKeys().filter(function(key){ return key.indexOf(PREFIX) !== -1 || key === 'nexus_vanguard_requirements' || key === 'nexus_vanguard_conflicts_v1' || key === 'nexus_active_equipment' || key === 'nexus_active_eq' || key.indexOf('nexus_vanguard_persistence') === 0; });
    var before = capture(importantKeys);
    var startedAt = nowISO();
    var result;

    try {
      cleanupRegressionKeys();
      writeRaw('nexus_active_equipment', eq);
      writeRaw('nexus_active_eq', eq);
      writeGoodFixture(eq);
      scenario.mutate(eq);

      var engines = getEngines();
      var authorityResult = null;
      var snapshot = null;
      var persistenceResult = null;

      if (engines.adapters && typeof engines.adapters.runAuthority === 'function') authorityResult = engines.adapters.runAuthority(eq, { silent:true });
      else if (engines.authority && typeof engines.authority.validatePackage === 'function') authorityResult = engines.authority.validatePackage(eq, { mode:'FIELD' });

      if (engines.packageReadiness && typeof engines.packageReadiness.run === 'function') snapshot = engines.packageReadiness.run(eq, { persist:true });
      else snapshot = readJSON('nexus_' + eq + '_package_readiness_canonical_v1', null);

      if (scenario.expect && scenario.expect.persistence && engines.persistence && typeof engines.persistence.mirrorEquipment === 'function') {
        persistenceResult = { requested:true };
        try {
          engines.persistence.mirrorEquipment(eq, { onlyCanonical:true, metadata:{ regression:true } }).then(function(){})['catch'](function(){});
        } catch(e) {
          persistenceResult = { requested:true, error:clean(e && e.message || e) };
        }
      }

      var evaluation = evaluateScenario(scenario, snapshot, authorityResult, persistenceResult);
      result = {
        name:scenario.name,
        eq:eq,
        pass:evaluation.pass,
        failures:evaluation.failures,
        observed:evaluation.observed,
        snapshotSummary:snapshot && snapshot.summary || null,
        authorityStatus:authorityResult && authorityResult.status || '',
        startedAt:startedAt,
        finishedAt:nowISO()
      };
    } catch(err) {
      result = { name:scenario.name, eq:eq, pass:false, error:clean(err && err.message || err), startedAt:startedAt, finishedAt:nowISO() };
    } finally {
      if (options.keepFixtures !== true) {
        cleanupRegressionKeys();
        restore(before);
      }
    }

    return result;
  }

  function runAll(options){
    options = options || {};
    var engines = getEngines();
    var results = SCENARIOS.map(function(s){ return runScenario(s, options); });
    var report = {
      version:VERSION,
      generatedAt:nowISO(),
      pass:results.every(function(r){ return !!r.pass; }),
      total:results.length,
      passed:results.filter(function(r){ return !!r.pass; }).length,
      failed:results.filter(function(r){ return !r.pass; }).length,
      engines:{
        authority:!!engines.authority,
        packageReadiness:!!engines.packageReadiness,
        hardGates:!!engines.hardGates,
        persistence:!!engines.persistence,
        adapters:!!engines.adapters
      },
      results:results
    };
    writeJSON(RESULT_KEY, report);
    try { window.dispatchEvent(new CustomEvent('vanguard:regression:complete', { detail:report })); } catch(e) {}
    return report;
  }

  function latest(){ return readJSON(RESULT_KEY, null); }

  function list(){ return SCENARIOS.map(function(s){ return { name:s.name, eq:s.eq, expect:clone(s.expect) }; }); }

  function installConsoleBanner(){
    try {
      if (window.__NEXUS_VANGUARD_REGRESSION_BANNER_SHOWN) return;
      window.__NEXUS_VANGUARD_REGRESSION_BANNER_SHOWN = true;
      if (window.console && console.info) console.info('Vanguard regression harness ready:', VERSION, 'Run VanguardRegressionHarness.runAll()');
    } catch(e) {}
  }

  var api = {
    __installed:true,
    version:VERSION,
    scenarios:list,
    run:runScenario,
    runAll:runAll,
    latest:latest,
    cleanup:cleanupRegressionKeys,
    engines:getEngines
  };

  window.NEXUS_VANGUARD_REGRESSION_HARNESS = api;
  window.VanguardRegressionHarness = api;
  window.NEXUS = window.NEXUS || {};
  window.NEXUS.VanguardRegressionHarness = api;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installConsoleBanner);
  else installConsoleBanner();

  try { window.dispatchEvent(new CustomEvent('vanguard:regression-ready', { detail:{ version:VERSION, scenarios:list() } })); } catch(e) {}
})();