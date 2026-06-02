/* assets/js/nexus-registry-safety-patch.js */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;

  var path = String(location.pathname || '').toLowerCase();
  var isRootRegistry = path.indexOf('/hypercore3.0/') !== -1 && (path.endsWith('/hypercore3.0/') || path.endsWith('/hypercore3.0/index.html'));
  var isRegistry = path.indexOf('index_equipment_registry') !== -1 || isRootRegistry || path.endsWith('/index.html');
  if (!isRegistry) return;

  window.__NEXUS_REGISTRY_PAGE = true;
  window.__NEXUS_DISABLE_FLOATING_MODULE_PANELS = true;
  window.__NEXUS_DISABLE_MODULE_VALIDATION_ON_REGISTRY = true;
  window.__NEXUS_DISABLE_REGISTRY_BACKGROUND_VALIDATION = true;

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

  function stabilize(){
    removeBadPanels();
    neutralizeModuleApis();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', stabilize, { once:true });
  else stabilize();
  window.addEventListener('nexus:vanguard-ai-stack-ready', stabilize, { passive:true });
})();
