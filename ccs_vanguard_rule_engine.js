/*
  assets/js/ccs_vanguard_rule_engine.js
  NEXUS CCS Vanguard Rule Engine

  Purpose:
  - Converts imported Excel CCS Validation Rule values into simple field states.
  - Additive only. Does not replace existing CCS page logic.
  - Uses existing NEXUS/localStorage completion keys where possible.

  Field states:
  PASS    = GOOD
  REVIEW  = CHECK
  BLOCKED = STOP
*/

(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.NEXUS_CCS_VANGUARD_RULES && window.NEXUS_CCS_VANGUARD_RULES.__installed) return;

  var VERSION = '0.3.0-evidence-aware';

  var RULES = {
    REQUIRED: 'REQUIRED',
    PHOTO_REQUIRED: 'PHOTO_REQUIRED',
    FOREMAN_APPROVAL: 'FOREMAN_APPROVAL',
    TORQUE_COMPLETE: 'TORQUE_COMPLETE',
    MEG_COMPLETE: 'MEG_COMPLETE',
    L2_COMPLETE: 'L2_COMPLETE',
    PREFOD_COMPLETE: 'PREFOD_COMPLETE',
    FPV_COMPLETE: 'FPV_COMPLETE',
    DOCUMENT_REFERENCE_REQUIRED: 'DOCUMENT_REFERENCE_REQUIRED'
  };

  var STEP_RULE_MAP = {
    TORQUE_COMPLETE: 'torque',
    MEG_COMPLETE: 'meg',
    L2_COMPLETE: 'l2',
    PREFOD_COMPLETE: 'prefod',
    FPV_COMPLETE: 'fpv'
  };

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function upper(value) {
    return clean(value).toUpperCase();
  }

  function lower(value) {
    return clean(value).toLowerCase();
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function getEq() {
    try {
      var params = new URL(window.location.href).searchParams;
      var fromUrl = clean(params.get('eq') || params.get('equipment') || params.get('equipmentId') || '');
      if (fromUrl) return fromUrl;
    } catch (err) {}

    try {
      if (window.NEXUS && typeof window.NEXUS.getEq === 'function') {
        var nxEq = clean(window.NEXUS.getEq());
        if (nxEq) return nxEq;
      }
    } catch (err2) {}

    try {
      if (window.NEXUS_VANGUARD && typeof window.NEXUS_VANGUARD.getEq === 'function') {
        var vgEq = clean(window.NEXUS_VANGUARD.getEq());
        if (vgEq) return vgEq;
      }
    } catch (err3) {}

    return clean(
      readText('nexus_active_eq', '') ||
      readText('nexus_active_equipment', '') ||
      readText('nexus_current_eq', '') ||
      readText('eq', '')
    );
  }

  function readText(key, fallback) {
    try {
      var value = localStorage.getItem(key);
      return value == null ? (fallback || '') : value;
    } catch (err) {
      return fallback || '';
    }
  }

  function isTruthyStored(value) {
    var v = lower(value);
    return v === '1' || v === 'true' || v === 'yes' || v === 'complete' || v === 'completed' || v === 'done' || v === 'pass' || v === 'passed' || v === 'validated';
  }

  function completionKeys(eq, step) {
    var safeEq = clean(eq || getEq()) || 'NO_EQ';
    var s = clean(step);
    return [
      'nexus_' + safeEq + '_step_' + s,
      'nexus_' + safeEq + '_' + s + '_complete',
      'nexus_' + safeEq + '_' + s + '_completed',
      'nexus_' + safeEq + '_' + s + '_done',
      'nexus_' + safeEq + '_' + s + '_validated'
    ];
  }

  function isStepComplete(step, eq) {
    var safeEq = clean(eq || getEq());

    try {
      if (window.NEXUS_VANGUARD && typeof window.NEXUS_VANGUARD.isStepComplete === 'function') {
        if (window.NEXUS_VANGUARD.isStepComplete(step, safeEq)) return true;
      }
    } catch (err) {}

    try {
      if (window.NEXUS && typeof window.NEXUS.isStepComplete === 'function') {
        if (window.NEXUS.isStepComplete(step, safeEq)) return true;
      }
    } catch (err2) {}

    var keys = completionKeys(safeEq, step);
    for (var i = 0; i < keys.length; i += 1) {
      if (isTruthyStored(readText(keys[i], ''))) return true;
    }

    return false;
  }

  function normalizeStatus(value) {
    var s = upper(value);
    if (s === 'PASS' || s === 'PASSED' || s === 'GO' || s === 'COMPLETE' || s === 'COMPLETED' || s === 'YES' || s === 'Y') return 'PASS';
    if (s === 'FAIL' || s === 'FAILED' || s === 'NO' || s === 'N' || s === 'NG') return 'FAIL';
    if (s === 'REVIEW' || s === 'HOLD' || s === 'CHECK' || s === 'NA' || s === 'N/A') return 'REVIEW';
    return '';
  }

  function evidenceEngine() {
    return window.NEXUS_CCS_EVIDENCE_ENGINE || window.CCSEvidenceEngine || null;
  }

  function hasReference(step) {
    var ee = evidenceEngine();
    if (ee && typeof ee.hasReference === 'function' && ee.hasReference(step || {})) return true;

    var refs = Array.isArray(step && step.references) ? step.references : [];
    if (refs.some(function (ref) { return clean(ref && (ref.url || ref.name || ref.notes)); })) return true;
    return !!clean(step && (step.source || step.documentReference || step.reference));
  }

  function hasPhotoEvidence(step) {
    var ee = evidenceEngine();
    if (ee && typeof ee.hasPhoto === 'function' && ee.hasPhoto(step || {})) return true;

    if (!step) return false;
    if (step.photo || step.photoUrl || step.image || step.imageUrl || step.evidencePhoto) return true;
    if (step.evidence && (step.evidence.photo || step.evidence.photoUrl || step.evidence.image)) return true;
    var note = lower(step.note || step.notes || '');
    return note.indexOf('photo') !== -1 || note.indexOf('picture') !== -1 || note.indexOf('image') !== -1;
  }

  function parseRules(text, section, evidenceRequired) {
    var raw = upper([text, section, evidenceRequired].filter(Boolean).join(' '));
    var rules = [];

    function add(rule) {
      if (rules.indexOf(rule) === -1) rules.push(rule);
    }

    if (!raw) add(RULES.REQUIRED);

    if (raw.indexOf('REQUIRED') !== -1 || raw.indexOf('PASS OR REVIEW') !== -1 || raw.indexOf('ALL REQUIRED') !== -1 || raw.indexOf('STEP MUST') !== -1) add(RULES.REQUIRED);
    if (raw.indexOf('PHOTO') !== -1 || raw.indexOf('PICTURE') !== -1 || raw.indexOf('IMAGE') !== -1 || raw.indexOf('CAMERA') !== -1) add(RULES.PHOTO_REQUIRED);
    if (raw.indexOf('FOREMAN') !== -1 || raw.indexOf('APPROVAL') !== -1 || raw.indexOf('VERIFY') !== -1 || raw.indexOf('VERIFICATION') !== -1) add(RULES.FOREMAN_APPROVAL);
    if (raw.indexOf('TORQUE') !== -1) add(RULES.TORQUE_COMPLETE);
    if (raw.indexOf('MEG') !== -1 || raw.indexOf('MEGOHMMETER') !== -1 || raw.indexOf('LINE AND LOAD') !== -1 || raw.indexOf('LOAD MUST') !== -1) add(RULES.MEG_COMPLETE);
    if (raw.indexOf('L2') !== -1 || raw.indexOf('LEVEL 2') !== -1) add(RULES.L2_COMPLETE);
    if (raw.indexOf('PREFOD') !== -1 || raw.indexOf('PRE-FOD') !== -1 || raw.indexOf('FOD') !== -1 || raw.indexOf('FOREIGN OBJECT') !== -1 || raw.indexOf('DEBRIS') !== -1) add(RULES.PREFOD_COMPLETE);
    if (raw.indexOf('FPV') !== -1 || raw.indexOf('FINISHED PRODUCT') !== -1 || raw.indexOf('FINAL PHOTO') !== -1) add(RULES.FPV_COMPLETE);
    if (raw.indexOf('DOCUMENT') !== -1 || raw.indexOf('REFERENCE') !== -1 || raw.indexOf('SOURCE') !== -1 || raw.indexOf('DRAWING') !== -1 || raw.indexOf('SPEC') !== -1) add(RULES.DOCUMENT_REFERENCE_REQUIRED);

    if (!rules.length) add(RULES.REQUIRED);
    return rules;
  }

  function supervisorAccepted(step) {
    try {
      if (window.NEXUS_CCS_SUPERVISOR_REVIEW && typeof window.NEXUS_CCS_SUPERVISOR_REVIEW.isSupervisorAccepted === 'function') {
        return window.NEXUS_CCS_SUPERVISOR_REVIEW.isSupervisorAccepted(step || {});
      }
    } catch (err) {}
    var decision = upper(step && step.supervisorReview && step.supervisorReview.decision);
    return decision === 'APPROVED' || decision === 'OVERRIDE';
  }

  function evaluateStep(step, options) {
    options = options || {};
    step = step || {};

    var eq = clean(options.eq || getEq());
    var section = upper(step.section || step.group || step.category || 'GENERAL');
    var status = normalizeStatus(step.status || step.result || step.passFail || '');
    var required = step.required !== false;
    var rules = parseRules(step.validationRule || step.rule || '', section, step.evidenceRequired || step.evidence || '');
    var issues = [];
    var warnings = [];
    var passes = [];
    var acceptedBySupervisor = supervisorAccepted(step);

    if (acceptedBySupervisor) {
      return {
        status: 'PASS',
        fieldLabel: 'GOOD',
        tone: 'good',
        message: 'Supervisor reviewed and accepted this item with comment.',
        issues: [],
        warnings: [],
        passes: ['Supervisor decision: ' + upper(step.supervisorReview && step.supervisorReview.decision || 'APPROVED')],
        rules: rules,
        required: required,
        eq: eq,
        section: section,
        supervisorReview: step.supervisorReview || null,
        checkedAt: nowISO(),
        checkedBy: 'NEXUS_CCS_VANGUARD_RULES',
        confidence: 92
      };
    }

    if (!clean(step.title || step.task || step.description)) {
      issues.push('Name this checklist item.');
    }

    if (required && !status) {
      issues.push('Tap PASS, FAIL, or REVIEW.');
    }

    if (status === 'FAIL') {
      issues.push('This item is marked FAIL. Fix it or put it in REVIEW with notes.');
    }

    if ((status === 'FAIL' || status === 'REVIEW') && !clean(step.note || step.notes)) {
      warnings.push('Add a short note so the next person knows what happened.');
    }

    rules.forEach(function (rule) {
      var linkedStep = STEP_RULE_MAP[rule];

      if (rule === RULES.DOCUMENT_REFERENCE_REQUIRED && !hasReference(step)) {
        warnings.push('Add a source, drawing, spec, or reference link.');
      }

      if (rule === RULES.PHOTO_REQUIRED && status === 'PASS' && !hasPhotoEvidence(step) && section !== 'FPV') {
        warnings.push('Photo evidence is expected for this item.');
      }

      if (rule === RULES.FOREMAN_APPROVAL) {
        var role = lower(step.role || step.requiredRole || '');
        var updatedBy = clean(step.updatedBy || step.approvedBy || '');
        if (role.indexOf('foreman') !== -1 && status === 'PASS' && !updatedBy) {
          warnings.push('Foreman verification should be recorded.');
        }
      }

      if (linkedStep) {
        if (isStepComplete(linkedStep, eq)) {
          passes.push(linkedStep.toUpperCase() + ' complete.');
        } else if (status === 'PASS') {
          warnings.push(linkedStep.toUpperCase() + ' page is not showing complete yet.');
        }
      }
    });

    var finalStatus = 'PASS';
    var tone = 'good';
    var fieldLabel = 'GOOD';
    var message = 'Good. This item is ready.';

    if (issues.length) {
      finalStatus = 'BLOCKED';
      tone = 'stop';
      fieldLabel = 'STOP';
      message = issues[0];
    } else if (warnings.length || status === 'REVIEW') {
      finalStatus = 'REVIEW';
      tone = 'check';
      fieldLabel = 'CHECK';
      message = warnings[0] || 'Review item. Notes are okay if this is intentional.';
    }

    return {
      status: finalStatus,
      fieldLabel: fieldLabel,
      tone: tone,
      message: message,
      issues: issues,
      warnings: warnings,
      passes: passes,
      rules: rules,
      required: required,
      eq: eq,
      section: section,
      checkedAt: nowISO(),
      checkedBy: 'NEXUS_CCS_VANGUARD_RULES',
      confidence: finalStatus === 'PASS' ? 96 : finalStatus === 'REVIEW' ? 78 : 45
    };
  }

  function evaluateSteps(steps, options) {
    return (Array.isArray(steps) ? steps : []).map(function (step, index) {
      var result = evaluateStep(step, options || {});
      return {
        index: index,
        id: clean(step && step.id) || ('STEP-' + (index + 1)),
        title: clean(step && (step.title || step.task || step.description)),
        result: result
      };
    });
  }

  function summarize(steps, options) {
    var results = evaluateSteps(steps, options || {});
    var summary = {
      total: results.length,
      pass: 0,
      review: 0,
      blocked: 0,
      status: 'PASS',
      fieldLabel: 'GOOD',
      message: 'All checklist items look good.',
      results: results
    };

    results.forEach(function (item) {
      if (item.result.status === 'PASS') summary.pass += 1;
      else if (item.result.status === 'REVIEW') summary.review += 1;
      else summary.blocked += 1;
    });

    if (summary.blocked) {
      summary.status = 'BLOCKED';
      summary.fieldLabel = 'STOP';
      summary.message = summary.blocked + ' item(s) need fixed before final sign-off.';
    } else if (summary.review) {
      summary.status = 'REVIEW';
      summary.fieldLabel = 'CHECK';
      summary.message = summary.review + ' item(s) need review, notes, or linked evidence.';
    }

    return summary;
  }

  var api = {
    __installed: true,
    version: VERSION,
    RULES: RULES,
    parseRules: parseRules,
    evaluateStep: evaluateStep,
    evaluateSteps: evaluateSteps,
    summarize: summarize,
    isStepComplete: isStepComplete,
    normalizeStatus: normalizeStatus
  };

  window.NEXUS_CCS_VANGUARD_RULES = api;
  window.CCSVanguardRules = api;
  window.NEXUS = window.NEXUS || {};
  window.NEXUS.CCSVanguardRules = api;
})();
