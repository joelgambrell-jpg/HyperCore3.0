/* assets/js/vanguard_ai.js - reserved AI orchestration facade */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.VanguardAI = window.VanguardAI || {
    version: '1.0.0',
    queueFlag: function(flag){ return window.Vanguard && window.Vanguard.addFlag ? window.Vanguard.addFlag(flag || {}) : null; },
    addRequirement: function(req){ return window.Vanguard && window.Vanguard.addRequirement ? window.Vanguard.addRequirement(req || {}) : null; },
    addConflict: function(conflict){ return window.Vanguard && window.Vanguard.addConflict ? window.Vanguard.addConflict(conflict || {}) : null; }
  };
})();
