/*
  assets/js/ccs_package_export_bridge.js
  NEXUS CCS Package Export Bridge

  Purpose:
  - Adds imported CCS approval + Vanguard field validation summary to package_export.html.
  - Additive only. It appends a report section without changing existing package export logic.
*/

(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.NEXUS_CCS_PACKAGE_EXPORT_BRIDGE && window.NEXUS_CCS_PACKAGE_EXPORT_BRIDGE.__installed) return;

  var VERSION = '0.3.0-evidence-export';

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

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function getEq() {
    try {
      var params = new URL(window.location.href).searchParams;
      var fromUrl = clean(params.get('eq') || params.get('equipment') || params.get('equipmentId') || '');
      if (fromUrl) return fromUrl;
    } catch (err) {}

    return clean(
      localStorage.getItem('nexus_active_eq') ||
      localStorage.getItem('nexus_active_equipment') ||
      localStorage.getItem('nexus_current_eq') ||
      'NO_EQ'
    ) || 'NO_EQ';
  }

  function keys(eq) {
    return {
      exportPayload: 'nexus_' + eq + '_ccs_vanguard_export',
      approval: 'nexus_' + eq + '_ccs_approval_v1'
    };
  }

  function statusClass(status) {
    var s = clean(status).toUpperCase();
    if (s === 'PASS' || s === 'GOOD' || s === 'APPROVED' || s === 'ACTIVE') return 'pass';
    if (s === 'REVIEW' || s === 'CHECK' || s === 'REVIEW_REQUIRED') return 'review';
    if (s === 'BLOCKED' || s === 'STOP' || s === 'FAIL') return 'fail';
    return 'review';
  }

  function metric(label, value) {
    return '<div class="k">' + escapeHTML(label) + '</div><div>' + escapeHTML(value) + '</div>';
  }

  function evidenceSummary(step) {
    var records = Array.isArray(step && step.evidenceRecords) ? step.evidenceRecords : [];
    if (!records.length) return 'None attached';

    return records.map(function (record) {
      var parts = [];
      parts.push(record.type || 'REFERENCE');
      if (record.title) parts.push(record.title);
      if (record.sourceDocument) parts.push(record.sourceDocument);
      if (record.page) parts.push('p. ' + record.page);
      if (record.reference) parts.push(record.reference);
      if (record.url) parts.push(record.url);
      if (record.notes) parts.push(record.notes);
      return parts.join(' — ');
    }).join('\\n');
  }

  function evidenceCount(steps) {
    return (Array.isArray(steps) ? steps : []).reduce(function (total, step) {
      return total + (Array.isArray(step.evidenceRecords) ? step.evidenceRecords.length : 0);
    }, 0);
  }

  function tableRows(summary, steps) {
    if (!summary || !Array.isArray(summary.results) || !summary.results.length) {
      return '<tr><td colspan="6">No imported CCS validation rows found.</td></tr>';
    }

    steps = Array.isArray(steps) ? steps : [];

    return summary.results.map(function (item) {
      var result = item.result || {};
      var step = steps[item.index] || {};
      var review = step.supervisorReview || {};
      var decision = review.decision ? (review.decision + (review.by ? ' by ' + review.by : '')) : '--';
      var comment = review.comment || '';
      return ''
        + '<tr>'
        + '<td>' + escapeHTML(item.title || item.id || '') + '</td>'
        + '<td><span class="pill ' + statusClass(result.status || result.fieldLabel) + '">' + escapeHTML(result.fieldLabel || result.status || '') + '</span></td>'
        + '<td>' + escapeHTML(result.message || '') + '</td>'
        + '<td>' + escapeHTML((result.rules || []).join(', ')) + '</td>'
        + '<td style="white-space:pre-wrap;">' + escapeHTML(evidenceSummary(step)) + '</td>'
        + '<td><b>' + escapeHTML(decision) + '</b>' + (comment ? '<br>' + escapeHTML(comment) : '') + '</td>'
        + '</tr>';
    }).join('');
  }

  function supervisorHistoryRows(steps) {
    var rows = [];
    (Array.isArray(steps) ? steps : []).forEach(function (step) {
      (Array.isArray(step.supervisorHistory) ? step.supervisorHistory : []).forEach(function (item) {
        rows.push({ step: step.title || step.id || '', item: item });
      });
    });

    if (!rows.length) return '<p>No supervisor review actions recorded.</p>';

    return ''
      + '<table><thead><tr><th>Checklist Item</th><th>Action</th><th>By</th><th>Time</th><th>Comment</th></tr></thead><tbody>'
      + rows.map(function (row) {
        var item = row.item || {};
        return ''
          + '<tr>'
          + '<td>' + escapeHTML(row.step) + '</td>'
          + '<td>' + escapeHTML(item.action || '') + '</td>'
          + '<td>' + escapeHTML(item.by || '') + '</td>'
          + '<td>' + escapeHTML(item.at || '') + '</td>'
          + '<td>' + escapeHTML(item.comment || '') + '</td>'
          + '</tr>';
      }).join('')
      + '</tbody></table>';
  }

  function render() {
    var eq = getEq();
    var k = keys(eq);
    var payload = readJSON(k.exportPayload, null);
    var approval = readJSON(k.approval, null);

    if (!payload && !approval) return;

    var report = document.getElementById('report') || document.getElementById('printArea') || document.querySelector('main') || document.body;
    var existing = document.getElementById('ccs-vanguard-package-export');
    if (!existing) {
      existing = document.createElement('section');
      existing.id = 'ccs-vanguard-package-export';
      existing.className = 'report-section';
      report.appendChild(existing);
    }

    var steps = payload && Array.isArray(payload.steps) ? payload.steps : [];
    var summary = null;
    if (window.NEXUS_CCS_VANGUARD_RULES && typeof window.NEXUS_CCS_VANGUARD_RULES.summarize === 'function') {
      summary = window.NEXUS_CCS_VANGUARD_RULES.summarize(steps, { eq: eq });
    }

    summary = summary || {
      fieldLabel: 'CHECK',
      message: 'CCS validation summary is not available.',
      pass: 0,
      review: 0,
      blocked: 0,
      results: []
    };

    existing.innerHTML = ''
      + '<h2>Imported CCS Approval + Vanguard Validation</h2>'
      + '<div class="status-banner ' + statusClass(summary.status || summary.fieldLabel) + '">'
      + '<strong>' + escapeHTML(summary.fieldLabel || 'CHECK') + ':</strong> ' + escapeHTML(summary.message || '')
      + '</div>'
      + '<div class="kv">'
      + metric('Equipment', eq)
      + metric('Template Status', approval && approval.status ? approval.status : 'Not Recorded')
      + metric('Approved By', approval && approval.approvedBy ? approval.approvedBy : '--')
      + metric('Approved At', approval && approval.approvedAt ? approval.approvedAt : '--')
      + metric('Good', summary.pass || 0)
      + metric('Check', summary.review || 0)
      + metric('Stop', summary.blocked || 0)
      + metric('Rows', steps.length)
      + metric('Evidence Items', evidenceCount(steps))
      + '</div>'
      + '<table><thead><tr><th>Checklist Item</th><th>Field Status</th><th>Plain-Language Message</th><th>Rules</th><th>Evidence / References</th><th>Supervisor Decision</th></tr></thead><tbody>'
      + tableRows(summary, steps)
      + '</tbody></table>'
      + '<h3>Supervisor Review History</h3>'
      + supervisorHistoryRows(steps);
  }

  var api = {
    __installed: true,
    version: VERSION,
    render: render
  };

  window.NEXUS_CCS_PACKAGE_EXPORT_BRIDGE = api;
  window.CCSPackageExportBridge = api;
  window.NEXUS = window.NEXUS || {};
  window.NEXUS.CCSPackageExportBridge = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }

  window.addEventListener('storage', function (event) {
    if (event && event.key && event.key.indexOf('_ccs_') !== -1) {
      setTimeout(render, 80);
    }
  });
})();
