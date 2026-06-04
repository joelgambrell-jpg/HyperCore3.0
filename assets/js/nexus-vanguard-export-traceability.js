/*
  assets/js/nexus-vanguard-export-traceability.js
  Adds litigation-grade Vanguard validation traceability to Package Export.

  Purpose:
  - Non-backend completion item before Firebase/Gemini handoff.
  - Shows requirement/value/status/source/page/reviewer/timestamp where available.
  - Reads only existing localStorage/export state; does not alter workflow.
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_EXPORT_TRACEABILITY && window.NEXUS_VANGUARD_EXPORT_TRACEABILITY.__installed) return;

  var VERSION = '1.0.0-front-end-hardening';

  function qs(){ try { return new URLSearchParams(location.search); } catch(e){ return new URLSearchParams(''); } }
  function eq(){ return (qs().get('eq') || localStorage.getItem('nexus_active_equipment') || localStorage.getItem('nexus_active_eq') || 'NO_EQ').trim() || 'NO_EQ'; }
  function clean(v){ return String(v == null ? '' : v).trim(); }
  function esc(v){ return clean(v).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function readJSON(key, fallback){ try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch(e){ return fallback; } }
  function safeArray(v){ return Array.isArray(v) ? v : []; }
  function statusClass(status){
    status = clean(status).toUpperCase();
    if (status === 'PASS' || status === 'COMPLETE' || status === 'READY') return 'vg-good';
    if (status === 'FAIL' || status === 'BLOCKED' || status === 'MISSING') return 'vg-bad';
    return 'vg-review';
  }

  function firstCitation(obj){
    var citations = [];
    if (obj && Array.isArray(obj.citations)) citations = citations.concat(obj.citations);
    if (obj && obj.requirement && Array.isArray(obj.requirement.citations)) citations = citations.concat(obj.requirement.citations);
    if (!citations.length) return null;
    return citations[0];
  }

  function collectRows(){
    var id = eq();
    var rows = [];
    var ccs = readJSON('nexus_' + id + '_ccs_vanguard_validation', null);
    var torque = readJSON('nexus_' + id + '_torque_vanguard_validation_v1', null);
    var readiness = readJSON('nexus_' + id + '_package_readiness', null);
    var conflicts = readJSON('nexus_vanguard_conflicts_v1', { conflicts:[] });

    safeArray(ccs && ccs.rows).forEach(function(r){
      var rule = r.vanguardRule || {};
      var cite = firstCitation(rule) || {};
      rows.push({
        module:'CCS',
        item:r.stepDescription || r.description || r.stepId || r.step,
        status:r.status || r.passFail || (rule.status || rule.state) || 'REVIEW',
        requirement:r.validationRule || (rule.rules && rule.rules.join(', ')) || r.source || '',
        entered:r.passFail || r.status || '',
        required:'',
        source:r.source || cite.source || '',
        page:cite.page || cite.locator || '',
        reviewer:r.updatedBy || (r.supervisorReview && r.supervisorReview.by) || '',
        timestamp:r.updatedAt || (r.supervisorReview && r.supervisorReview.at) || ''
      });
    });

    safeArray(torque && torque.results).forEach(function(result, idx){
      safeArray(result.findings).forEach(function(finding){
        var cite = firstCitation(finding) || {};
        rows.push({
          module:'TORQUE',
          item:'Torque Row ' + (idx + 1),
          status:finding.state || result.state || 'REVIEW',
          requirement:finding.requirementType || finding.requirementId || '',
          entered:finding.enteredValue == null ? '' : finding.enteredValue,
          required:finding.requiredValue == null ? '' : finding.requiredValue,
          source:cite.source || '',
          page:cite.page || cite.locator || '',
          reviewer:'',
          timestamp:torque.updatedAt || ''
        });
      });
    });

    safeArray(conflicts.conflicts).forEach(function(conflict){
      rows.push({
        module:'CONFLICT',
        item:conflict.type || conflict.key || 'Requirement conflict',
        status:conflict.state || 'REVIEW',
        requirement:conflict.reason || '',
        entered:'',
        required:conflict.recommended && conflict.recommended.value != null ? String(conflict.recommended.value) + ' ' + clean(conflict.recommended.unit) : '',
        source:conflict.recommended && conflict.recommended.sourceName || '',
        page:conflict.recommended && (conflict.recommended.page || conflict.recommended.section) || '',
        reviewer:'',
        timestamp:conflict.detectedAt || ''
      });
    });

    if (readiness && safeArray(readiness.blockers).length) {
      readiness.blockers.forEach(function(blocker){
        rows.push({
          module:'READINESS',
          item:blocker.label || 'Readiness blocker',
          status:'BLOCKED',
          requirement:blocker.detail || '',
          entered:'',
          required:'',
          source:'',
          page:'',
          reviewer:'',
          timestamp:readiness.updated ? new Date(readiness.updated).toISOString() : ''
        });
      });
    }

    return rows;
  }

  function ensureStyle(){
    if (document.getElementById('nexus-vanguard-export-traceability-style')) return;
    var style = document.createElement('style');
    style.id = 'nexus-vanguard-export-traceability-style';
    style.textContent = ''
      + '.vg-trace{margin:18px 0;padding:16px;border-radius:18px;border:1px solid rgba(255,255,255,.22);background:rgba(0,0,0,.32);color:#fff;}'
      + '.vg-trace h2{margin:0 0 8px;font-size:22px;font-weight:1000;}'
      + '.vg-trace-sub{font-size:12px;font-weight:850;opacity:.88;margin-bottom:10px;}'
      + '.vg-trace-table{width:100%;border-collapse:collapse;font-size:11px;}'
      + '.vg-trace-table th,.vg-trace-table td{border:1px solid rgba(255,255,255,.20);padding:7px;vertical-align:top;}'
      + '.vg-trace-table th{background:rgba(255,255,255,.12);text-align:left;text-transform:uppercase;letter-spacing:.05em;}'
      + '.vg-pill{display:inline-block;padding:4px 7px;border-radius:999px;font-weight:1000;}'
      + '.vg-good{background:#2dff9b;color:#001b10}.vg-review{background:#ffb800;color:#1f1300}.vg-bad{background:#ff5b5b;color:#260000}'
      + '@media print{.vg-trace{background:#fff!important;color:#000!important;border:1px solid #999!important}.vg-trace-table th,.vg-trace-table td{border:1px solid #999!important;color:#000!important}.vg-good,.vg-review,.vg-bad{border:1px solid #777;color:#000!important;background:#fff!important}}';
    document.head.appendChild(style);
  }

  function render(){
    ensureStyle();
    var rows = collectRows();
    if (!rows.length) return null;

    var section = document.getElementById('nexusVanguardExportTraceability');
    if (!section) {
      section = document.createElement('section');
      section.id = 'nexusVanguardExportTraceability';
      section.className = 'vg-trace';
      var host = document.querySelector('main .card') || document.querySelector('.card') || document.querySelector('main') || document.body;
      host.appendChild(section);
    }

    section.innerHTML = ''
      + '<h2>Vanguard Validation Traceability</h2>'
      + '<div class="vg-trace-sub">Requirement / entered value / source reference trail generated from current HyperCore validation state.</div>'
      + '<table class="vg-trace-table"><thead><tr>'
      + '<th>Module</th><th>Item</th><th>Status</th><th>Requirement</th><th>Entered</th><th>Required</th><th>Source</th><th>Page / Section</th><th>Reviewer</th><th>Timestamp</th>'
      + '</tr></thead><tbody>'
      + rows.map(function(r){
        return '<tr>'
          + '<td>' + esc(r.module) + '</td>'
          + '<td>' + esc(r.item) + '</td>'
          + '<td><span class="vg-pill ' + statusClass(r.status) + '">' + esc(String(r.status || '').toUpperCase()) + '</span></td>'
          + '<td>' + esc(r.requirement) + '</td>'
          + '<td>' + esc(r.entered) + '</td>'
          + '<td>' + esc(r.required) + '</td>'
          + '<td>' + esc(r.source) + '</td>'
          + '<td>' + esc(r.page) + '</td>'
          + '<td>' + esc(r.reviewer) + '</td>'
          + '<td>' + esc(r.timestamp) + '</td>'
          + '</tr>';
      }).join('')
      + '</tbody></table>';

    return section;
  }

  window.NEXUS_VANGUARD_EXPORT_TRACEABILITY = { __installed:true, version:VERSION, collectRows:collectRows, render:render };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(render, 500); });
  else setTimeout(render, 500);
})();
