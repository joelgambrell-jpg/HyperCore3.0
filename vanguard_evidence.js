/* assets/js/vanguard_evidence.js - evidence graph facade */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.VanguardEvidence = {
    version: '1.0.0',
    register: function(group, data){ return window.Vanguard && window.Vanguard.registerEvidence ? window.Vanguard.registerEvidence(group, data || {}) : null; },
    set: function(group, data){ return window.Vanguard && window.Vanguard.setEvidence ? window.Vanguard.setEvidence(group, data || {}) : null; }
  };
})();
