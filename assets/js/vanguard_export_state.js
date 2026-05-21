/* assets/js/vanguard_export_state.js - export/readiness facade */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.VanguardExportState = {
    version: '1.0.0',
    readiness: function(eq){ return window.Vanguard && window.Vanguard.getReadiness ? window.Vanguard.getReadiness(eq) : null; },
    state: function(eq){ return window.Vanguard && window.Vanguard.getCanonicalState ? window.Vanguard.getCanonicalState(eq) : null; }
  };
})();
