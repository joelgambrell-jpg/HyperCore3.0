/*
  assets/js/nexus-ai-config.js
  NEXUS Vanguard AI configuration layer

  This file is intentionally safe for a public/static repo:
  - No API keys are stored here.
  - Browser AI calls are disabled unless an endpoint is explicitly configured.
  - Production AI should be routed through a private backend/proxy.
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;

  var STORAGE_KEY = 'nexus_vanguard_ai_config_v1';
  var DEFAULTS = {
    enabled: false,
    mode: 'assistive',
    provider: 'private-backend',
    endpoint: '',
    model: 'gpt-4.1-mini',
    timeoutMs: 45000,
    allowBrowserProviderCalls: false,
    requireHumanApproval: true,
    enforceApprovedRulesOnly: true,
    minimumConfidenceForAutoMap: 0.86,
    minimumConfidenceForValidationPass: 0.82,
    sourceHierarchy: [
      'project-specification',
      'approved-submittal',
      'manufacturer-instructions',
      'drawing',
      'field-entry',
      'manual-override'
    ],
    stricterRequirementWins: true,
    missingInfoState: 'review',
    failedValidationState: 'blocked'
  };

  function parse(raw, fallback){
    try { return raw ? JSON.parse(raw) : fallback; } catch(e){ return fallback; }
  }

  function cleanUrl(url){
    url = String(url || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url) && !/^\/[^/]/.test(url)) return '';
    return url;
  }

  function load(){
    var saved = parse(localStorage.getItem(STORAGE_KEY), {});
    var cfg = Object.assign({}, DEFAULTS, saved || {});
    cfg.endpoint = cleanUrl(cfg.endpoint);
    cfg.enabled = !!cfg.enabled && !!cfg.endpoint;
    cfg.requireHumanApproval = cfg.requireHumanApproval !== false;
    cfg.enforceApprovedRulesOnly = cfg.enforceApprovedRulesOnly !== false;
    return cfg;
  }

  function save(partial){
    var next = Object.assign({}, load(), partial || {});
    next.endpoint = cleanUrl(next.endpoint);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch(e) {}
    window.dispatchEvent(new CustomEvent('nexus:ai-config-updated', { detail: next }));
    return next;
  }

  function isEnabled(){
    var cfg = load();
    return !!(cfg.enabled && cfg.endpoint);
  }

  function explainDisabled(){
    var cfg = load();
    if (!cfg.endpoint) return 'AI backend endpoint is not configured.';
    if (!cfg.enabled) return 'AI is disabled for this project.';
    return '';
  }

  window.NEXUS_AI_CONFIG = {
    __installed: true,
    version: '1.0.0',
    defaults: DEFAULTS,
    load: load,
    save: save,
    isEnabled: isEnabled,
    explainDisabled: explainDisabled
  };
})();
