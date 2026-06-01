/*
  assets/js/nexus-vanguard-ai-loader.js
  Canonical loader for NEXUS Vanguard AI / offline / requirement / readiness stack.
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;

  var VERSION = '1.0.0';
  var loaded = window.__NEXUS_VANGUARD_AI_LOADED = window.__NEXUS_VANGUARD_AI_LOADED || {};
  var base = 'assets/js/';
  var files = [
    'nexus-offline-store.js',
    'nexus-sync-queue.js',
    'nexus-dependency-guard.js',
    'nexus-ai-config.js',
    'nexus-ai-client.js',
    'nexus-vanguard-ai-bridge.js',
    'nexus-vanguard-requirement-library.js',
    'nexus-vanguard-conflict-engine.js',
    'nexus-vanguard-dashboard-requirement-bridge.js',
    'nexus-vanguard-readiness-engine.js',
    'nexus-vanguard-equipment-readiness.js',
    'nexus-ccs-ai-integration.js',
    'nexus-torque-vanguard-integration.js',
    'nexus-meg-vanguard-integration.js'
  ];

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
    for (var i=0;i<files.length;i++) await loadScript(base + files[i]);
    window.NEXUS_VANGUARD_AI_LOADER = { version:VERSION, files:files.slice(), loaded:loaded };
    window.dispatchEvent(new CustomEvent('nexus:vanguard-ai-stack-ready', { detail:{ version:VERSION, files:files.slice() } }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
