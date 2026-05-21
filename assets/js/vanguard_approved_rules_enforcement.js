/*
  assets/js/vanguard_approved_rules_enforcement.js
  NEXUS Vanguard Approved Rules Enforcement

  Purpose:
  - Only engineer-approved/published requirements can enforce field workflow.
  - Unapproved AI/document extractions remain office-side review data.
  - Field pages receive simple Ready / Missing / Blocked / Complete results.
  - Customer export receives traceable rule -> evidence -> validation status.
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_APPROVED_RULES && window.NEXUS_VANGUARD_APPROVED_RULES.__installed) return;

  var VERSION = '0.1.0-approved-rules-enforcement';
  var FIELD_STATUSES = { READY:'READY', MISSING:'MISSING', BLOCKED:'BLOCKED', COMPLETE:'COMPLETE', REVIEW:'REVIEW' };

  function clean(v){ return String(v == null ? '' : v).trim(); }
  function upper(v){ return clean(v).toUpperCase(); }
  function nowISO(){ return new Date().toISOString(); }
  function core(){ return window.NEXUS_VANGUARD || window.Vanguard || (window.NEXUS && window.NEXUS.Vanguard) || null; }
  function review(){ return window.NEXUS_VANGUARD_REQUIREMENT_REVIEW || window.VanguardRequirementReview || (window.NEXUS && window.NEXUS.VanguardRequirementReview) || null; }
  function toNum(v){ var n = Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g,'')); return isFinite(n) ? n : null; }
  function safeArray(v){ return Array.isArray(v) ? v : []; }
  function escapeHTML(value){
    return clean(value).replace(/[&<>"']/g, function(ch){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]; });
  }

  function state(eq){
    var vg = core();
    if (vg && typeof vg.getState === 'function') return vg.getState(eq) || {};
    return {};
  }

  function groupRules(rules){
    var out = { ALL:[] };
    if (!rules) return out;
    if (Array.isArray(rules)) {
      rules.forEach(function(r){ addRule(out, r); });
      return out;
    }
    Object.keys(rules).forEach(function(key){
      var list = Array.isArray(rules[key]) ? rules[key] : [rules[key]];
      list.forEach(function(r){ addRule(out, Object.assign({ requirementType:key }, r || {})); });
    });
    return out;
  }

  function addRule(out, rule){
    rule = normalizeRule(rule);
    if (!rule.id && !rule.value) return;
    out.ALL.push(rule);
    var target = inferTarget(rule);
    out[target] = out[target] || [];
    out[target].push(rule);
  }

  function normalizeRule(rule){
    rule = rule && typeof rule === 'object' ? rule : {};
    var id = clean(rule.id || rule.requirementId || rule.key || 'REQ-' + Math.random().toString(36).slice(2,8));
    return {
      id: id,
      requirementId: id,
      requirementType: upper(rule.requirementType || rule.type || rule.section || 'GENERAL'),
      target: upper(rule.target || rule.step || rule.workflowStep || rule.appliesToStep || ''),
      value: clean(rule.value || rule.requirement || rule.text || rule.exactText || ''),
      numericValue: rule.numericValue != null && rule.numericValue !== '' ? Number(rule.numericValue) : toNum(rule.value),
      units: clean(rule.units || ''),
      appliesTo: clean(rule.appliesTo || rule.equipment || rule.component || ''),
      sourceDocument: clean(rule.sourceDocument || rule.document || rule.file || ''),
      page: clean(rule.page || ''),
      exactText: clean(rule.exactText || rule.text || rule.value || ''),
      approved: rule.approved !== false,
      approvedAt: clean(rule.approvedAt || ''),
      approvedBy: clean(rule.approvedBy || '')
    };
  }

  function inferTarget(rule){
    var hay = upper([rule.target, rule.requirementType, rule.appliesTo, rule.value, rule.exactText].join(' '));
    if (/TORQUE|BOLT|LUG|CONNECTION|FT\s*-?\s*LB|FTLB|N\s*-?\s*M|NEWTON/.test(hay)) return 'TORQUE';
    if (/MEG|MEGOHMMETER|INSULATION|RESISTANCE|MOHM|MΩ|OHM/.test(hay)) return 'MEG';
    if (/CCS|CHECK\s*SHEET|CHECKLIST|INSPECTION|INSTALLATION|PREFOD|FOD|L2|RIF|PHENOLIC|FPV/.test(hay)) return 'CCS';
    if (/PHOTO|PICTURE|IMAGE/.test(hay)) return 'FPV';
    return 'GENERAL';
  }

  function getPublishedRules(eq){
    var rv = review();
    var docs = state(eq).documents || {};
    var rules = null;
    if (rv && typeof rv.getFieldRules === 'function') rules = rv.getFieldRules();
    if (!rules || !Object.keys(rules).length) rules = docs.activeRequirementRules || docs.approvedRules || null;
    return groupRules(rules);
  }

  function gateStatus(eq){
    var rv = review();
    if (rv && typeof rv.gateStatus === 'function') return rv.gateStatus();
    var docs = state(eq).documents || {};
    return docs.reviewGate || { status: Object.keys(getPublishedRules(eq)).length > 1 ? 'PUBLISHED' : 'NO_APPROVED_REQUIREMENTS', pending:0, approved:0 };
  }

  function applicableRules(step, eq){
    var grouped = getPublishedRules(eq);
    var key = upper(step || 'GENERAL');
    var direct = grouped[key] || [];
    var general = grouped.GENERAL || [];
    return direct.concat(general.filter(function(rule){ return inferTarget(rule) === key; }));
  }

  function ruleResult(rule, passed, observed, message, evidence){
    return {
      requirementId: rule.id,
      requirementType: rule.requirementType,
      target: inferTarget(rule),
      passed: !!passed,
      status: passed ? 'PASS' : 'FAIL',
      expected: rule.numericValue != null ? rule.numericValue : rule.value,
      units: rule.units,
      observed: observed,
      message: message || (passed ? 'Approved requirement satisfied.' : 'Approved requirement not satisfied.'),
      sourceDocument: rule.sourceDocument,
      page: rule.page,
      approvedAt: rule.approvedAt,
      approvedBy: rule.approvedBy,
      evidence: evidence || null,
      checkedAt: nowISO()
    };
  }

  function evaluateTorque(payload, eq){
    payload = payload || {};
    var rules = applicableRules('TORQUE', eq);
    var rows = safeArray(payload.rows);
    var populated = rows.filter(function(r){ return clean(r.connection || r.location) && (clean(r.value) || clean(r.specValue)); });
    var results = [];
    rules.forEach(function(rule){
      var expected = rule.numericValue;
      if (expected == null) {
        var hasAny = populated.length > 0;
        results.push(ruleResult(rule, hasAny, hasAny ? populated.length + ' torque rows' : 'No torque rows', hasAny ? 'Torque evidence present.' : 'Torque evidence missing.', { rowCount: populated.length }));
        return;
      }
      var matching = populated.filter(function(r){
        var hay = upper([r.connection, r.location, r.bolt, r.boltType, r.source].join(' '));
        var applies = upper(rule.appliesTo || rule.value);
        return !applies || applies === 'TORQUE' || hay.indexOf(applies) !== -1 || applies.indexOf(hay) !== -1;
      });
      if (!matching.length) matching = populated;
      var bad = matching.filter(function(r){
        var observed = toNum(r.value);
        return observed == null || Math.abs(observed - expected) > Math.max(1, expected * 0.05);
      });
      results.push(ruleResult(rule, matching.length > 0 && bad.length === 0, matching.length ? (matching.length - bad.length) + '/' + matching.length + ' within approved value' : 'No matching rows', matching.length && !bad.length ? 'Torque rows satisfy approved requirement.' : 'Torque row missing or outside approved requirement.', { rowCount: matching.length, failedRows: bad.length }));
    });
    return buildStepOutcome('torque', payload.complete === true || String(payload.status).toUpperCase() === 'COMPLETE', rules, results, payload);
  }

  function evaluateMeg(payload, eq){
    payload = payload || {};
    var rules = applicableRules('MEG', eq);
    var rows = safeArray(payload.lineRowData).concat(safeArray(payload.loadRowData), safeArray(payload.equipmentRowData), safeArray(payload.rows));
    if (!rows.length) {
      rows = [];
      var ev = state(eq).evidence && state(eq).evidence.meg;
      if (ev && ev.lastItem) rows = safeArray(ev.lastItem.lineRowData).concat(safeArray(ev.lastItem.loadRowData), safeArray(ev.lastItem.equipmentRowData));
    }
    var thresholdFromPayload = toNum(payload.threshold);
    var results = [];
    rules.forEach(function(rule){
      var expected = rule.numericValue != null ? rule.numericValue : (thresholdFromPayload != null ? thresholdFromPayload : 11);
      var readings = rows.map(function(r){ return toNum(r.reading || r.result || r.value); }).filter(function(n){ return n != null; });
      var bad = readings.filter(function(n){ return n < expected; });
      var pass = readings.length > 0 && bad.length === 0;
      results.push(ruleResult(rule, pass, readings.length ? (readings.length - bad.length) + '/' + readings.length + ' ≥ ' + expected : 'No meg readings', pass ? 'Meg readings satisfy approved minimum.' : 'Meg reading missing or below approved minimum.', { readingCount: readings.length, failedReadings: bad.length, threshold: expected }));
    });
    return buildStepOutcome('meg', payload.complete === true || String(payload.status).toUpperCase() === 'COMPLETE', rules, results, payload);
  }

  function evaluateCCS(payload, eq){
    payload = payload || {};
    var rules = applicableRules('CCS', eq);
    var items = safeArray(payload.items || payload.steps || (payload.evidence && payload.evidence.items));
    var results = [];
    rules.forEach(function(rule){
      var target = upper(rule.appliesTo || rule.value || rule.requirementType);
      var matching = items.filter(function(item){ return upper([item.title, item.description, item.section, item.source, item.requirement].join(' ')).indexOf(target) !== -1; });
      if (!matching.length) matching = items;
      var bad = matching.filter(function(item){
        var s = upper(item.status || item.result || item.validationStatus);
        return !(s === 'PASS' || s === 'COMPLETE' || s === 'APPROVED' || s === 'OVERRIDDEN');
      });
      var pass = matching.length > 0 && bad.length === 0;
      results.push(ruleResult(rule, pass, matching.length ? (matching.length - bad.length) + '/' + matching.length + ' checklist items accepted' : 'No matching checklist item', pass ? 'CCS item evidence satisfies approved requirement.' : 'CCS evidence missing, open, or failed.', { itemCount: matching.length, failedItems: bad.length }));
    });
    return buildStepOutcome('ccs', payload.complete === true || payload.finalApproved === true || String(payload.status).toUpperCase() === 'COMPLETE', rules, results, payload);
  }

  function buildStepOutcome(step, baseComplete, rules, results, payload){
    var failed = results.filter(function(r){ return !r.passed; });
    var status;
    if (!rules.length) status = baseComplete ? FIELD_STATUSES.COMPLETE : FIELD_STATUSES.READY;
    else if (failed.length) status = FIELD_STATUSES.BLOCKED;
    else status = baseComplete ? FIELD_STATUSES.COMPLETE : FIELD_STATUSES.READY;
    return {
      step: step,
      status: status,
      complete: status === FIELD_STATUSES.COMPLETE,
      blocked: status === FIELD_STATUSES.BLOCKED,
      ruleCount: rules.length,
      passedRuleCount: results.length - failed.length,
      failedRuleCount: failed.length,
      rules: results,
      fieldMessage: fieldMessage(step, status, rules.length, failed.length),
      payloadStatus: payload && payload.status || '',
      updatedAt: nowISO(),
      source: 'vanguard_approved_rules_enforcement'
    };
  }

  function fieldMessage(step, status, ruleCount, failedCount){
    if (!ruleCount) return 'Ready. No approved rule blocks active for this step.';
    if (status === FIELD_STATUSES.BLOCKED) return 'Blocked. Approved requirement missing or failed.';
    if (status === FIELD_STATUSES.COMPLETE) return 'Complete. Approved requirements satisfied.';
    return 'Ready. Approved requirements active.';
  }

  function evaluate(step, payload, eq){
    var s = clean(step).toLowerCase();
    if (s === 'torque') return evaluateTorque(payload || {}, eq);
    if (s === 'meg') return evaluateMeg(payload || {}, eq);
    if (s === 'ccs') return evaluateCCS(payload || {}, eq);
    return buildStepOutcome(s, payload && payload.complete === true, applicableRules(s, eq), [], payload || {});
  }

  function syncStep(step, payload, options){
    options = options || {};
    var vg = core();
    var eq = clean((options && options.equipmentId) || (payload && payload.equipmentId) || (payload && payload.eq) || (vg && vg.getEq && vg.getEq()) || '');
    var outcome = evaluate(step, payload || {}, eq);
    if (vg) {
      if (typeof vg.setValidation === 'function') {
        vg.setValidation(clean(step).toLowerCase() + '_approved_rules', outcome);
      }
      if (typeof vg.setEvidence === 'function') {
        vg.setEvidence(clean(step).toLowerCase() + '_rule_trace', {
          step: outcome.step,
          status: outcome.status,
          ruleCount: outcome.ruleCount,
          passedRuleCount: outcome.passedRuleCount,
          failedRuleCount: outcome.failedRuleCount,
          rules: outcome.rules,
          updatedAt: outcome.updatedAt,
          source: outcome.source
        });
      }
      if (outcome.blocked && typeof vg.setStepComplete === 'function') {
        vg.setStepComplete(clean(step).toLowerCase(), false, eq, 'approved_rules_enforcement');
      }
      if (!outcome.blocked && outcome.complete && typeof vg.setStepComplete === 'function') {
        vg.setStepComplete(clean(step).toLowerCase(), true, eq, 'approved_rules_enforcement');
      }
    }
    if (options.render !== false) renderFieldGate(outcome, options.mountId || 'vanguardApprovedRulesGate');
    return outcome;
  }

  function renderFieldGate(outcome, mountId){
    try{
      var mount = document.getElementById(mountId);
      if (!mount) return;
      var cls = outcome.blocked ? 'blocked' : (outcome.complete ? 'complete' : 'ready');
      var label = outcome.blocked ? 'BLOCKED' : (outcome.complete ? 'COMPLETE' : 'READY');
      mount.innerHTML = '<div class="vg-approved-gate vg-approved-gate-' + cls + '"><b>' + label + '</b><span>' + escapeHTML(outcome.fieldMessage) + '</span></div>';
      injectStyles();
    }catch(e){}
  }

  function injectStyles(){
    if (document.getElementById('vg-approved-rules-style')) return;
    var st = document.createElement('style');
    st.id = 'vg-approved-rules-style';
    st.textContent = '.vg-approved-gate{margin:10px 0;padding:12px 14px;border-radius:14px;border:2px solid #94a3b8;background:#f8fafc;color:#0f172a;font-family:Arial,Helvetica,sans-serif;display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;font-size:14px}.vg-approved-gate b{font-size:16px}.vg-approved-gate-ready{border-color:#38bdf8;background:#eff6ff}.vg-approved-gate-complete{border-color:#16a34a;background:#ecfdf5}.vg-approved-gate-blocked{border-color:#dc2626;background:#fef2f2}.vg-approved-gate span{font-weight:700}';
    document.head.appendChild(st);
  }

  function exportTrace(eq){
    var st = state(eq);
    var validations = st.validations || {};
    return {
      equipmentId: eq || st.equipmentId || '',
      gate: gateStatus(eq),
      torque: validations.torque_approved_rules || null,
      meg: validations.meg_approved_rules || null,
      ccs: validations.ccs_approved_rules || null,
      updatedAt: nowISO(),
      source: 'vanguard_approved_rules_enforcement'
    };
  }

  var api = {
    __installed:true,
    version:VERSION,
    getPublishedRules:getPublishedRules,
    applicableRules:applicableRules,
    gateStatus:gateStatus,
    evaluate:evaluate,
    syncStep:syncStep,
    renderFieldGate:renderFieldGate,
    exportTrace:exportTrace
  };
  window.NEXUS_VANGUARD_APPROVED_RULES = api;
  window.VanguardApprovedRules = api;
  window.NEXUS = window.NEXUS || {};
  window.NEXUS.VanguardApprovedRules = api;
  try { window.dispatchEvent(new CustomEvent('vanguard:approved-rules-ready', { detail:{ version:VERSION } })); } catch(e) {}
})();
