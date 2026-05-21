/* assets/js/vanguard_rules.js - workflow rules facade */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.VanguardRules = {
    version: '1.0.0',
    order: function(){ return window.Vanguard && window.Vanguard.getWorkflowOrder ? window.Vanguard.getWorkflowOrder() : []; },
    canAdvance: function(eq, stepId){ return window.Vanguard && window.Vanguard.canAdvance ? window.Vanguard.canAdvance(eq, stepId) : { allowed:false, blockers:[{code:'VANGUARD_UNAVAILABLE'}] }; },
    completeStep: function(stepId, metadata){ return window.Vanguard && window.Vanguard.completeStep ? window.Vanguard.completeStep(stepId, metadata || {}) : { ok:false, blockers:[{code:'VANGUARD_UNAVAILABLE'}] }; }
  };
})();
