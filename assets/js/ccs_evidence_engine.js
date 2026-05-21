/*
  assets/js/ccs_evidence_engine.js
  NEXUS CCS Evidence Engine

  Purpose:
  - Adds field-friendly evidence attachment controls to imported CCS rows.
  - Supports document references, photo references, document notes, and linked requirements.
  - Additive only. Does not replace existing CCS logic.
*/

(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.NEXUS_CCS_EVIDENCE_ENGINE && window.NEXUS_CCS_EVIDENCE_ENGINE.__installed) return;

  var VERSION = '0.1.0-evidence-layer';

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function lower(value) {
    return clean(value).toLowerCase();
  }

  function upper(value) {
    return clean(value).toUpperCase();
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
      if (window.NEXUS && typeof window.NEXUS.getRole === 'function') return lower(window.NEXUS.getRole() || 'field');
    } catch (err) {}

    try {
      if (window.NEXUS_VANGUARD && typeof window.NEXUS_VANGUARD.getRole === 'function') return lower(window.NEXUS_VANGUARD.getRole() || 'field');
    } catch (err2) {}

    try {
      return lower(localStorage.getItem('nexus_role') || 'field');
    } catch (err3) {}

    return 'field';
  }

  function ensureEvidence(step) {
    step = step || {};
    step.evidenceRecords = Array.isArray(step.evidenceRecords) ? step.evidenceRecords : [];
    return step.evidenceRecords;
  }

  function normalizeEvidence(record) {
    record = record && typeof record === 'object' ? record : {};
    var type = upper(record.type || 'REFERENCE');

    if (type === 'PHOTO' || type === 'IMAGE') type = 'PHOTO';
    else if (type === 'DOCUMENT' || type === 'DOC') type = 'DOCUMENT';
    else if (type === 'REQUIREMENT' || type === 'RULE') type = 'REQUIREMENT';
    else if (type === 'NOTE' || type === 'COMMENT') type = 'NOTE';
    else type = 'REFERENCE';

    return {
      id: clean(record.id || ('EVID-' + Date.now() + '-' + Math.floor(Math.random() * 10000))),
      type: type,
      title: clean(record.title || record.name || type + ' Evidence'),
      url: clean(record.url || record.link || ''),
      reference: clean(record.reference || record.source || ''),
      notes: clean(record.notes || record.note || record.comment || ''),
      requirementId: clean(record.requirementId || record.reqId || ''),
      sourceDocument: clean(record.sourceDocument || record.document || ''),
      page: clean(record.page || ''),
      addedBy: clean(record.addedBy || currentRole()),
      addedAt: clean(record.addedAt || nowISO())
    };
  }

  function addEvidence(step, record) {
    var list = ensureEvidence(step);
    var normalized = normalizeEvidence(record);
    list.push(normalized);
    step.evidenceRecords = list;
    step.updatedAt = nowISO();
    step.updatedBy = currentRole();
    return normalized;
  }

  function removeEvidence(step, evidenceId) {
    var id = clean(evidenceId);
    step.evidenceRecords = ensureEvidence(step).filter(function (item) {
      return clean(item.id) !== id;
    });
    step.updatedAt = nowISO();
    step.updatedBy = currentRole();
    return step;
  }

  function hasReference(step) {
    var records = ensureEvidence(step);
    if (records.some(function (item) {
      var type = upper(item.type);
      return (type === 'REFERENCE' || type === 'DOCUMENT' || type === 'REQUIREMENT') && (clean(item.url) || clean(item.reference) || clean(item.notes) || clean(item.sourceDocument));
    })) return true;

    var refs = Array.isArray(step.references) ? step.references : [];
    if (refs.some(function (ref) { return clean(ref && (ref.url || ref.name || ref.notes)); })) return true;

    return !!clean(step.source || step.documentReference || step.reference);
  }

  function hasPhoto(step) {
    var records = ensureEvidence(step);
    if (records.some(function (item) {
      return upper(item.type) === 'PHOTO' && (clean(item.url) || clean(item.reference) || clean(item.notes));
    })) return true;

    if (step.photo || step.photoUrl || step.image || step.imageUrl || step.evidencePhoto) return true;
    if (step.evidence && (step.evidence.photo || step.evidence.photoUrl || step.evidence.image)) return true;
    return false;
  }

  function summary(step) {
    var records = ensureEvidence(step);
    var out = {
      total: records.length,
      references: 0,
      photos: 0,
      documents: 0,
      requirements: 0,
      notes: 0,
      hasReference: hasReference(step),
      hasPhoto: hasPhoto(step)
    };

    records.forEach(function (item) {
      var type = upper(item.type);
      if (type === 'PHOTO') out.photos += 1;
      else if (type === 'DOCUMENT') out.documents += 1;
      else if (type === 'REQUIREMENT') out.requirements += 1;
      else if (type === 'NOTE') out.notes += 1;
      else out.references += 1;
    });

    return out;
  }

  function injectStyles() {
    if (document.getElementById('ccs-evidence-engine-style')) return;

    var style = document.createElement('style');
    style.id = 'ccs-evidence-engine-style';
    style.textContent = ''
      + '.ccs-evidence-drawer{margin-top:12px;border-radius:16px;border:1px solid rgba(255,255,255,.16);background:rgba(2,6,23,.86);color:#fff;overflow:hidden}'
      + '.ccs-evidence-drawer summary{cursor:pointer;padding:14px 16px;font-weight:1000;font-size:16px;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:10px}'
      + '.ccs-evidence-drawer summary::-webkit-details-marker{display:none}'
      + '.ccs-evidence-body{padding:0 16px 16px;display:grid;gap:12px}'
      + '.ccs-evidence-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}'
      + '.ccs-evidence-field{display:grid;gap:5px}'
      + '.ccs-evidence-field label{font-size:11px;font-weight:1000;text-transform:uppercase;letter-spacing:.06em;opacity:.78}'
      + '.ccs-evidence-input,.ccs-evidence-select,.ccs-evidence-textarea{width:100%;border-radius:14px;border:2px solid rgba(255,255,255,.16);background:#0b1220;color:#fff;padding:11px;font-size:14px;font-weight:800}'
      + '.ccs-evidence-textarea{min-height:74px;resize:vertical}'
      + '.ccs-evidence-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}'
      + '.ccs-evidence-btn{min-height:52px;border:0;border-radius:14px;background:#2563eb;color:#fff;font-size:14px;font-weight:1000;cursor:pointer;padding:10px}'
      + '.ccs-evidence-btn.secondary{background:#334155}'
      + '.ccs-evidence-btn.danger{background:#dc2626}'
      + '.ccs-evidence-list{display:grid;gap:8px}'
      + '.ccs-evidence-item{border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.08);padding:10px;display:grid;gap:4px}'
      + '.ccs-evidence-item-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap}'
      + '.ccs-evidence-pill{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.16);padding:6px 9px;font-size:11px;font-weight:1000}'
      + '.ccs-evidence-title{font-size:13px;font-weight:1000}'
      + '.ccs-evidence-meta{font-size:12px;font-weight:800;opacity:.84;line-height:1.35;overflow-wrap:anywhere}'
      + '@media(max-width:760px){.ccs-evidence-grid,.ccs-evidence-actions{grid-template-columns:1fr}.ccs-evidence-drawer summary{font-size:15px}}';

    document.head.appendChild(style);
  }

  function evidenceRowsHTML(step, idx) {
    var records = ensureEvidence(step);
    if (!records.length) {
      return '<div class="ccs-evidence-item"><div class="ccs-evidence-title">No evidence attached yet.</div><div class="ccs-evidence-meta">Attach a reference, photo link, document note, or requirement link when this item needs proof.</div></div>';
    }

    return records.slice().reverse().map(function (record) {
      return ''
        + '<div class="ccs-evidence-item">'
        + '<div class="ccs-evidence-item-top">'
        + '<div><span class="ccs-evidence-pill">' + escapeHTML(record.type) + '</span> <span class="ccs-evidence-title">' + escapeHTML(record.title || 'Evidence') + '</span></div>'
        + '<button class="ccs-evidence-btn danger" style="min-height:34px;padding:6px 10px;font-size:12px;" type="button" data-ccs-evidence-remove="' + escapeHTML(record.id) + '" data-idx="' + idx + '">Remove</button>'
        + '</div>'
        + (record.url ? '<div class="ccs-evidence-meta"><b>Link:</b> ' + escapeHTML(record.url) + '</div>' : '')
        + (record.reference ? '<div class="ccs-evidence-meta"><b>Reference:</b> ' + escapeHTML(record.reference) + '</div>' : '')
        + (record.sourceDocument || record.page ? '<div class="ccs-evidence-meta"><b>Source:</b> ' + escapeHTML(record.sourceDocument || '') + (record.page ? ' p. ' + escapeHTML(record.page) : '') + '</div>' : '')
        + (record.requirementId ? '<div class="ccs-evidence-meta"><b>Requirement:</b> ' + escapeHTML(record.requirementId) + '</div>' : '')
        + (record.notes ? '<div class="ccs-evidence-meta"><b>Note:</b> ' + escapeHTML(record.notes) + '</div>' : '')
        + '<div class="ccs-evidence-meta">Added by ' + escapeHTML(record.addedBy || '') + ' at ' + escapeHTML(record.addedAt || '') + '</div>'
        + '</div>';
    }).join('');
  }

  function renderPanel(step, idx) {
    injectStyles();
    var s = summary(step || {});
    var i = Number(idx) || 0;

    return ''
      + '<details class="ccs-evidence-drawer">'
      + '<summary>Attach Evidence / References <span class="ccs-evidence-pill">' + escapeHTML(String(s.total)) + ' attached</span></summary>'
      + '<div class="ccs-evidence-body">'
      + '<div class="ccs-evidence-grid">'
      + '<div class="ccs-evidence-field"><label for="ccs_evidence_type_' + i + '">Evidence Type</label><select class="ccs-evidence-select" id="ccs_evidence_type_' + i + '"><option value="REFERENCE">Reference</option><option value="PHOTO">Photo Link</option><option value="DOCUMENT">Document Note</option><option value="REQUIREMENT">Requirement Link</option><option value="NOTE">Field Note</option></select></div>'
      + '<div class="ccs-evidence-field"><label for="ccs_evidence_title_' + i + '">Title</label><input class="ccs-evidence-input" id="ccs_evidence_title_' + i + '" placeholder="Example: AWS spec section, FPV photo, drawing E-401" /></div>'
      + '<div class="ccs-evidence-field"><label for="ccs_evidence_url_' + i + '">URL / Page / Photo Link</label><input class="ccs-evidence-input" id="ccs_evidence_url_' + i + '" placeholder="Paste Procore, drawing, page, or photo link" /></div>'
      + '<div class="ccs-evidence-field"><label for="ccs_evidence_reference_' + i + '">Reference / Spec Section</label><input class="ccs-evidence-input" id="ccs_evidence_reference_' + i + '" placeholder="Example: Spec 26 05 00 §3.4" /></div>'
      + '<div class="ccs-evidence-field"><label for="ccs_evidence_document_' + i + '">Source Document</label><input class="ccs-evidence-input" id="ccs_evidence_document_' + i + '" placeholder="Example: SquareD Submittal" /></div>'
      + '<div class="ccs-evidence-field"><label for="ccs_evidence_page_' + i + '">Page</label><input class="ccs-evidence-input" id="ccs_evidence_page_' + i + '" placeholder="Example: 14" /></div>'
      + '</div>'
      + '<div class="ccs-evidence-field"><label for="ccs_evidence_notes_' + i + '">Notes</label><textarea class="ccs-evidence-textarea" id="ccs_evidence_notes_' + i + '" placeholder="Plain language note. Example: Verified against approved submittal page 14."></textarea></div>'
      + '<div class="ccs-evidence-actions"><button class="ccs-evidence-btn" type="button" data-ccs-evidence-add="' + i + '">Attach Evidence</button><button class="ccs-evidence-btn secondary" type="button" data-ccs-evidence-quick-reference="' + i + '">Use Current Source as Reference</button></div>'
      + '<div class="ccs-evidence-list">' + evidenceRowsHTML(step || {}, i) + '</div>'
      + '</div>'
      + '</details>';
  }

  function readForm(idx) {
    function val(id) {
      var el = document.getElementById(id + '_' + idx);
      return clean(el && el.value);
    }

    return normalizeEvidence({
      type: val('ccs_evidence_type'),
      title: val('ccs_evidence_title'),
      url: val('ccs_evidence_url'),
      reference: val('ccs_evidence_reference'),
      sourceDocument: val('ccs_evidence_document'),
      page: val('ccs_evidence_page'),
      notes: val('ccs_evidence_notes')
    });
  }

  function clearForm(idx) {
    ['type', 'title', 'url', 'reference', 'document', 'page', 'notes'].forEach(function (name) {
      var id = name === 'type' ? 'ccs_evidence_type' : name === 'document' ? 'ccs_evidence_document' : 'ccs_evidence_' + name;
      var el = document.getElementById(id + '_' + idx);
      if (!el) return;
      if (el.tagName === 'SELECT') el.value = 'REFERENCE';
      else el.value = '';
    });
  }

  function applyAddFromDom(step, idx) {
    var record = readForm(idx);
    if (!record.title && !record.url && !record.reference && !record.notes && !record.sourceDocument) {
      throw new Error('Add a title, link, reference, source document, or note before attaching evidence.');
    }
    addEvidence(step, record);
    clearForm(idx);
    return step;
  }

  function applyQuickReference(step) {
    step = step || {};
    var refs = Array.isArray(step.references) ? step.references : [];
    var first = refs[0] || {};
    return addEvidence(step, {
      type: 'REFERENCE',
      title: first.name || step.source || 'Current CCS source/reference',
      url: first.url || '',
      reference: step.source || first.notes || '',
      notes: 'Attached from the current CCS row source/reference.',
      sourceDocument: first.type || ''
    });
  }

  var api = {
    __installed: true,
    version: VERSION,
    normalizeEvidence: normalizeEvidence,
    addEvidence: addEvidence,
    removeEvidence: removeEvidence,
    hasReference: hasReference,
    hasPhoto: hasPhoto,
    summary: summary,
    renderPanel: renderPanel,
    readForm: readForm,
    applyAddFromDom: applyAddFromDom,
    applyQuickReference: applyQuickReference
  };

  window.NEXUS_CCS_EVIDENCE_ENGINE = api;
  window.CCSEvidenceEngine = api;
  window.NEXUS = window.NEXUS || {};
  window.NEXUS.CCSEvidenceEngine = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectStyles);
  } else {
    injectStyles();
  }
})();
