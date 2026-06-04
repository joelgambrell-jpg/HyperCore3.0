/*
  assets/js/nexus-vanguard-hard-gates.js
  HyperCore / NEXUS Vanguard front-end hard gate engine

  Purpose:
  - Finishes non-backend validation behavior before Firebase/Gemini handoff.
  - Blocks pass/complete/export readiness for N/A without reason/reference, FAIL, missing reference,
    numeric mismatch, unresolved conflicts, and low confidence validation.
  - Does not replace existing page logic; exposes a single canonical gate API.
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_HARD_GATES && window.NEXUS_VANGUARD_HARD_GATES.__installed) return;

  var VERSION = '1.0.0-front-end-hardening';

  function now(){ return new Date().toISOString(); }
  function clean(v){ return String(v == null ? '' : v).trim(); }
  function upper(v){ return clean(v).toUpperCase(); }
  function lower(v){ return clean(v).toLowerCase(); }
  function safeArray(v){ return Array.isArray(v) ? v : []; }
  function toNum(v){
    var n = Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g,''));
    return isFinite(n) ? n : null;
  }

  function normalizeStatus(v){
    var s = upper(v);
    if (['PASS','PASSED','GO','YES','Y','COMPLETE','COMPLETED'].indexOf(s) !== -1) return 'PASS';
    if (['FAIL','FAILED','NO','N','NG'].indexOf(s) !== -1) return 'FAIL';
    if (['NA','N/A','NOT APPLICABLE','NOT-APPLICABLE'].indexOf(s) !== -1) return 'NA';
    if (['REVIEW','CHECK','HOLD','PENDING'].indexOf(s) !== -1) return 'REVIEW';
    return s || '';
  }

  function hasReference(item){
    item = item || {};
    if (clean(item.source) && clean(item.source).toLowerCase() !== 'nexus vanguard') return true;
    if (safeArray(item.references).some(function(r){ return clean(r && (r.url || r.name || r.notes || r.reference)); })) return true;
    if (safeArray(item.evidenceRecords).some(function(r){
      return ['REFERENCE','DOCUMENT','REQUIREMENT'].indexOf(upper(r && r.type)) !== -1 &&
        (clean(r.url) || clean(r.reference) || clean(r.sourceDocument) || clean(r.page) || clean(r.notes));
    })) return true;
    if (item.aiCheck && safeArray(item.aiCheck.citations).length) return true;
    if (item.vanguardRule && safeArray(item.vanguardRule.citations).length) return true;
    return false;
  }

  function hasPageOrLocator(item){
    item = item || {};
    if (clean(item.page) || clean(item.section)) return true;
    if (safeArray(item.evidenceRecords).some(function(r){ return clean(r && (r.page || r.reference || r.sourceDocument)); })) return true;
    if (safeArray(item.references).some(function(r){ return clean(r && (r.page || r.section || r.notes)); })) return true;
    var citations = [];
    if (item.aiCheck && safeArray(item.aiCheck.citations).length) citations = citations.concat(item.aiCheck.citations);
    if (item.vanguardRule && safeArray(item.vanguardRule.citations).length) citations = citations.concat(item.vanguardRule.citations);
    return citations.some(function(c){ return clean(c && (c.page || c.locator || c.section)); });
  }

  function hasReason(item){
    item = item || {};
    return !!clean(item.reason || item.note || item.notes || (item.supervisorReview && item.supervisorReview.comment));
  }

  function supervisorOverride(item){
    item = item || {};
    var decision = upper(item.supervisorReview && item.supervisorReview.decision);
    return decision === 'OVERRIDE' || !!(item.supervisorOverride && item.supervisorOverride.active);
  }

  function approvedReview(item){
    item = item || {};
    var decision = upper(item.supervisorReview && item.supervisorReview.decision);
    return decision === 'APPROVED' || decision === 'OVERRIDE';
  }

  function conflicts(){
    try {
      if (window.NEXUS_VANGUARD_CONFLICTS && typeof window.NEXUS_VANGUARD_CONFLICTS.load === 'function') {
        return safeArray((window.NEXUS_VANGUARD_CONFLICTS.load() || {}).conflicts);
      }
    } catch(e) {}
    try {
      var raw = localStorage.getItem('nexus_vanguard_conflicts_v1');
      return safeArray((JSON.parse(raw || '{}') || {}).conflicts);
    } catch(e2) {}
    return [];
  }

  function unresolvedConflicts(){
    return conflicts().filter(function(c){ return !/resolved|approved|closed/i.test(clean(c.state || c.status || 'review')); });
  }

  function compareNumeric(entry, requirement){
    requirement = requirement || {};
    entry = entry || {};
    var required = toNum(requirement.value != null ? requirement.value : requirement.numericValue);
    var entered = toNum(entry.value != null ? entry.value : (entry.measuredValue != null ? entry.measuredValue : (entry.torque != null ? entry.torque : (entry.resistance != null ? entry.resistance : entry.reading))));
    if (required == null || entered == null) return null;

    var type = lower(requirement.type || requirement.requirementType);
    var comparator = lower(requirement.comparator || requirement.operator);
    var tolerance = toNum(requirement.tolerancePercent);
    var pass = false;
    var reason = '';

    if (comparator === '=' || comparator === 'equals' || comparator === 'exact') {
      pass = entered === required;
      reason = pass ? 'Numeric value matches the approved requirement.' : 'Numeric value does not exactly match the approved requirement.';
    } else if (comparator === '<=' || comparator === 'max' || comparator === 'maximum') {
      pass = entered <= required;
      reason = pass ? 'Numeric value is at or below the approved maximum.' : 'Numeric value exceeds the approved maximum.';
    } else if (type.indexOf('meg') !== -1 || type.indexOf('resistance') !== -1 || comparator === '>=' || comparator === 'min' || comparator === 'minimum') {
      pass = entered >= required;
      reason = pass ? 'Numeric value meets or exceeds the approved minimum.' : 'Numeric value is below the approved minimum.';
    } else if (type.indexOf('torque') !== -1) {
      var tol = tolerance == null ? 10 : tolerance;
      var low = required * (1 - tol / 100);
      var high = required * (1 + tol / 100);
      pass = entered >= low && entered <= high;
      reason = pass ? 'Torque value is within approved tolerance.' : 'Torque value is outside approved tolerance.';
    } else {
      pass = entered >= required;
      reason = pass ? 'Numeric value meets the approved requirement.' : 'Numeric value does not meet the approved requirement.';
    }

    return {
      status: pass ? 'PASS' : 'BLOCKED',
      enteredValue: entered,
      requiredValue: required,
      unit: clean(requirement.unit || requirement.units),
      requirementId: clean(requirement.id || requirement.requirementId),
      message: reason
    };
  }

  function validateStep(step, options){
    step = step || {};
    options = options || {};
    var issues = [];
    var warnings = [];
    var passes = [];
    var status = normalizeStatus(step.status || step.result || step.passFail);
    var hardFailure = false;

    if (!status) {
      hardFailure = true;
      issues.push('Select PASS, FAIL, REVIEW, or N/A.');
    }

    if (status === 'FAIL') {
      hardFailure = true;
      issues.push('This item is marked FAIL. Correct it or route it to authorized override.');
    }

    if (status === 'NA') {
      if (!hasReason(step)) {
        hardFailure = true;
        issues.push('N/A requires a reason before this item can pass.');
      }
      if (!hasReference(step)) {
        hardFailure = true;
        issues.push('N/A requires a source/reference showing why it does not apply.');
      }
      if (!approvedReview(step) && options.requireNaApproval !== false) {
        warnings.push('N/A should be approved by foreman/supervisor before final release.');
      }
    }

    if ((status === 'REVIEW' || status === 'FAIL') && !hasReason(step)) {
      warnings.push('Review/fail items need notes explaining what happened.');
    }

    var ruleText = upper([step.validationRule, step.rule, step.evidenceRequired, step.source, step.title].join(' '));
    var refRequired = /DOCUMENT|REFERENCE|SOURCE|SPEC|DRAWING|SUBMITTAL|REQUIREMENT/.test(ruleText);
    if ((refRequired || status === 'PASS') && !hasReference(step)) {
      hardFailure = true;
      issues.push('A source/reference is required before this item can pass.');
    }

    if (options.requireLocator && hasReference(step) && !hasPageOrLocator(step)) {
      warnings.push('Add page, section, or locator detail for stronger package traceability.');
    }

    var ai = step.aiCheck || step.vanguardRule || null;
    if (ai) {
      var aiStatus = upper(ai.status || ai.state);
      if (aiStatus === 'BLOCKED' || aiStatus === 'FAIL' || aiStatus === 'FAILED') {
        hardFailure = true;
        issues.push(ai.message || ai.summary || 'Vanguard validation is blocked.');
      }
      var confidence = Number(ai.confidence);
      if (isFinite(confidence) && confidence > 1) confidence = confidence / 100;
      var minConfidence = Number(options.minimumConfidence || 0.82);
      if (isFinite(confidence) && confidence > 0 && confidence < minConfidence) {
        hardFailure = true;
        issues.push('Vanguard confidence is below the required threshold.');
      }
    }

    if (hardFailure && supervisorOverride(step)) {
      warnings.push('Hard gate cleared by superintendent/admin override.');
      hardFailure = false;
      issues = [];
    }

    if (hardFailure) {
      return {
        status:'BLOCKED',
        fieldLabel:'STOP',
        tone:'stop',
        message:issues[0] || 'This item is blocked.',
        issues:issues,
        warnings:warnings,
        passes:passes,
        checkedAt:now(),
        checkedBy:'NEXUS_VANGUARD_HARD_GATES',
        canPass:false
      };
    }

    if (warnings.length || status === 'REVIEW' || status === 'NA') {
      return {
        status:'REVIEW',
        fieldLabel:'CHECK',
        tone:'check',
        message:warnings[0] || (status === 'NA' ? 'N/A recorded. Confirm reason/reference before final release.' : 'Review item before final release.'),
        issues:[],
        warnings:warnings,
        passes:passes,
        checkedAt:now(),
        checkedBy:'NEXUS_VANGUARD_HARD_GATES',
        canPass: status !== 'FAIL'
      };
    }

    return {
      status:'PASS',
      fieldLabel:'GOOD',
      tone:'good',
      message:'Good. This item meets front-end hard gate checks.',
      issues:[],
      warnings:[],
      passes:passes,
      checkedAt:now(),
      checkedBy:'NEXUS_VANGUARD_HARD_GATES',
      canPass:true
    };
  }

  function validatePayload(payload, options){
    payload = payload || {};
    options = options || {};
    var rows = safeArray(payload.steps || payload.rows || payload.items);
    var results = rows.map(function(step, idx){
      return { index:idx, stepId:clean(step && (step.id || step.stepId || step.step)), title:clean(step && (step.title || step.description || step.stepDescription)), result:validateStep(step, options) };
    });
    var issues = [];
    var warnings = [];

    results.forEach(function(r){
      if (r.result.status === 'BLOCKED') issues.push({ step:r.stepId, title:r.title, reason:r.result.message, issues:r.result.issues });
      if (r.result.status === 'REVIEW') warnings.push({ step:r.stepId, title:r.title, reason:r.result.message, warnings:r.result.warnings });
    });

    var openConflicts = options.ignoreConflicts ? [] : unresolvedConflicts();
    if (openConflicts.length) {
      issues.push({ step:'PROJECT', title:'Unresolved requirement conflicts', reason:openConflicts.length + ' unresolved requirement conflict(s) require engineer review.', conflicts:openConflicts });
    }

    var status = issues.length ? 'BLOCKED' : (warnings.length ? 'REVIEW' : 'PASS');
    return {
      version:VERSION,
      status:status,
      canPass:status === 'PASS',
      checkedAt:now(),
      total:rows.length,
      blocked:issues.length,
      review:warnings.length,
      issues:issues,
      warnings:warnings,
      results:results
    };
  }

  function installButtonGuard(){
    document.addEventListener('click', function(ev){
      var target = ev.target;
      if (!target || !target.matches) return;
      if (!target.matches('#finalSignBtn,[data-final-signoff],[data-package-complete],[data-energization-release]')) return;
      try {
        var payload = null;
        if (window.NEXUS_CCS_CURRENT_PAYLOAD) payload = window.NEXUS_CCS_CURRENT_PAYLOAD;
        if (!payload && window.NEXUS_CCS_EXPORT_PAYLOAD) payload = window.NEXUS_CCS_EXPORT_PAYLOAD;
        if (!payload) return;
        var result = validatePayload(payload, { requireLocator:false });
        if (!result.canPass) {
          ev.preventDefault();
          ev.stopImmediatePropagation();
          alert('STOP: Vanguard hard gates are not cleared.\n\n' + (result.issues[0] && result.issues[0].reason || 'Review blocked items before final sign-off.'));
        }
      } catch(e) {}
    }, true);
  }

  var api = {
    __installed:true,
    version:VERSION,
    normalizeStatus:normalizeStatus,
    hasReference:hasReference,
    hasPageOrLocator:hasPageOrLocator,
    hasReason:hasReason,
    compareNumeric:compareNumeric,
    validateStep:validateStep,
    validatePayload:validatePayload,
    unresolvedConflicts:unresolvedConflicts
  };

  window.NEXUS_VANGUARD_HARD_GATES = api;
  window.VanguardHardGates = api;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installButtonGuard);
  else installButtonGuard();

  window.dispatchEvent(new CustomEvent('nexus:vanguard-hard-gates-ready', { detail:{ version:VERSION } }));
})();
