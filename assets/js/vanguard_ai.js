/* assets/js/vanguard_ai.js - Vanguard AI orchestration facade + canonical NEXUS AI loader */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;

  window.VanguardAI = window.VanguardAI || {
    version: '1.1.0',
    queueFlag: function(flag){ return window.Vanguard && window.Vanguard.addFlag ? window.Vanguard.addFlag(flag || {}) : null; },
    addRequirement: function(req){ return window.Vanguard && window.Vanguard.addRequirement ? window.Vanguard.addRequirement(req || {}) : null; },
    addConflict: function(conflict){ return window.Vanguard && window.Vanguard.addConflict ? window.Vanguard.addConflict(conflict || {}) : null; }
  };

  function loadCanonicalStack(){
    var src = 'assets/js/nexus-vanguard-ai-loader.js';
    if (window.__NEXUS_VANGUARD_AI_CANONICAL_REQUESTED) return;
    window.__NEXUS_VANGUARD_AI_CANONICAL_REQUESTED = true;
    if (document.querySelector('script[src="' + src + '"]')) return;
    var s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onerror = function(){ console.warn('Unable to load canonical NEXUS Vanguard AI stack:', src); };
    (document.head || document.documentElement).appendChild(s);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadCanonicalStack); else loadCanonicalStack();
})();
