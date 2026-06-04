/*
  assets/js/ccs_vanguard_rule_engine.js
  NEXUS CCS Vanguard Rule Engine

  Purpose:
  - Converts imported Excel CCS Validation Rule values into simple field states.
  - Additive only. Does not replace existing CCS page logic.
  - Uses existing NEXUS/localStorage completion keys where possible.
  - Front-end hardened: N/A, FAIL, missing references, linked workflow gates, and Vanguard hard gates are enforced before final sign-off.

  Field states:
  PASS    = GOOD
  REVIEW  = CHECK
  BLOCKED = STOP
*/

(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.NEXUS_CCS_VANGUARD_RULES && window.NEXUS_CCS_VANGUARD_RULES.__installed) return;

  var VERSION = '0.5.0-workflow-gatekeeper';

  var RULES = {
    REQUIRED: 'REQUIRED',
    PHOTO_REQUIRED: 'PHOTO_REQUIRED',
    FOREMAN_APPROVAL: 'FOREMAN_APPROVAL',
    RIF_COMPLETE: 'RIF_COMPLETE',
    PHENOLIC_COMPLETE: 'PHENOLIC_COMPLETE',
    TORQUE_COMPLETE: 'TORQUE_COMPLETE',
    MEG_COMPLETE: 'MEG_COMPLETE',
    L2_COMPLETE: 'L2_COMPLETE',
    PREFOD_COMPLETE: 'PREFOD_COMPLETE',
    FPV_COMPLETE: 'FPV_COMPLETE',
    PACKAGE_READY: 'PACKAGE_READY',
    DOCUMENT_REFERENCE_REQUIRED: 'DOCUMENT_REFERENCE_REQUIRED'
  };

  var STEP_RULE_MAP = {
    RIF_COMPLETE: 'rif',
    PHENOLIC_COMPLETE: 'phenolic',
    TORQUE_COMPLETE: 'torque',
    MEG_COMPLETE: 'meg',
    L2_COMPLETE: 'l2',
    PREFOD_COMPLETE: 'prefod',
    FPV_COMPLETE: 'fpv',
    PACKAGE_READY: 'package_readiness'
  };

  var STEP_ALIASES = {
    rif: ['rif', 'receipt', 'receipt_inspection', 'receiptInspection'],
    phenolic: ['phenolic', 'phenolic_display', 'phenolicDisplay', 'labels', 'labeling'],
    torque: ['torque', 'torque_log', 'torqueLog', 'torque_application'],
    l2: ['l2', 'l2_verification', 'l2Verification', 'level2', 'level_2'],
    meg: ['meg', 'meg_log', 'megLog', 'megohmmeter', 'megohmmeter_line', 'megohmmeter_load'],
    prefod: ['prefod', 'pre_fod', 'pre-fod', 'preFod', 'fod'],
    fpv: ['fpv', 'fpv_photo', 'fpvPhoto', 'finished_product', 'finishedProduct'],
    package_readiness: ['package_readiness', 'packageReadiness', 'package_ready', 'ready', 'energization']
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

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function isTruthyStored(value) {
    var v = lower(value);
    return v === '1' || v === 'true' || v === 'yes' || v === 'complete' || v === 'completed' || v === 'done' || v === 'pass' || v === 'passed' || v === 'validated' || v === 'ready';
  }

  function aliasesForStep(step) {
    var s = clean(step);
    return STEP_ALIASES[s] ? STEP_ALIASES[s].slice() : [s];
  }

  function completionKeys(eq, step) {
    var safeEq = clean(eq || getEq()) || 'NO_EQ';
    var aliases = aliasesForStep(step);
    var keys = [];

    aliases.forEach(function (alias) {
      var s = clean(alias);
      keys = keys.concat([
        'nexus_' + safeEq + '_step_' + s,
        'nexus_' + safeEq + '_' + s + '_complete',
        'nexus_' + safeEq + '_' + s + '_completed',
        'nexus_' + safeEq + '_' + s + '_done',
        'nexus_' + safeEq + '_' + s + '_validated',
        'nexus_' + safeEq + '_' + s + '_signed_off',
        'nexus_' + safeEq + '_' + s + '_status'
      ]);
    });

    return keys;
  }

  function isPackageReady(eq) {
    var safeEq = clean(eq || getEq()) || 'NO_EQ';
    var readiness = readJSON('nexus_' + safeEq + '_package_readiness', null);
    if (readiness && upper(readiness.status) === 'READY' && !Number(readiness.blockedCount || 0)) return true;
    if (isTruthyStored(readText('nexus_' + safeEq + '_package_ready', ''))) return true;
    if (isTruthyStored(readText('nexus_' + safeEq + '_step_energization', ''))) return true;
    return false;
  }

  function isMegComplete(eq) {
    var safeEq = clean(eq || getEq()) || 'NO_EQ';
    if (isTruthyStored(readText('nexus_' + safeEq + '_step_meg', ''))) return true;
    if (isTruthyStored(readText('nexus_' + safeEq + '_meg_complete', ''))) return true;
    if (
      isTruthyStored(readText('nexus_' + safeEq + '_step_megohmmeter_line', '')) &&
      isTruthyStored(readText('nexus_' + safeEq + '_step_megohmmeter_load', ''))
    ) return true;
    return false;
  }

  function isStepComplete(step, eq) {
    var safeEq = clean(eq || getEq());
    var s = clean(step);

    if (s === 'package_readiness') return isPackageReady(safeEq);
    if (s === 'meg') return isMegComplete(safeEq);

    try {
      if (window.NEXUS_VANGUARD && typeof window.NEXUS_VANGUARD.isStepComplete === 'function') {
        if (window.NEXUS_VANGUARD.isStepComplete(s, safeEq)) return true;
      }
    } catch (err) {}

    try {
      if (window.NEXUS && typeof window.NEXUS.isStepComplete === 'function') {
        if (window.NEXUS.isStepComplete(s, safeEq)) return true;
      }
    } catch (err2) {}

    try {
      if (window.NEXUS_WORKFLOW && typeof window.NEXUS_WORKFLOW.isStepComplete === 'function') {
        if (window.NEXUS_WORKFLOW.isStepComplete(safeEq, s)) return true;
      }
    } catch (err3) {}

    var keys = completionKeys(safeEq, s);
    for (var i = 0; i < keys.length; i += 1) {
      if (isTruthyStored(readText(keys[i], ''))) return true;
    }

    return false;
  }

  function normalizeStatus(value) {
    var s = upper(value);
    if (s === 'PASS' || s === 'PASSED' || s === 'GO' || s === 'COMPLETE' || s === 'COMPLETED' || s === 'YES' || s === 'Y') return 'PASS';
    if (s === 'FAIL' || s === 'FAILED' || s === 'NO' || s === 'N' || s === 'NG') return 'FAIL';
    if (s === 'NA' || s === 'N/A' || s === 'NOT APPLICABLE' || s === 'NOT-APPLICABLE') return 'NA';
    if (s === 'REVIEW' || s === 'HOLD' || s === 'CHECK') return 'REVIEW';
    return '';
  }

  function evidenceEngine() {
    return window.NEXUS_CCS_EVIDENCE_ENGINE || window.CCSEvidenceEngine || null;
  }

  function hasReference(step) {
    var ee = evidenceEngine();
    if (ee && typeof ee.hasReference === 'function' && ee.hasReference(step || {})) return true;

    var refs = Array.isArray(step && step.references) ? step.references : [];
    if (refs.some(function (ref) { return clean(ref && (ref.url || ref.name || ref.notes || ref.page || ref.section)); })) return true;
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
    if (raw.indexOf('RIF') !== -1 || raw.indexOf('RECEIPT') !== -1 || raw.indexOf('RECEIV') !== -1) add(RULES.RIF_COMPLETE);
    if (raw.indexOf('PHENOLIC') !== -1 || raw.indexOf('LABEL') !== -1 || raw.indexOf('LABELING') !== -1) add(RULES.PHENOLIC_COMPLETE);
    if (raw.indexOf('TORQUE') !== -1 || raw.indexOf('CONNECTION') !== -1 || raw.indexOf('LUG') !== -1 || raw.indexOf('BOLT') !== -1) add(RULES.TORQUE_COMPLETE);
    if (raw.indexOf('MEG') !== -1 || raw.indexOf('MEGOHMMETER') !== -1 || raw.indexOf('LINE AND LOAD') !== -1 || raw.indexOf('LOAD MUST') !== -1 || raw.indexOf('INSULATION') !== -1) add(RULES.MEG_COMPLETE);
    if (raw.indexOf('L2') !== -1 || raw.indexOf('LEVEL 2') !== -1 || raw.indexOf('INSTALLATION VERIFICATION') !== -1) add(RULES.L2_COMPLETE);
    if (raw.indexOf('PREFOD') !== -1 || raw.indexOf('PRE-FOD') !== -1 || raw.indexOf('FOD') !== -1 || raw.indexOf('FOREIGN OBJECT') !== -1 || raw.indexOf('DEBRIS') !== -1) add(RULES.PREFOD_COMPLETE);
    if (raw.indexOf('FPV') !== -1 || raw.indexOf('FINISHED PRODUCT') !== -1 || raw.indexOf('FINAL PHOTO') !== -1) add(RULES.FPV_COMPLETE);
    if (raw.indexOf('PACKAGE READINESS') !== -1 || raw.indexOf('ENERGIZATION') !== -1 || raw.indexOf('READY FOR ENERGIZATION') !== -1) add(RULES.PACKAGE_READY);
    if (raw.indexOf('DOCUMENT') !== -1 || raw.indexOf('REFERENCE') !== -1 || raw.indexOf('SOURCE') !== -1 || raw.indexOf('DRAWING') !== -1 || raw.indexOf('SPEC') !== -1 || raw.indexOf('SUBMITTAL') !== -1) add(RULES.DOCUMENT_REFERENCE_REQUIRED);

    if (!rules.length) add(RULES.REQUIRED);
    return rules;
  }

  function supervisorDecision(step) {
    return upper(step && step.supervisorReview && step.supervisorReview.decision);
  }

  function supervisorAccepted(step) {
    try {
      if (window.NEXUS_CCS_SUPERVISOR_REVIEW && typeof window.NEXUS_CCS_SUPERVISOR_REVIEW.isSupervisorAccepted === 'function') {
        return window.NEXUS_CCS_SUPERVISOR_REVIEW.isSupervisorAccepted(step || {});
      }
    } catch (err) {}
    var decision = supervisorDecision(step);
    return decision === 'APPROVED' || decision === 'OVERRIDE';
  }

  function supervisorOverride(step) {
    var decision = supervisorDecision(step);
    return decision === 'OVERRIDE' || !!(step && step.supervisorOverride && step.supervisorOverride.active);
  }

  function hardGateEvaluate(step, options) {
    try {
      if (window.NEXUS_VANGUARD_HARD_GATES && typeof window.NEXUS_VANGUARD_HARD_GATES.validateStep === 'function') {
        return window.NEXUS_VANGUARD_HARD_GATES.validateStep(step || {}, options || {});
      }
    } catch (err) {}
    return null;
  }

  function linkedStepLabel(linkedStep) {
    var labels = {
      rif: 'Receipt Inspection',
      phenolic: 'Phenolic Display',
      torque: 'Torque',
      l2: 'L2 Verification',
      meg: 'Megohmmeter Testing',
      prefod: 'Pre-FOD',
      fpv: 'Finished Product Verification',
      package_readiness: 'Package Readiness'
    };
    return labels[linkedStep] || clean(linkedStep).toUpperCase();
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
    var overrideBySupervisor = supervisorOverride(step);
    var hardGate = hardGateEvaluate(step, { requireNaApproval:false, requireLocator:false });

    if (!clean(step.title || step.task || step.description)) {
      issues.push('Name this checklist item.');
    }

    if (required && !status) {
      issues.push('Tap PASS, FAIL, REVIEW, or N/A.');
    }

    if (status === 'FAIL') {
      issues.push('This item is marked FAIL. Fix it or use authorized superintendent/admin override.');
    }

    if (status === 'NA') {
      if (!clean(step.note || step.notes || step.reason || (step.supervisorReview && step.supervisorReview.comment))) {
        issues.push('N/A requires a reason before final sign-off.');
      }
      if (!hasReference(step)) {
        issues.push('N/A requires a source/reference showing why it does not apply.');
      }
    }

    if ((status === 'FAIL' || status === 'REVIEW') && !clean(step.note || step.notes)) {
      warnings.push('Add a short note so the next person knows what happened.');
    }

    rules.forEach(function (rule) {
      var linkedStep = STEP_RULE_MAP[rule];

      if (rule === RULES.DOCUMENT_REFERENCE_REQUIRED && !hasReference(step)) {
        if (status === 'PASS' || status === 'NA') issues.push('Add a source, drawing, spec, or reference link.');
        else warnings.push('Add a source, drawing, spec, or reference link.');
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
          passes.push(linkedStepLabel(linkedStep) + ' complete.');
        } else if (status === 'PASS') {
          issues.push(linkedStepLabel(linkedStep) + ' is not showing complete yet. Complete that workflow before this CCS item can pass.');
        } else {
          warnings.push(linkedStepLabel(linkedStep) + ' is not showing complete yet.');
        }
      }
    });

    if (hardGate) {
      if (hardGate.status === 'BLOCKED') {
        issues = issues.concat(Array.isArray(hardGate.issues) && hardGate.issues.length ? hardGate.issues : [hardGate.message || 'Vanguard hard gate blocked this item.']);
      } else if (hardGate.status === 'REVIEW') {
        warnings = warnings.concat(Array.isArray(hardGate.warnings) && hardGate.warnings.length ? hardGate.warnings : [hardGate.message || 'Vanguard hard gate requires review.']);
      } else if (hardGate.status === 'PASS') {
        passes.push('Vanguard hard gate passed.');
      }
    }

    if (issues.length && overrideBySupervisor) {
      warnings.push('Hard failure cleared by superintendent/admin override.');
      passes.push('Supervisor override: OVERRIDE');
      issues = [];
    } else if (!issues.length && acceptedBySupervisor) {
      passes.push('Supervisor decision: ' + (supervisorDecision(step) || 'APPROVED'));
    }

    var finalStatus = 'PASS';
    var tone = 'good';
    var fieldLabel = 'GOOD';
    var message = 'Good. This item is ready.';

    if (issues.length) {
      finalStatus = 'BLOCKED';
      tone = 'stop';
      fieldLabel = 'STOP';
      message = issues[0];
    } else if (warnings.length || status === 'REVIEW' || status === 'NA') {
      finalStatus = 'REVIEW';
      tone = 'check';
      fieldLabel = 'CHECK';
      message = warnings[0] || (status === 'NA' ? 'N/A recorded. Confirm reason/reference before final release.' : 'Review item. Notes are okay if this is intentional.');
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
      supervisorReview: step.supervisorReview || null,
      hardGate: hardGate || null,
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
    STEP_RULE_MAP: STEP_RULE_MAP,
    STEP_ALIASES: STEP_ALIASES,
    parseRules: parseRules,
    evaluateStep: evaluateStep,
    evaluateSteps: evaluateSteps,
    summarize: summarize,
    isStepComplete: isStepComplete,
    normalizeStatus: normalizeStatus,
    completionKeys: completionKeys
  };

  window.NEXUS_CCS_VANGUARD_RULES = api;
  window.CCSVanguardRules = api;
  window.NEXUS = window.NEXUS || {};
  window.NEXUS.CCSVanguardRules = api;
})();
