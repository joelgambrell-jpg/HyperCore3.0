/*
  assets/js/ccs_approval_engine.js
  NEXUS CCS Review / Approval Engine

  Purpose:
  - Adds a safe review/approval layer for imported CCS templates.
  - Keeps legacy CCS behavior intact.
  - Stores template lifecycle status per equipment.
  - Mirrors approval metadata into the CCS export payload for package export.
  - Works with localStorage first and automatically piggybacks on CCSFirebaseSync when present.

  Lifecycle:
  DRAFT -> IMPORTED -> REVIEW_REQUIRED -> APPROVED -> ACTIVE -> LOCKED
*/

(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.NEXUS_CCS_APPROVAL && window.NEXUS_CCS_APPROVAL.__installed) return;

  var VERSION = '0.1.0-approval-engine';
  var STATUSES = {
    DRAFT: 'DRAFT',
    IMPORTED: 'IMPORTED',
    REVIEW_REQUIRED: 'REVIEW_REQUIRED',
    APPROVED: 'APPROVED',
    ACTIVE: 'ACTIVE',
    LOCKED: 'LOCKED'
  };

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function upper(value) {
    return clean(value).toUpperCase();
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function safeEq(eq) {
    var value = clean(eq || getEq() || 'NO_EQ');
    return value.replace(/[.#$\[\]\/]/g, '_') || 'NO_EQ';
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

    return clean(
      readText('nexus_active_eq', '') ||
      readText('nexus_active_equipment', '') ||
      readText('nexus_current_eq', '') ||
      readText('eq', '')
    );
  }

  function getRole() {
    try {
      if (window.NEXUS && typeof window.NEXUS.getRole === 'function') {
        return clean(window.NEXUS.getRole()).toLowerCase() || 'viewer';
      }
    } catch (err) {}

    try {
      if (window.NEXUS_VANGUARD && typeof window.NEXUS_VANGUARD.getRole === 'function') {
        return clean(window.NEXUS_VANGUARD.getRole()).toLowerCase() || 'viewer';
      }
    } catch (err2) {}

    try {
      var selector = document.getElementById('nxRoleSelect');
      if (selector && selector.value) return clean(selector.value).toLowerCase();
    } catch (err3) {}

    return clean(readText('nexus_role', 'viewer')).toLowerCase() || 'viewer';
  }

  function roleRank(role) {
    var map = {
      viewer: 0,
      tech: 1,
      qcx: 2,
      foreman: 3,
      superintendent: 4,
      admin: 5
    };
    return map[clean(role).toLowerCase()] || 0;
  }

  function roleAtLeast(required) {
    return roleRank(getRole()) >= roleRank(required);
  }

  function readText(key, fallback) {
    try {
      var value = localStorage.getItem(key);
      return value == null ? (fallback || '') : value;
    } catch (err) {
      return fallback || '';
    }
  }

  function writeText(key, value) {
    try {
      localStorage.setItem(key, String(value == null ? '' : value));
      return true;
    } catch (err) {
      return false;
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

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }

  function keys(eq) {
    var id = safeEq(eq);
    return {
      ccs: 'nexus_' + id + '_ccs_two_tab_v1',
      approval: 'nexus_' + id + '_ccs_approval_v1',
      exportPayload: 'nexus_' + id + '_ccs_vanguard_export',
      packageStatus: 'nexus_' + id + '_packageStatus_ccs',
      signed: 'nexus_' + id + '_ccs_signed_off',
      step: 'nexus_' + id + '_step_ccs'
    };
  }

  function emptyApproval(eq) {
    return {
      eq: safeEq(eq),
      status: STATUSES.DRAFT,
      previousStatus: '',
      importedAt: '',
      importedBy: '',
      reviewRequestedAt: '',
      reviewRequestedBy: '',
      approvedAt: '',
      approvedBy: '',
      activatedAt: '',
      activatedBy: '',
      lockedAt: '',
      lockedBy: '',
      reason: '',
      notes: '',
      history: [],
      version: VERSION,
      updatedAt: nowISO()
    };
  }

  function loadCcsState(eq) {
    return readJSON(keys(eq).ccs, null);
  }

  function hasImportedTemplate(eq) {
    var ccs = loadCcsState(eq);
    return !!(ccs && Array.isArray(ccs.steps) && ccs.steps.length);
  }

  function loadApproval(eq) {
    var id = safeEq(eq);
    var saved = readJSON(keys(id).approval, null);
    var base = emptyApproval(id);
    var approval = Object.assign({}, base, saved || {});

    approval.eq = id;
    approval.status = normalizeStatus(approval.status || (hasImportedTemplate(id) ? STATUSES.IMPORTED : STATUSES.DRAFT));
    approval.history = Array.isArray(approval.history) ? approval.history : [];
    approval.updatedAt = clean(approval.updatedAt || nowISO());
    approval.version = VERSION;

    return approval;
  }

  function normalizeStatus(status) {
    var s = upper(status);
    return STATUSES[s] || STATUSES.DRAFT;
  }

  function pushHistory(approval, action, detail) {
    approval.history = Array.isArray(approval.history) ? approval.history : [];
    approval.history.push({
      at: nowISO(),
      action: clean(action),
      role: getRole(),
      detail: detail || {}
    });
    if (approval.history.length > 100) {
      approval.history = approval.history.slice(approval.history.length - 100);
    }
    return approval;
  }

  function saveApproval(eq, approval, action, detail) {
    var id = safeEq(eq);
    var next = Object.assign({}, emptyApproval(id), approval || {});
    next.eq = id;
    next.status = normalizeStatus(next.status);
    next.version = VERSION;
    next.updatedAt = nowISO();

    if (action) pushHistory(next, action, detail || {});

    writeJSON(keys(id).approval, next);
    mirrorToExportPayload(id, next);
    updatePackageStatus(id, next);

    try {
      window.dispatchEvent(new CustomEvent('nexus:ccs-approval-update', { detail: next }));
    } catch (err) {}

    return next;
  }

  function updatePackageStatus(eq, approval) {
    var id = safeEq(eq);
    var k = keys(id);
    var current = readJSON(k.packageStatus, {}) || {};
    writeJSON(k.packageStatus, Object.assign({}, current, {
      section: 'ccs',
      approvalStatus: approval.status,
      approved: approval.status === STATUSES.APPROVED || approval.status === STATUSES.ACTIVE || approval.status === STATUSES.LOCKED,
      approvedBy: approval.approvedBy || '',
      approvedAt: approval.approvedAt || '',
      active: approval.status === STATUSES.ACTIVE || approval.status === STATUSES.LOCKED,
      locked: approval.status === STATUSES.LOCKED,
      updatedAt: nowISO()
    }));
  }

  function mirrorToExportPayload(eq, approval) {
    var id = safeEq(eq);
    var k = keys(id);
    var payload = readJSON(k.exportPayload, {}) || {};
    payload.eq = id;
    payload.approval = approval;
    payload.approvalStatus = approval.status;
    payload.approvedBy = approval.approvedBy || '';
    payload.approvedAt = approval.approvedAt || '';
    payload.updatedAt = payload.updatedAt || nowISO();
    writeJSON(k.exportPayload, payload);
  }

  function inferAndRepairStatus(eq) {
    var id = safeEq(eq);
    var approval = loadApproval(id);
    var ccs = loadCcsState(id);
    var hasSteps = !!(ccs && Array.isArray(ccs.steps) && ccs.steps.length);
    var signed = readText(keys(id).signed, '') === '1' || readText(keys(id).step, '') === '1';

    if (!hasSteps && approval.status !== STATUSES.DRAFT) {
      approval.previousStatus = approval.status;
      approval.status = STATUSES.DRAFT;
      approval.reason = 'No imported template found.';
      return saveApproval(id, approval, 'approval:auto-draft', { reason: approval.reason });
    }

    if (hasSteps && approval.status === STATUSES.DRAFT) {
      approval.previousStatus = approval.status;
      approval.status = STATUSES.IMPORTED;
      approval.importedAt = approval.importedAt || (ccs.importInfo && ccs.importInfo.importedAt) || ccs.updatedAt || nowISO();
      approval.importedBy = approval.importedBy || 'import';
      return saveApproval(id, approval, 'approval:auto-imported', { stepCount: ccs.steps.length });
    }

    if (signed && approval.status !== STATUSES.LOCKED) {
      approval.previousStatus = approval.status;
      approval.status = STATUSES.LOCKED;
      approval.lockedAt = approval.lockedAt || nowISO();
      approval.lockedBy = approval.lockedBy || 'final-signoff';
      approval.reason = approval.reason || 'Final sign-off locked this CCS template.';
      return saveApproval(id, approval, 'approval:auto-locked', { signed: true });
    }

    mirrorToExportPayload(id, approval);
    updatePackageStatus(id, approval);
    return approval;
  }

  function requireForeman(action) {
    if (roleAtLeast('foreman')) return true;
    try {
      alert((action || 'This action') + ' requires Foreman, Superintendent, or Admin.');
    } catch (err) {}
    return false;
  }

  function requestReview(eq, note) {
    var id = safeEq(eq);
    var approval = loadApproval(id);
    if (!hasImportedTemplate(id)) return saveApproval(id, approval, 'approval:review-denied', { reason: 'No imported CCS template.' });
    approval.previousStatus = approval.status;
    approval.status = STATUSES.REVIEW_REQUIRED;
    approval.reviewRequestedAt = nowISO();
    approval.reviewRequestedBy = getRole();
    approval.notes = clean(note || approval.notes || 'Template ready for review.');
    return saveApproval(id, approval, 'approval:review-requested', { notes: approval.notes });
  }

  function approve(eq, note) {
    var id = safeEq(eq);
    if (!requireForeman('Approving a CCS template')) return loadApproval(id);
    var approval = loadApproval(id);
    if (!hasImportedTemplate(id)) return saveApproval(id, approval, 'approval:approve-denied', { reason: 'No imported CCS template.' });
    approval.previousStatus = approval.status;
    approval.status = STATUSES.APPROVED;
    approval.approvedAt = nowISO();
    approval.approvedBy = getRole();
    approval.notes = clean(note || approval.notes || 'Template approved for field use.');
    return saveApproval(id, approval, 'approval:approved', { notes: approval.notes });
  }

  function activate(eq, note) {
    var id = safeEq(eq);
    if (!requireForeman('Activating a CCS template')) return loadApproval(id);
    var approval = loadApproval(id);
    if (approval.status !== STATUSES.APPROVED && approval.status !== STATUSES.ACTIVE) {
      approval = approve(id, note || 'Approved during activation.');
    }
    approval.previousStatus = approval.status;
    approval.status = STATUSES.ACTIVE;
    approval.activatedAt = nowISO();
    approval.activatedBy = getRole();
    approval.notes = clean(note || approval.notes || 'Template active for field completion.');
    return saveApproval(id, approval, 'approval:activated', { notes: approval.notes });
  }

  function lock(eq, reason) {
    var id = safeEq(eq);
    if (!requireForeman('Locking a CCS template')) return loadApproval(id);
    var approval = loadApproval(id);
    approval.previousStatus = approval.status;
    approval.status = STATUSES.LOCKED;
    approval.lockedAt = nowISO();
    approval.lockedBy = getRole();
    approval.reason = clean(reason || 'Template locked.');
    return saveApproval(id, approval, 'approval:locked', { reason: approval.reason });
  }

  function reopen(eq, reason) {
    var id = safeEq(eq);
    if (!roleAtLeast('superintendent')) {
      try { alert('Reopening a locked CCS requires Superintendent or Admin.'); } catch (err) {}
      return loadApproval(id);
    }
    var approval = loadApproval(id);
    approval.previousStatus = approval.status;
    approval.status = STATUSES.REVIEW_REQUIRED;
    approval.reason = clean(reason || 'Template reopened for review.');
    return saveApproval(id, approval, 'approval:reopened', { reason: approval.reason });
  }

  function patchFirebaseSync() {
    if (window.__NEXUS_CCS_APPROVAL_SYNC_PATCHED) return;
    if (!window.NEXUS_CCS_FIREBASE_SYNC || typeof window.NEXUS_CCS_FIREBASE_SYNC.savePayload !== 'function') return;

    window.__NEXUS_CCS_APPROVAL_SYNC_PATCHED = true;
    var original = window.NEXUS_CCS_FIREBASE_SYNC.savePayload;

    window.NEXUS_CCS_FIREBASE_SYNC.savePayload = async function patchedSavePayload(eq, payload, reason) {
      var id = safeEq(eq);
      var approval = inferAndRepairStatus(id);
      var nextPayload = Object.assign({}, payload || {}, {
        approval: approval,
        approvalStatus: approval.status,
        approvedBy: approval.approvedBy || '',
        approvedAt: approval.approvedAt || ''
      });
      return original.call(window.NEXUS_CCS_FIREBASE_SYNC, id, nextPayload, reason || 'ccs-approval-save');
    };
  }

  function statusTone(status) {
    switch (normalizeStatus(status)) {
      case STATUSES.APPROVED:
      case STATUSES.ACTIVE:
        return 'good';
      case STATUSES.LOCKED:
        return 'locked';
      case STATUSES.REVIEW_REQUIRED:
        return 'review';
      case STATUSES.IMPORTED:
        return 'imported';
      default:
        return 'draft';
    }
  }

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function injectStyles() {
    if (document.getElementById('ccs-approval-style')) return;
    var style = document.createElement('style');
    style.id = 'ccs-approval-style';
    style.textContent = ''
      + '.ccs-approval-panel{margin:14px 0;padding:14px;border-radius:18px;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.18);color:#fff}'
      + '.ccs-approval-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap}'
      + '.ccs-approval-title{font-size:18px;font-weight:1000;text-transform:uppercase;letter-spacing:.04em}'
      + '.ccs-approval-sub{margin-top:4px;font-size:12px;font-weight:850;color:rgba(255,255,255,.84)}'
      + '.ccs-approval-pill{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:8px 10px;font-size:12px;font-weight:1000;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.12)}'
      + '.ccs-approval-pill.good{background:rgba(22,163,74,.72)}.ccs-approval-pill.review{background:rgba(245,158,11,.8);color:#111}.ccs-approval-pill.locked{background:rgba(147,51,234,.76)}.ccs-approval-pill.imported{background:rgba(59,130,246,.72)}.ccs-approval-pill.draft{background:rgba(100,116,139,.72)}'
      + '.ccs-approval-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}'
      + '.ccs-approval-btn{border:0;border-radius:999px;padding:10px 13px;font-weight:1000;cursor:pointer;background:#2563eb;color:#fff}.ccs-approval-btn.green{background:#16a34a}.ccs-approval-btn.yellow{background:#f59e0b;color:#111}.ccs-approval-btn.purple{background:#9333ea}.ccs-approval-btn.gray{background:#475569}.ccs-approval-btn:disabled{opacity:.45;cursor:not-allowed;filter:grayscale(.4)}'
      + '.ccs-approval-history{margin-top:10px;font-size:11px;font-weight:800;color:rgba(255,255,255,.8)}'
      + '.ccs-approval-export{margin:16px 0;padding:14px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;color:#111827;break-inside:avoid;font-family:Arial,Helvetica,sans-serif}.ccs-approval-export h3{margin:0 0 8px;font-size:15px;text-transform:uppercase}.ccs-approval-export table{width:100%;border-collapse:collapse;font-size:12px}.ccs-approval-export td,.ccs-approval-export th{border:1px solid #cbd5e1;padding:7px;text-align:left;vertical-align:top}.ccs-approval-export th{background:#e5e7eb;text-transform:uppercase;font-size:10px}'
      + '@media(max-width:700px){.ccs-approval-btn{width:100%;min-height:48px}}';
    document.head.appendChild(style);
  }

  function isImportPage() {
    return /construction_check_sheet_import\.html/i.test(location.pathname) || !!document.getElementById('stepsList');
  }

  function isExportPage() {
    return /package_export\.html/i.test(location.pathname) || !!document.getElementById('exportContent') || !!document.querySelector('.package-export');
  }

  function findImportMount() {
    var existing = document.getElementById('ccsApprovalPanel');
    if (existing) return existing;
    var panel = document.createElement('section');
    panel.id = 'ccsApprovalPanel';
    panel.className = 'ccs-approval-panel';

    var target = document.querySelector('.progress') || document.querySelector('.tools') || document.querySelector('.shell') || document.body;
    if (target.parentNode && target !== document.body) {
      target.parentNode.insertBefore(panel, target.nextSibling);
    } else {
      document.body.insertBefore(panel, document.body.firstChild);
    }
    return panel;
  }

  function renderImportPanel() {
    if (!isImportPage()) return;
    injectStyles();
    patchFirebaseSync();
    var id = safeEq();
    var approval = inferAndRepairStatus(id);
    var ccs = loadCcsState(id);
    var stepCount = ccs && Array.isArray(ccs.steps) ? ccs.steps.length : 0;
    var canApprove = roleAtLeast('foreman');
    var canReopen = roleAtLeast('superintendent');
    var locked = approval.status === STATUSES.LOCKED;
    var panel = findImportMount();

    panel.innerHTML = ''
      + '<div class="ccs-approval-top">'
      + '<div><div class="ccs-approval-title">CCS Template Review</div>'
      + '<div class="ccs-approval-sub">Imported Excel templates must be reviewed before field use. Current role: ' + escapeHTML(getRole().toUpperCase()) + '.</div></div>'
      + '<span class="ccs-approval-pill ' + statusTone(approval.status) + '">' + escapeHTML(approval.status.replace(/_/g, ' ')) + '</span>'
      + '</div>'
      + '<div class="ccs-approval-actions">'
      + '<button class="ccs-approval-btn yellow" type="button" data-ccs-approval="review" ' + (!stepCount || locked ? 'disabled' : '') + '>Send To Review</button>'
      + '<button class="ccs-approval-btn green" type="button" data-ccs-approval="approve" ' + (!stepCount || !canApprove || locked ? 'disabled' : '') + '>Approve Template</button>'
      + '<button class="ccs-approval-btn" type="button" data-ccs-approval="activate" ' + (!stepCount || !canApprove || locked ? 'disabled' : '') + '>Make Active</button>'
      + '<button class="ccs-approval-btn purple" type="button" data-ccs-approval="lock" ' + (!stepCount || !canApprove || locked ? 'disabled' : '') + '>Lock Template</button>'
      + '<button class="ccs-approval-btn gray" type="button" data-ccs-approval="reopen" ' + (!locked || !canReopen ? 'disabled' : '') + '>Reopen</button>'
      + '</div>'
      + '<div class="ccs-approval-history">'
      + 'Steps: ' + escapeHTML(stepCount) + ' | Approved By: ' + escapeHTML(approval.approvedBy || '--') + ' | Approved At: ' + escapeHTML(approval.approvedAt || '--')
      + '</div>';
  }

  function renderExportPanel() {
    if (!isExportPage()) return;
    injectStyles();
    var id = safeEq();
    var approval = inferAndRepairStatus(id);
    var ccs = loadCcsState(id);
    var stepCount = ccs && Array.isArray(ccs.steps) ? ccs.steps.length : 0;
    var existing = document.getElementById('ccsApprovalExportSection');
    if (!existing) {
      existing = document.createElement('section');
      existing.id = 'ccsApprovalExportSection';
      existing.className = 'ccs-approval-export';
      var target = document.querySelector('#exportContent') || document.querySelector('.package-export') || document.querySelector('main') || document.body;
      target.appendChild(existing);
    }
    existing.innerHTML = ''
      + '<h3>CCS Template Approval</h3>'
      + '<table><tbody>'
      + '<tr><th>Status</th><td>' + escapeHTML(approval.status) + '</td></tr>'
      + '<tr><th>Imported</th><td>' + escapeHTML(approval.importedAt || (ccs && ccs.importInfo && ccs.importInfo.importedAt) || '--') + '</td></tr>'
      + '<tr><th>Approved By</th><td>' + escapeHTML(approval.approvedBy || '--') + '</td></tr>'
      + '<tr><th>Approved At</th><td>' + escapeHTML(approval.approvedAt || '--') + '</td></tr>'
      + '<tr><th>Activated By</th><td>' + escapeHTML(approval.activatedBy || '--') + '</td></tr>'
      + '<tr><th>Activated At</th><td>' + escapeHTML(approval.activatedAt || '--') + '</td></tr>'
      + '<tr><th>Locked By</th><td>' + escapeHTML(approval.lockedBy || '--') + '</td></tr>'
      + '<tr><th>Locked At</th><td>' + escapeHTML(approval.lockedAt || '--') + '</td></tr>'
      + '<tr><th>Step Count</th><td>' + escapeHTML(stepCount) + '</td></tr>'
      + '<tr><th>Notes / Reason</th><td>' + escapeHTML(approval.notes || approval.reason || '--') + '</td></tr>'
      + '</tbody></table>';
  }

  function bind() {
    if (window.__NEXUS_CCS_APPROVAL_BOUND) return;
    window.__NEXUS_CCS_APPROVAL_BOUND = true;
    document.addEventListener('click', function (event) {
      var btn = event.target && event.target.closest ? event.target.closest('[data-ccs-approval]') : null;
      if (!btn) return;
      var action = btn.getAttribute('data-ccs-approval');
      var note = '';
      if (action === 'lock' || action === 'reopen') {
        try { note = prompt('Reason / note:', '') || ''; } catch (err) { note = ''; }
      }
      if (action === 'review') requestReview(null, 'Template sent to review.');
      if (action === 'approve') approve(null, 'Template approved.');
      if (action === 'activate') activate(null, 'Template active for field use.');
      if (action === 'lock') lock(null, note || 'Template locked.');
      if (action === 'reopen') reopen(null, note || 'Template reopened.');
      refresh();
    });
  }

  function refresh() {
    patchFirebaseSync();
    renderImportPanel();
    renderExportPanel();
  }

  function init() {
    bind();
    refresh();
  }

  var api = {
    __installed: true,
    version: VERSION,
    STATUSES: STATUSES,
    keys: keys,
    loadApproval: loadApproval,
    saveApproval: saveApproval,
    requestReview: requestReview,
    approve: approve,
    activate: activate,
    lock: lock,
    reopen: reopen,
    inferAndRepairStatus: inferAndRepairStatus,
    roleAtLeast: roleAtLeast,
    refresh: refresh
  };

  window.NEXUS_CCS_APPROVAL = api;
  window.CCSApproval = api;
  window.NEXUS = window.NEXUS || {};
  window.NEXUS.CCSApproval = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('storage', function (event) {
    if (!event || !event.key) return;
    if (event.key.indexOf('_ccs_approval_v1') !== -1 || event.key.indexOf('_ccs_two_tab_v1') !== -1) {
      setTimeout(refresh, 50);
    }
  });

  window.addEventListener('nexus:ccs-sync-status', function () { setTimeout(refresh, 50); });
  window.addEventListener('vanguard:update', function () { setTimeout(refresh, 50); });
})();
