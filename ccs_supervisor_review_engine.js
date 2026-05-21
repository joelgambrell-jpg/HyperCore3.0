/*
  assets/js/ccs_supervisor_review_engine.js
  NEXUS CCS Supervisor Review Engine

  Purpose:
  - Adds a simple, field-friendly "Why?" drawer for imported CCS rows.
  - Allows foreman/superintendent/admin review actions without replacing existing CCS logic.
  - Supports approve with comment, send back, and manager override with audit history.
*/

(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.NEXUS_CCS_SUPERVISOR_REVIEW && window.NEXUS_CCS_SUPERVISOR_REVIEW.__installed) return;

  var VERSION = '0.2.0-evidence-aware-review';

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

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function currentRole() {
    try {
      if (window.NEXUS && typeof window.NEXUS.getRole === 'function') {
        return lower(window.NEXUS.getRole() || 'field');
      }
    } catch (err) {}

    try {
      if (window.NEXUS_VANGUARD && typeof window.NEXUS_VANGUARD.getRole === 'function') {
        return lower(window.NEXUS_VANGUARD.getRole() || 'field');
      }
    } catch (err2) {}

    try {
      return lower(localStorage.getItem('nexus_role') || 'field');
    } catch (err3) {}

    return 'field';
  }

  function roleRank(role) {
    var r = lower(role);
    if (r === 'admin') return 5;
    if (r === 'superintendent') return 4;
    if (r === 'foreman') return 3;
    if (r === 'qcx' || r === 'qc') return 2;
    if (r === 'tech' || r === 'field') return 1;
    return 0;
  }

  function canReview() {
    return roleRank(currentRole()) >= 3;
  }

  function canOverride() {
    return roleRank(currentRole()) >= 4;
  }

  function injectStyles() {
    if (document.getElementById('ccs-supervisor-review-style')) return;

    var style = document.createElement('style');
    style.id = 'ccs-supervisor-review-style';
    style.textContent = ''
      + '.ccs-why-drawer{margin-top:12px;border-radius:16px;border:1px solid rgba(255,255,255,.16);background:rgba(15,23,42,.88);color:#fff;overflow:hidden}'
      + '.ccs-why-drawer summary{cursor:pointer;padding:14px 16px;font-weight:1000;font-size:16px;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:10px}'
      + '.ccs-why-drawer summary::-webkit-details-marker{display:none}'
      + '.ccs-why-body{padding:0 16px 16px;display:grid;gap:12px}'
      + '.ccs-why-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}'
      + '.ccs-why-card{border-radius:14px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);padding:12px}'
      + '.ccs-why-label{font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.06em;opacity:.75;margin-bottom:5px}'
      + '.ccs-why-value{font-size:13px;font-weight:800;line-height:1.35}'
      + '.ccs-why-list{margin:0;padding-left:18px;font-size:13px;font-weight:800;line-height:1.45}'
      + '.ccs-supervisor-comment{width:100%;min-height:84px;border-radius:14px;border:2px solid rgba(255,255,255,.18);background:#0b1220;color:#fff;padding:12px;font-size:15px;font-weight:800}'
      + '.ccs-review-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}'
      + '.ccs-review-btn{min-height:54px;border:0;border-radius:14px;color:#fff;font-size:14px;font-weight:1000;cursor:pointer;padding:10px}'
      + '.ccs-review-btn.approve{background:#16a34a}'
      + '.ccs-review-btn.sendback{background:#f59e0b;color:#111827}'
      + '.ccs-review-btn.override{background:#9333ea}'
      + '.ccs-review-btn:disabled{opacity:.45;filter:grayscale(.5);cursor:not-allowed}'
      + '.ccs-review-history{display:grid;gap:8px}'
      + '.ccs-review-history-item{border-radius:12px;background:rgba(255,255,255,.07);padding:9px;font-size:12px;font-weight:800}'
      + '.ccs-review-pill{display:inline-flex;align-items:center;border-radius:999px;padding:5px 8px;background:rgba(255,255,255,.14);font-size:11px;font-weight:1000;margin-left:8px}'
      + '@media(max-width:760px){.ccs-why-grid,.ccs-review-actions{grid-template-columns:1fr}.ccs-why-drawer summary{font-size:15px}.ccs-review-btn{min-height:60px;font-size:15px}}';

    document.head.appendChild(style);
  }

  function normalizeResult(step, result) {
    if (result && typeof result === 'object') return result;
    try {
      if (window.NEXUS_CCS_VANGUARD_RULES && typeof window.NEXUS_CCS_VANGUARD_RULES.evaluateStep === 'function') {
        return window.NEXUS_CCS_VANGUARD_RULES.evaluateStep(step || {});
      }
    } catch (err) {}
    return {
      status: 'REVIEW',
      fieldLabel: 'CHECK',
      message: 'Review this checklist item.',
      rules: [],
      issues: [],
      warnings: [],
      passes: []
    };
  }

  function buildExplanation(step, result) {
    step = step || {};
    result = normalizeResult(step, result);

    var issues = Array.isArray(result.issues) ? result.issues.slice() : [];
    var warnings = Array.isArray(result.warnings) ? result.warnings.slice() : [];
    var passes = Array.isArray(result.passes) ? result.passes.slice() : [];
    var rules = Array.isArray(result.rules) ? result.rules.slice() : [];
    var refs = Array.isArray(step.references) ? step.references : [];
    var evidenceRecords = Array.isArray(step.evidenceRecords) ? step.evidenceRecords : [];

    var why = [];
    if (result.status === 'PASS') why.push('The required rule checks are satisfied or an approved supervisor decision exists.');
    if (result.status === 'REVIEW') why.push('The item can continue, but a supervisor should verify the missing detail or note.');
    if (result.status === 'BLOCKED' || result.status === 'FAIL') why.push('The item is missing required information or failed a required check.');

    if (!clean(step.status)) why.push('The field status has not been selected yet.');
    if (upper(step.status) === 'FAIL') why.push('The field status is marked FAIL.');

    var fix = [];
    if (!clean(step.status)) fix.push('Tap PASS, FAIL, or REVIEW.');
    if (issues.length) fix = fix.concat(issues);
    if (warnings.length) fix = fix.concat(warnings);
    if (!clean(step.note || step.notes) && (upper(step.status) === 'FAIL' || upper(step.status) === 'REVIEW')) fix.push('Add a short note explaining the condition.');
    if (!fix.length) fix.push('No correction required. Supervisor may still add an approval comment if needed.');

    return {
      status: result.status || 'REVIEW',
      fieldLabel: result.fieldLabel || 'CHECK',
      message: result.message || 'Review this checklist item.',
      rules: rules,
      why: why,
      fix: unique(fix),
      evidence: {
        source: clean(step.source || 'None recorded'),
        references: refs,
        referenceCount: refs.length,
        evidenceRecords: evidenceRecords,
        evidenceRecordCount: evidenceRecords.length,
        evidenceRequired: clean(step.evidenceRequired || 'None specified'),
        note: clean(step.note || step.notes || ''),
        role: clean(step.role || '')
      },
      issues: issues,
      warnings: warnings,
      passes: passes
    };
  }

  function unique(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (item) {
      var text = clean(item);
      if (text && out.indexOf(text) === -1) out.push(text);
    });
    return out;
  }

  function listHTML(items, emptyText) {
    var list = unique(items);
    if (!list.length) return '<div class="ccs-why-value">' + escapeHTML(emptyText || 'None') + '</div>';
    return '<ul class="ccs-why-list">' + list.map(function (item) {
      return '<li>' + escapeHTML(item) + '</li>';
    }).join('') + '</ul>';
  }

  function historyHTML(step) {
    var history = Array.isArray(step && step.supervisorHistory) ? step.supervisorHistory : [];
    if (!history.length) return '<div class="ccs-why-value">No supervisor actions recorded.</div>';
    return '<div class="ccs-review-history">' + history.slice().reverse().map(function (item) {
      return ''
        + '<div class="ccs-review-history-item">'
        + '<b>' + escapeHTML(upper(item.action || 'ACTION')) + '</b>'
        + ' by ' + escapeHTML(item.by || '')
        + ' at ' + escapeHTML(item.at || '')
        + (item.comment ? '<br>' + escapeHTML(item.comment) : '')
        + '</div>';
    }).join('') + '</div>';
  }

  function renderDrawer(step, index, result) {
    injectStyles();
    step = step || {};
    var explanation = buildExplanation(step, result);
    var idx = Number(index) || 0;
    var reviewAllowed = canReview();
    var overrideAllowed = canOverride();
    var refs = explanation.evidence.references || [];
    var referenceText = refs.length
      ? refs.map(function (ref) { return clean((ref.name || 'Reference') + (ref.url ? ' — ' + ref.url : '')); }).join('\n')
      : 'No reference attached.';

    return ''
      + '<details class="ccs-why-drawer">'
      + '<summary>Why? / Supervisor Review <span class="ccs-review-pill">' + escapeHTML(explanation.fieldLabel) + '</span></summary>'
      + '<div class="ccs-why-body">'
      + '<div class="ccs-why-grid">'
      + '<div class="ccs-why-card"><div class="ccs-why-label">Plain-English Result</div><div class="ccs-why-value">' + escapeHTML(explanation.message) + '</div></div>'
      + '<div class="ccs-why-card"><div class="ccs-why-label">Rules Checked</div><div class="ccs-why-value">' + escapeHTML(explanation.rules.length ? explanation.rules.join(', ') : 'REQUIRED') + '</div></div>'
      + '<div class="ccs-why-card"><div class="ccs-why-label">Why This Status?</div>' + listHTML(explanation.why, 'No issues detected.') + '</div>'
      + '<div class="ccs-why-card"><div class="ccs-why-label">What To Do</div>' + listHTML(explanation.fix, 'No action required.') + '</div>'
      + '<div class="ccs-why-card"><div class="ccs-why-label">Evidence Found</div><div class="ccs-why-value">Source: ' + escapeHTML(explanation.evidence.source) + '<br>References: ' + escapeHTML(String(explanation.evidence.referenceCount)) + '<br>Attached Evidence: ' + escapeHTML(String(explanation.evidence.evidenceRecordCount || 0)) + '<br>Required Evidence: ' + escapeHTML(explanation.evidence.evidenceRequired || 'None specified') + '<br>Note: ' + escapeHTML(explanation.evidence.note || 'None') + '</div></div>'
      + '<div class="ccs-why-card"><div class="ccs-why-label">Reference Detail</div><div class="ccs-why-value" style="white-space:pre-wrap;">' + escapeHTML(referenceText) + '</div></div>'
      + '</div>'
      + '<div class="ccs-why-card"><div class="ccs-why-label">Supervisor Comment</div><textarea class="ccs-supervisor-comment" id="ccs_supervisor_comment_' + idx + '" placeholder="Required for send back or override. Example: Approved per field condition after review with foreman."></textarea></div>'
      + '<div class="ccs-review-actions">'
      + '<button class="ccs-review-btn approve" type="button" data-ccs-supervisor-action="approve" data-idx="' + idx + '"' + (reviewAllowed ? '' : ' disabled') + '>Approve with Comment</button>'
      + '<button class="ccs-review-btn sendback" type="button" data-ccs-supervisor-action="sendback" data-idx="' + idx + '"' + (reviewAllowed ? '' : ' disabled') + '>Send Back / Fix</button>'
      + '<button class="ccs-review-btn override" type="button" data-ccs-supervisor-action="override" data-idx="' + idx + '"' + (overrideAllowed ? '' : ' disabled') + '>Override</button>'
      + '</div>'
      + '<div class="ccs-why-card"><div class="ccs-why-label">Review History</div>' + historyHTML(step) + '</div>'
      + '</div>'
      + '</details>';
  }

  function applyAction(step, action, comment, meta) {
    step = step || {};
    action = lower(action);
    comment = clean(comment);
    meta = meta || {};

    var role = clean(meta.role || currentRole());
    var at = nowISO();

    if ((action === 'approve' || action === 'sendback') && roleRank(role) < 3) {
      throw new Error('Foreman or higher is required for this action.');
    }

    if (action === 'override' && roleRank(role) < 4) {
      throw new Error('Superintendent or admin is required to override.');
    }

    if ((action === 'sendback' || action === 'override') && !comment) {
      throw new Error('Comment is required for this action.');
    }

    var decision = action === 'approve'
      ? 'APPROVED'
      : action === 'override'
        ? 'OVERRIDE'
        : 'NEEDS_CORRECTION';

    step.supervisorReview = {
      decision: decision,
      comment: comment,
      by: role,
      at: at,
      action: action
    };

    step.supervisorHistory = Array.isArray(step.supervisorHistory) ? step.supervisorHistory : [];
    step.supervisorHistory.push({
      action: decision,
      comment: comment,
      by: role,
      at: at,
      previousStatus: clean(step.status || ''),
      validationRule: clean(step.validationRule || '')
    });

    if (action === 'sendback') {
      step.status = 'REVIEW';
      step.note = comment;
    }

    if (action === 'override') {
      step.status = 'REVIEW';
      step.note = comment;
      step.supervisorOverride = {
        active: true,
        reason: comment,
        by: role,
        at: at
      };
    }

    if (action === 'approve' && !clean(step.status)) {
      step.status = 'REVIEW';
    }

    step.updatedAt = at;
    step.updatedBy = role;

    return step;
  }

  function isSupervisorAccepted(step) {
    var decision = upper(step && step.supervisorReview && step.supervisorReview.decision);
    return decision === 'APPROVED' || decision === 'OVERRIDE';
  }

  var api = {
    __installed: true,
    version: VERSION,
    currentRole: currentRole,
    canReview: canReview,
    canOverride: canOverride,
    buildExplanation: buildExplanation,
    renderDrawer: renderDrawer,
    applyAction: applyAction,
    isSupervisorAccepted: isSupervisorAccepted
  };

  window.NEXUS_CCS_SUPERVISOR_REVIEW = api;
  window.CCSSupervisorReview = api;
  window.NEXUS = window.NEXUS || {};
  window.NEXUS.CCSSupervisorReview = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectStyles);
  } else {
    injectStyles();
  }
})();
