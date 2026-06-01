/*
  assets/js/nexus-vanguard-workflow-verifier.js
  Runtime end-to-end verifier for NEXUS Vanguard AI/offline/readiness wiring.
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;

  var VERSION = '1.0.0';
  var STORE_KEY = 'nexus_vanguard_workflow_verification_v1';

  function now(){ return new Date().toISOString(); }
  function ok(name, pass, detail){ return { name:name, pass:!!pass, detail:detail || '', checkedAt:now() }; }

  function has(path){
    try { return !!path.split('.').reduce(function(obj, part){ return obj && obj[part]; }, window); } catch(e){ return false; }
  }

  function verify(){
    var checks = [
      ok('Offline store loaded', has('NEXUS_OFFLINE.saveLocal')),
      ok('Sync queue loaded', has('NEXUS_SYNC_QUEUE.flush')),
      ok('Dependency guard loaded', has('NEXUS_DEPENDENCY_STATUS') || has('NEXUS_DEPENDENCY_STATUS.ok')),
      ok('Firebase bridge loaded', has('NEXUS_FIREBASE.save') || has('NEXUS_FIREBASE.set')),
      ok('AI config loaded', has('NEXUS_AI_CONFIG.load')),
      ok('AI client loaded', has('NEXUS_AI_CLIENT.extractDocumentData')),
      ok('Vanguard AI bridge loaded', has('VANGUARD_AI_BRIDGE.mapChecklist')),
      ok('Requirement library loaded', has('NEXUS_REQUIREMENTS.upsert')),
      ok('Conflict engine loaded', has('NEXUS_VANGUARD_CONFLICTS.detect')),
      ok('Dashboard requirement bridge loaded', has('NEXUS_VANGUARD_DASHBOARD_REQUIREMENTS.getDashboardData')),
      ok('Project readiness loaded', has('NEXUS_VANGUARD_READINESS.snapshot')),
      ok('Equipment readiness loaded', has('NEXUS_EQUIPMENT_READINESS.snapshot')),
      ok('CCS AI integration loaded or not applicable', location.pathname.indexOf('construction_check_sheet') === -1 || has('NEXUS_CCS_AI.analyzeCurrentChecklist')),
      ok('Torque integration loaded or not applicable', location.pathname.indexOf('torque') === -1 || has('NEXUS_TORQUE_VANGUARD.validateRows')),
      ok('Meg integration loaded or not applicable', location.pathname.indexOf('meg') === -1 || has('NEXUS_MEG_VANGUARD.validate'))
    ];
    var failed = checks.filter(function(c){ return !c.pass; });
    var result = {
      version:VERSION,
      page:location.pathname,
      generatedAt:now(),
      status:failed.length ? 'REVIEW' : 'READY',
      passed:checks.length - failed.length,
      failed:failed.length,
      checks:checks
    };
    try { localStorage.setItem(STORE_KEY, JSON.stringify(result)); } catch(e) {}
    try { window.dispatchEvent(new CustomEvent('nexus:vanguard-workflow-verified', { detail:result })); } catch(e) {}
    return result;
  }

  function render(result){
    result = result || verify();
    if (!document.body) return;
    if (result.failed === 0) return;
    var id = 'nexusVanguardWorkflowVerifier';
    var box = document.getElementById(id);
    if (!box) {
      box = document.createElement('div');
      box.id = id;
      box.style.cssText = 'position:fixed;left:12px;bottom:58px;z-index:99996;max-width:420px;padding:10px 12px;border-radius:14px;background:rgba(127,29,29,.92);color:#fee2e2;border:1px solid rgba(254,202,202,.7);font:12px Arial,sans-serif;box-shadow:0 10px 28px rgba(0,0,0,.35);';
      document.body.appendChild(box);
    }
    box.innerHTML = '<b>Vanguard Workflow Review</b><br>' + result.failed + ' integration check(s) need review. Open console and run <code>NEXUS_VANGUARD_VERIFY.verify()</code>.';
  }

  function delayed(){
    setTimeout(function(){ render(verify()); }, 1800);
    setTimeout(function(){ render(verify()); }, 4500);
  }

  window.NEXUS_VANGUARD_VERIFY = { version:VERSION, verify:verify, render:render };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', delayed); else delayed();
})();
