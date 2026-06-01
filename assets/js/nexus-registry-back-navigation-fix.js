/*
  assets/js/nexus-registry-back-navigation-fix.js
  Stops index_equipment_registry.html from freezing after navigating away and coming back.

  Browser back/forward cache can restore old JS state, timers, panels, and event listeners.
  This patch keeps the registry page light and prevents module validators from waking up on return.
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;

  var path = String(location.pathname || '').toLowerCase();
  if (path.indexOf('index_equipment_registry') === -1) return;

  window.__NEXUS_REGISTRY_PAGE = true;
  window.__NEXUS_REGISTRY_STABILIZED = true;
  window.__NEXUS_DISABLE_FLOATING_MODULE_PANELS = true;
  window.__NEXUS_DISABLE_MODULE_VALIDATION_ON_REGISTRY = true;
  window.__NEXUS_DISABLE_AUTO_DOC_INTAKE_ON_REGISTRY = true;
  window.__NEXUS_DISABLE_WORKFLOW_VERIFIER_ON_REGISTRY = true;

  function remove(id){
    var el = document.getElementById(id);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function cleanupPanels(){
    remove('nexusTorqueVanguardPanel');
    remove('nexusMegVanguardPanel');
    remove('nexusCcsAiPanel');
    remove('nexusVanguardWorkflowVerifier');
    remove('nexusVanguardAutoDocumentIntake');
    document.querySelectorAll('[id*="TorqueVanguard"],[id*="MegVanguard"],[id*="CcsAi"],[id*="WorkflowVerifier"]').forEach(function(el){
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
  }

  function neutralizeValidation(){
    window.NEXUS_TORQUE_VANGUARD = Object.assign({}, window.NEXUS_TORQUE_VANGUARD || {}, {
      validateRows:function(){ return Promise.resolve({ state:'registry-disabled', summary:'Open a specific torque page to validate torque.' }); }
    });
    window.NEXUS_MEG_VANGUARD = Object.assign({}, window.NEXUS_MEG_VANGUARD || {}, {
      validate:function(){ return Promise.resolve({ state:'registry-disabled', summary:'Open a specific meg page to validate meg readings.' }); }
    });
    window.NEXUS_CCS_AI = Object.assign({}, window.NEXUS_CCS_AI || {}, {
      analyzeCurrentChecklist:function(){ return Promise.resolve({ state:'registry-disabled', summary:'Open the CCS page to map checklist requirements.' }); }
    });
  }

  function clearBusyVisuals(){
    try { document.body.style.cursor = ''; } catch(e) {}
    try { document.body.style.pointerEvents = ''; } catch(e) {}
    try {
      document.querySelectorAll('button,input,select,textarea,a').forEach(function(el){
        if (el && el.dataset && el.dataset.nexusRegistryDisabled === 'true') el.disabled = false;
      });
    } catch(e) {}
  }

  function stabilize(){
    cleanupPanels();
    neutralizeValidation();
    clearBusyVisuals();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', stabilize, { once:true });
  else stabilize();

  window.addEventListener('pageshow', function(ev){
    window.__NEXUS_REGISTRY_RETURNED_FROM_CACHE = !!ev.persisted;
    stabilize();
    setTimeout(stabilize, 100);
    setTimeout(stabilize, 700);
  });

  window.addEventListener('focus', function(){ setTimeout(stabilize, 100); });
  window.addEventListener('nexus:vanguard-ai-stack-ready', stabilize);
})();
