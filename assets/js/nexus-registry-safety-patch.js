/*
  assets/js/nexus-registry-safety-patch.js
  Registry-page safety patch.

  Purpose:
  - Prevent module-specific Vanguard panels from appearing on index_equipment_registry.html.
  - Prevent torque/meg/CCS validation from running on the registry page.
  - Keep registry readiness limited to registry status, not task readiness.
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  var path = String(location.pathname || '').toLowerCase();
  if (path.indexOf('index_equipment_registry') === -1) return;

  window.__NEXUS_REGISTRY_PAGE = true;
  window.__NEXUS_DISABLE_FLOATING_MODULE_PANELS = true;
  window.__NEXUS_DISABLE_MODULE_VALIDATION_ON_REGISTRY = true;

  function removeBadPanels(){
    ['nexusTorqueVanguardPanel','nexusMegVanguardPanel','nexusCcsAiPanel','nexusVanguardWorkflowVerifier'].forEach(function(id){
      var el = document.getElementById(id);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
  }

  function neutralizeModuleApis(){
    window.NEXUS_TORQUE_VANGUARD = Object.assign({}, window.NEXUS_TORQUE_VANGUARD || {}, {
      validateRows:function(){
        return Promise.resolve({ state:'registry-disabled', summary:'Torque validation is disabled on the equipment registry. Open the torque page for a specific equipment item.' });
      }
    });
    window.NEXUS_MEG_VANGUARD = Object.assign({}, window.NEXUS_MEG_VANGUARD || {}, {
      validate:function(){
        return Promise.resolve({ state:'registry-disabled', summary:'Meg validation is disabled on the equipment registry. Open the meg page for a specific equipment item.' });
      }
    });
  }

  function fixRegistryReadinessLabels(){
    try{
      document.querySelectorAll('*').forEach(function(el){
        var txt = (el.textContent || '').trim();
        if (txt === 'TURNOVER_READY' || txt === 'READY' || txt === 'BLOCKED') {
          if (!/[?&]eq=/.test(location.search)) el.textContent = 'Missing Info';
        }
      });
    }catch(e){}
  }

  function stabilize(){
    removeBadPanels();
    neutralizeModuleApis();
    fixRegistryReadinessLabels();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', stabilize); else stabilize();
  setTimeout(stabilize, 500);
  setTimeout(stabilize, 1500);
  window.addEventListener('nexus:vanguard-ai-stack-ready', stabilize);
})();
