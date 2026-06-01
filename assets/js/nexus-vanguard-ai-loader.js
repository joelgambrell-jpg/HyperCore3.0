/*
  assets/js/nexus-vanguard-ai-loader.js
  Page-aware canonical loader for NEXUS Vanguard AI / offline / requirement / readiness stack.

  Important:
  - Core/offline/AI foundation loads broadly.
  - Module-specific UI integrations load only on their matching pages.
  - This prevents false readiness panels and browser freezing from loading every module everywhere.
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;

  var VERSION = '1.1.0-page-aware';
  var loaded = window.__NEXUS_VANGUARD_AI_LOADED = window.__NEXUS_VANGUARD_AI_LOADED || {};
  var base = 'assets/js/';
  var path = String(location.pathname || '').toLowerCase();

  function includesAny(list){
    return list.some(function(item){ return path.indexOf(item) !== -1; });
  }

  var isCCS = includesAny(['construction_check_sheet', 'ccs_']);
  var isTorque = includesAny(['torque_log', 'torque.html']);
  var isMeg = includesAny(['meg_log', 'equipment_meg', 'meg/']);
  var isDashboard = includesAny(['vanguard', 'index_equipment_registry', 'package_readiness']);
  var isDocument = includesAny(['supporting', 'document', 'index.html', 'vanguard_control_center']);
  var isEquipment = includesAny(['equipment.html', 'index_equipment_registry']);

  var files = [
    'nexus-offline-store.js',
    'nexus-sync-queue.js',
    'nexus-dependency-guard.js',
    'nexus-ai-config.js',
    'nexus-ai-client.js',
    'nexus-vanguard-ai-bridge.js',
    'nexus-vanguard-requirement-library.js',
    'nexus-vanguard-conflict-engine.js',
    'nexus-vanguard-readiness-engine.js',
    'nexus-vanguard-workflow-verifier.js'
  ];

  if (isDashboard) files.push('nexus-vanguard-dashboard-requirement-bridge.js');
  if (isEquipment) files.push('nexus-vanguard-equipment-readiness.js');
  if (isDocument || isDashboard) files.push('nexus-vanguard-auto-document-intake.js');
  if (isCCS) files.push('nexus-ccs-ai-integration.js');
  if (isTorque) files.push('nexus-torque-vanguard-integration.js');
  if (isMeg) files.push('nexus-meg-vanguard-integration.js');

  function unique(list){
    var seen = {};
    return list.filter(function(item){
      if (!item || seen[item]) return false;
      seen[item] = true;
      return true;
    });
  }

  function loadScript(src){
    return new Promise(function(resolve){
      if (loaded[src] || document.querySelector('script[src="' + src + '"]')) { loaded[src] = true; resolve(true); return; }
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = function(){ loaded[src] = true; resolve(true); };
      s.onerror = function(){ console.warn('NEXUS Vanguard loader could not load', src); resolve(false); };
      (document.head || document.documentElement).appendChild(s);
    });
  }

  async function boot(){
    var list = unique(files);
    for (var i=0;i<list.length;i++) await loadScript(base + list[i]);
    window.NEXUS_VANGUARD_AI_LOADER = {
      version:VERSION,
      page:path,
      context:{ isCCS:isCCS, isTorque:isTorque, isMeg:isMeg, isDashboard:isDashboard, isDocument:isDocument, isEquipment:isEquipment },
      files:list.slice(),
      loaded:loaded
    };
    window.dispatchEvent(new CustomEvent('nexus:vanguard-ai-stack-ready', { detail:{ version:VERSION, page:path, files:list.slice() } }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
