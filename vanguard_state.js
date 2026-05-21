/* assets/js/vanguard_state.js - canonical state facade */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.VanguardState = {
    version: '1.0.0',
    get: function(eq){ return window.Vanguard && window.Vanguard.getCanonicalState ? window.Vanguard.getCanonicalState(eq) : null; },
    update: function(patch, action){ return window.Vanguard && window.Vanguard.updateState ? window.Vanguard.updateState(patch || {}, action || 'state:update') : null; },
    readiness: function(eq){ return window.Vanguard && window.Vanguard.getReadiness ? window.Vanguard.getReadiness(eq) : null; }
  };
})();
