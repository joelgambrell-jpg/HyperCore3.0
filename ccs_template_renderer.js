/*
  assets/js/ccs_template_renderer.js
  NEXUS CCS Template Renderer Helpers

  Purpose:
  - Shared rendering/helper utilities for imported CCS templates.
  - Keeps future CCS pages from duplicating status and summary logic.
  - Safe to load on pages that already have their own renderer.
*/

(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.NEXUS_CCS_TEMPLATE_RENDERER && window.NEXUS_CCS_TEMPLATE_RENDERER.__installed) return;

  var VERSION = '0.3.0-evidence-renderer';

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizeStatus(status) {
    var s = clean(status).toUpperCase();
    if (s === 'PASS' || s === 'COMPLETE' || s === 'COMPLETED') return 'PASS';
    if (s === 'FAIL' || s === 'FAILED') return 'FAIL';
    if (s === 'REVIEW' || s === 'HOLD' || s === 'N/A' || s === 'NA') return 'REVIEW';
    return 'MISSING';
  }


  function ruleEngine() {
    return window.NEXUS_CCS_VANGUARD_RULES || window.CCSVanguardRules || null;
  }

  function evaluateStep(step) {
    var engine = ruleEngine();
    if (engine && typeof engine.evaluateStep === 'function') {
      return engine.evaluateStep(step || {});
    }
    return {
      status: normalizeStatus(step && step.status) === 'MISSING' ? 'BLOCKED' : normalizeStatus(step && step.status),
      fieldLabel: normalizeStatus(step && step.status) === 'MISSING' ? 'STOP' : 'GOOD',
      tone: normalizeStatus(step && step.status) === 'MISSING' ? 'stop' : 'good',
      message: normalizeStatus(step && step.status) === 'MISSING' ? 'Tap PASS, FAIL, or REVIEW.' : 'Good. This item is ready.',
      issues: [],
      warnings: [],
      rules: []
    };
  }

  function summarize(steps) {
    var list = Array.isArray(steps) ? steps : [];
    var summary = {
      total: list.length,
      pass: 0,
      fail: 0,
      review: 0,
      missing: 0,
      blocked: 0,
      complete: false,
      percent: 0,
      issues: []
    };

    list.forEach(function (step, index) {
      var status = normalizeStatus(step && step.status);
      var ruleResult = evaluateStep(step || {});

      if (status === 'PASS') summary.pass += 1;
      else if (status === 'FAIL') summary.fail += 1;
      else if (status === 'REVIEW') summary.review += 1;
      else summary.missing += 1;

      if (ruleResult.status === 'BLOCKED') summary.blocked += 1;

      if (status === 'FAIL' || status === 'MISSING' || ruleResult.status === 'BLOCKED' || ruleResult.status === 'REVIEW') {
        summary.issues.push({
          row: index + 1,
          stepId: clean(step && step.id),
          title: clean(step && step.title),
          status: ruleResult.status || status,
          fieldLabel: ruleResult.fieldLabel || '',
          message: ruleResult.message || ''
        });
      }
    });

    summary.complete = summary.total > 0 && summary.missing === 0 && summary.fail === 0 && summary.blocked === 0;
    summary.percent = summary.total ? Math.round(((summary.pass + summary.review) / summary.total) * 100) : 0;
    return summary;
  }

  function statusBadge(status) {
    var s = normalizeStatus(status);
    return '<span class="badge ' + escapeHTML(s.toLowerCase()) + '">' + escapeHTML(s) + '</span>';
  }

  function renderSummaryHTML(steps) {
    var summary = summarize(steps);
    return ''
      + '<div class="ccs-template-summary" data-ccs-template-summary="true">'
      + '<strong>CCS Template Summary:</strong> '
      + escapeHTML(summary.percent + '%')
      + ' — PASS: ' + escapeHTML(summary.pass)
      + ' | REVIEW: ' + escapeHTML(summary.review)
      + ' | FAIL: ' + escapeHTML(summary.fail)
      + ' | MISSING: ' + escapeHTML(summary.missing)
      + '</div>';
  }

  function toVanguardItems(steps) {
    return (Array.isArray(steps) ? steps : []).map(function (step, index) {
      var ruleResult = evaluateStep(step || {});
      var actual = normalizeStatus(step.status);
      return {
        id: clean(step.id || ('CCS-' + String(index + 1).padStart(3, '0'))),
        title: clean(step.title || step.task || ('CCS Step ' + (index + 1))),
        section: clean(step.section || 'GENERAL').toUpperCase(),
        required: step.required !== false,
        status: ruleResult.status === 'BLOCKED' ? 'BLOCKED' : (actual === 'MISSING' ? 'PENDING' : actual),
        linkedStep: clean(step.linkedStep || ''),
        linkedPage: '',
        validation: {
          source: clean(step.source || 'CCS Excel Import'),
          requiredStatus: clean(step.validationRule || 'PASS_OR_REVIEW'),
          actualStatus: actual,
          result: ruleResult.status,
          confidence: ruleResult.confidence || 85,
          message: ruleResult.message || (step.aiCheck && step.aiCheck.message ? step.aiCheck.message : ''),
          fieldLabel: ruleResult.fieldLabel || '',
          rules: ruleResult.rules || [],
          issues: ruleResult.issues || [],
          warnings: ruleResult.warnings || []
        },
        documentReferences: Array.isArray(step.references) ? step.references : [],
        evidence: {
          role: clean(step.role || ''),
          evidenceRequired: clean(step.evidenceRequired || ''),
          validationRule: clean(step.validationRule || ''),
          note: clean(step.note || ''),
          records: Array.isArray(step.evidenceRecords) ? step.evidenceRecords : [],
          supervisorReview: step.supervisorReview || null
        }
      };
    });
  }

  var api = {
    __installed: true,
    version: VERSION,
    escapeHTML: escapeHTML,
    normalizeStatus: normalizeStatus,
    summarize: summarize,
    statusBadge: statusBadge,
    renderSummaryHTML: renderSummaryHTML,
    evaluateStep: evaluateStep,
    toVanguardItems: toVanguardItems
  };

  window.NEXUS_CCS_TEMPLATE_RENDERER = api;
  window.CCSTemplateRenderer = api;
  window.NEXUS = window.NEXUS || {};
  window.NEXUS.CCSTemplateRenderer = api;
})();
