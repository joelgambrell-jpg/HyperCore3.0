/* assets/js/vanguard_rules_validation.js - requirement validation facade */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  window.VanguardRequirementValidation = {
    version: '1.0.0',
    validate: function(requirementId, observed, options){ return window.Vanguard && window.Vanguard.validateRequirement ? window.Vanguard.validateRequirement(requirementId, observed, options || {}) : null; },
    setGroup: function(group, data){ return window.Vanguard && window.Vanguard.setValidation ? window.Vanguard.setValidation(group, data || {}) : null; }
  };
})();
