/*
  assets/js/vanguard_loader.js
  NEXUS Vanguard Loader
  Mode-aware additive loader. Keeps field/export/dashboard pages from loading
  unrelated Vanguard modules while preserving a full mode for Control Center.
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_LOADER && window.NEXUS_VANGUARD_LOADER.__installed) return;

  var VERSION = '0.4.8-authority-risk-mitigation';

  var REGISTRY_MODULES = [
    'assets/js/vanguard_core.js',
    'assets/js/vanguard_state.js',
    'assets/js/vanguard_registry.js',
    'assets/js/vanguard_ipad_ux_hardening.js'
  ];

  var AUTHORITY_MODULES = [
    'assets/js/vanguard_validation_authority.js',
    'assets/js/vanguard_authority_adapters.js',
    'assets/js/nexus-vanguard-hard-gates.js',
    'assets/js/vanguard_storage_audit.js'
  ];

  var EXPORT_CORE_MODULES = [
    'assets/js/vanguard_core.js',
    'assets/js/vanguard_state.js',
    'assets/js/vanguard_approved_rules_enforcement.js',
    'assets/js/vanguard_export_state.js',
    'assets/js/vanguard_registry.js',
    'assets/js/vanguard_validation_engine.js',
    'assets/js/vanguard_ipad_ux_hardening.js'
  ].concat(AUTHORITY_MODULES);

  var CORE_MODULES = [
    'assets/js/vanguard_core.js',
    'assets/js/vanguard_state.js',
    'assets/js/vanguard_rules.js',
    'assets/js/vanguard_evidence.js',
    'assets/js/vanguard_rules_validation.js',
    'assets/js/vanguard_approved_rules_enforcement.js',
    'assets/js/vanguard_export_state.js',
    'assets/js/vanguard_ai.js',
    'assets/js/vanguard_registry.js',
    'assets/js/vanguard_validation_engine.js',
    'assets/js/vanguard_backend_client.js',
    'assets/js/vanguard_project_state.js',
    'assets/js/vanguard_realtime_sync.js',
    'assets/js/vanguard_ipad_ux_hardening.js'
  ].concat(AUTHORITY_MODULES);

  var DOCUMENT_MODULES = [
    'assets/js/vanguard_document_intake.js',
    'assets/js/vanguard_requirement_extractor.js',
    'assets/js/vanguard_extraction_engine.js',
    'assets/js/vanguard_document_library.js',
    'assets/js/vanguard_mapping_review.js',
    'assets/js/vanguard_requirement_review_gate.js',
    'assets/js/vanguard_requirement_mapper.js',
    'assets/js/vanguard_conflict_engine.js',
    'assets/js/vanguard_conflict_intelligence.js',
    'assets/js/vanguard_global_corrections.js',
    'assets/js/vanguard_requirement_propagation.js',
    'assets/js/vanguard_project_alert_queue.js'
  ];

  var CCS_MODULES = [
    'assets/js/vanguard_ccs_bridge.js',
    'assets/js/ccs_vanguard_rule_engine.js',
    'assets/js/ccs_evidence_engine.js',
    'assets/js/ccs_supervisor_review_engine.js',
    'assets/js/ccs_package_export_bridge.js'
  ];

  var DASHBOARD_MODULES = [
    'assets/js/vanguard_live_dashboard.js'
  ];

  var EXPORT_MODULES = [
    'assets/js/ccs_package_export_bridge.js',
    'assets/js/vanguard_final_export_engine.js'
  ];

  var REGISTRY_AI_MODULES = [
    'assets/js/vanguard_requirement_extractor.js',
    'assets/js/vanguard_extraction_engine.js',
    'assets/js/vanguard_backend_client.js',
    'assets/js/vanguard_document_mapper.js'
  ];

  var MODE_MAP = {
    registry: REGISTRY_MODULES,
    registry_ai: REGISTRY_MODULES.concat(REGISTRY_AI_MODULES),
    minimal: CORE_MODULES,
    core: CORE_MODULES,
    ccs: CORE_MODULES.concat(CCS_MODULES),
    export: EXPORT_CORE_MODULES.concat(EXPORT_MODULES),
    dashboard: CORE_MODULES.concat(DOCUMENT_MODULES, CCS_MODULES, DASHBOARD_MODULES),
    full: CORE_MODULES.concat(DOCUMENT_MODULES, CCS_MODULES, DASHBOARD_MODULES, EXPORT_MODULES)
  };

  function unique(list){
    var seen = {};
    return (list || []).filter(function(src){
      if (!src || seen[src]) return false;
      seen[src] = true;
      return true;
    });
  }

  function currentScript(){
    return document.currentScript || (function(){
      var scripts = document.querySelectorAll('script[src*="vanguard_loader.js"]');
      return scripts[scripts.length - 1] || null;
    })();
  }

  function isRootIndexRegistry(){
    var p = String(location.pathname || '').toLowerCase();
    return /\/hypercore3\.0\/?$/.test(p) || /\/hypercore3\.0\/index\.html$/.test(p) || /\/index\.html$/.test(p);
  }

  function isRegistryPage(){
    var p = String(location.pathname || '').toLowerCase();
    return p.indexOf('index_equipment_registry') !== -1 || isRootIndexRegistry() || !!window.__NEXUS_REGISTRY_PAGE;
  }

  function normalizeMode(mode){
    mode = String(mode || '').trim().toLowerCase();
    return MODE_MAP[mode] ? mode : 'minimal';
  }

  function detectMode(){
    var script = currentScript();
    var fromWindow = window.NEXUS_VANGUARD_MODE || window.VANGUARD_LOADER_MODE;
    var fromDataset = script && script.dataset ? (script.dataset.vanguardMode || script.dataset.mode) : '';
    var fromQuery = '';
    try{
      var src = script && script.getAttribute('src') || '';
      var u = new URL(src, location.href);
      fromQuery = u.searchParams.get('mode') || '';
    }catch(e){}
    var fromBody = document.body ? (document.body.getAttribute('data-vanguard-mode') || '') : '';
    var selected = normalizeMode(fromWindow || fromDataset || fromQuery || fromBody || 'minimal');
    if (isRegistryPage() && selected === 'minimal') return 'registry';
    return selected;
  }

  var MODE = detectMode();
  var MODULES = unique(MODE_MAP[MODE] || CORE_MODULES);
  var OPTIONAL_NOT_PRESENT_IN_THIS_BUILD = [];

  function alreadyLoaded(src){
    var scripts = document.querySelectorAll('script[src]');
    for (var i=0;i<scripts.length;i+=1){
      if ((scripts[i].getAttribute('src') || '').indexOf(src) !== -1 || scripts[i].src.indexOf(src) !== -1) return true;
    }
    return false;
  }

  function loadScript(src){
    return new Promise(function(resolve){
      if (alreadyLoaded(src)) { resolve({src:src,status:'already'}); return; }
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = function(){ resolve({src:src,status:'loaded'}); };
      s.onerror = function(){ resolve({src:src,status:'missing'}); };
      document.head.appendChild(s);
    });
  }

  function loadList(list){
    var chain = Promise.resolve([]);
    unique(list || []).forEach(function(src){
      chain = chain.then(function(results){
        return loadScript(src).then(function(result){
          results.push(result);
          return results;
        });
      });
    });
    return chain;
  }

  function loadAll(){
    return loadList(MODULES).then(function(results){
      window.NEXUS_VANGUARD_LOADER.results = results;
      try { window.dispatchEvent(new CustomEvent('vanguard:loader:complete',{detail:{version:VERSION,mode:MODE,results:results}})); } catch(e){}
      return results;
    });
  }

  function loadRegistryAi(){
    return loadList(REGISTRY_AI_MODULES).then(function(results){
      window.NEXUS_VANGUARD_LOADER.registryAiResults = results;
      try { window.dispatchEvent(new CustomEvent('vanguard:registry-ai-ready',{detail:{version:VERSION,results:results}})); } catch(e){}
      return results;
    });
  }

  var api = {
    __installed:true,
    version:VERSION,
    mode:MODE,
    modules:MODULES.slice(),
    authorityModules:AUTHORITY_MODULES.slice(),
    availableModes:Object.keys(MODE_MAP),
    optionalMissing:OPTIONAL_NOT_PRESENT_IN_THIS_BUILD.slice(),
    loadAll:loadAll,
    loadRegistryAi:loadRegistryAi,
    loadScript:loadScript,
    results:[],
    registryAiResults:[]
  };
  window.NEXUS_VANGUARD_LOADER = api;
  window.VanguardLoader = api;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadAll);
  else loadAll();
})();