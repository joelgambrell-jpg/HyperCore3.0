/*
  assets/js/vanguard_final_export_engine.js
  NEXUS Vanguard Final Export Engine

  Purpose:
  - Unified export dataset for CCS, evidence, approvals, conflicts, alerts, corrections, and audit trail.
*/
(function(){
  'use strict';
  if (window.NEXUS_VANGUARD_FINAL_EXPORT && window.NEXUS_VANGUARD_FINAL_EXPORT.__installed) return;

  var VERSION = '0.2.0-final-export-engine';

  function safeJSON(key, fallback){
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch(e){ return fallback; }
  }

  function collect(){
    var vg = window.NEXUS_VANGUARD || window.Vanguard || null;
    var state = vg && typeof vg.getState === 'function' ? vg.getState() : {};
    return {
      generatedAt: new Date().toISOString(),
      equipmentId: state.equipmentId || localStorage.getItem('nexus_active_eq') || '',
      vanguardState: state,
      documents: safeJSON('nexus_vanguard_document_library_v2', []),
      conflicts: safeJSON('nexus_vanguard_conflict_intelligence', []),
      globalCorrections: safeJSON('nexus_vanguard_global_requirement_corrections', []),
      projectAlerts: safeJSON('nexus_vanguard_project_alerts', []),
      evidence: state.evidence || {},
      ccs: state.ccs || {},
      auditTrail: state.auditTrail || []
    };
  }

  function render(targetId){
    var target = document.getElementById(targetId || 'vanguard-final-export');
    if (!target) {
      target = document.createElement('section');
      target.id = targetId || 'vanguard-final-export';
      target.style.cssText = 'margin:18px 0;padding:18px;border:2px solid #111827;border-radius:14px;background:#fff;color:#111827;font-family:Arial,Helvetica,sans-serif;';
      var mount = document.querySelector('[data-vanguard-final-export-mount]') || document.querySelector('#exportContent') || document.querySelector('main') || document.body;
      mount.appendChild(target);
    }

    var data = collect();
    target.innerHTML = '<h2>NEXUS Vanguard Final Validation Package</h2>'
      + '<p><strong>Equipment:</strong> ' + escapeHTML(data.equipmentId) + '</p>'
      + '<p><strong>Generated:</strong> ' + escapeHTML(data.generatedAt) + '</p>'
      + metric('Documents', data.documents.length)
      + metric('Conflicts', data.conflicts.length)
      + metric('Corrections', data.globalCorrections.length)
      + metric('Alerts', data.projectAlerts.length);
  }

  function metric(label, value){
    return '<div style="display:inline-block;margin:6px;padding:10px;border:1px solid #d1d5db;border-radius:10px;"><strong>'+escapeHTML(label)+':</strong> '+escapeHTML(value)+'</div>';
  }

  function escapeHTML(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c];
    });
  }

  var api = {
    __installed: true,
    version: VERSION,
    collect: collect,
    render: render
  };

  window.NEXUS_VANGUARD_FINAL_EXPORT = api;
  window.VanguardFinalExport = api;
})();
