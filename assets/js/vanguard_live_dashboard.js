/*
  assets/js/vanguard_live_dashboard.js
  NEXUS Vanguard Live Dashboard

  Purpose:
  - Project dashboard summarizing open alerts, conflicts, evidence gaps, export readiness.
  - KISS view: counts and a central action queue.
  - Control Center cleanup keeps appended utility panels from breaking the mission-control UI.
*/
(function(){
  'use strict';
  if (window.NEXUS_VANGUARD_LIVE_DASHBOARD && window.NEXUS_VANGUARD_LIVE_DASHBOARD.__installed) return;

  var VERSION = '0.2.1-control-center-cleanup';

  function clean(v){ return String(v == null ? '' : v).trim(); }
  function escapeHTML(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c];
    });
  }

  function isControlCenter(){
    return /vanguard_control_center/i.test(String(location.pathname || '')) || !!document.getElementById('vxDropZone');
  }

  function alerts(){
    if (window.VanguardProjectAlertQueue && typeof window.VanguardProjectAlertQueue.load === 'function') {
      try { return window.VanguardProjectAlertQueue.load(); } catch(e){}
    }
    try { return JSON.parse(localStorage.getItem('nexus_vanguard_project_alerts') || '[]'); } catch(e){ return []; }
  }

  function conflicts(){
    if (window.VanguardConflictIntelligence && typeof window.VanguardConflictIntelligence.load === 'function') {
      try { return window.VanguardConflictIntelligence.load(); } catch(e){}
    }
    return [];
  }

  function targetStyle(){
    if (isControlCenter()) {
      return 'padding:14px;border-radius:18px;background:rgba(255,255,255,.045);color:#f6fbff;border:1px solid rgba(255,255,255,.11);font-family:Arial,Helvetica,sans-serif;';
    }
    return 'max-width:1180px;margin:16px auto;padding:16px;border-radius:18px;background:#fff;color:#111827;border:1px solid #d1d5db;font-family:Arial,Helvetica,sans-serif;';
  }

  function render(targetId){
    var target = document.getElementById(targetId || 'vanguard-live-dashboard');
    if (!target) {
      target = document.createElement('section');
      target.id = targetId || 'vanguard-live-dashboard';
      var mount = document.querySelector('[data-vanguard-dashboard-mount]') || document.querySelector('#centerPanelContent') || document.querySelector('main') || document.body;
      mount.appendChild(target);
    }
    target.style.cssText = targetStyle();

    var a = alerts();
    var c = conflicts();
    var open = a.filter(function(x){ return clean(x.status || 'OPEN').toUpperCase() !== 'CLOSED'; });
    var stop = open.filter(function(x){ return clean(x.severity).toUpperCase() === 'STOP'; });
    var check = open.filter(function(x){ return clean(x.severity).toUpperCase() === 'CHECK'; });
    var dark = isControlCenter();

    target.innerHTML = ''
      + '<h2 style="margin:0 0 8px;font-size:22px;">Vanguard Project Dashboard</h2>'
      + '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:12px 0;">'
      + metric('Open Alerts', open.length, dark)
      + metric('STOP', stop.length, dark)
      + metric('CHECK', check.length, dark)
      + metric('Conflicts', c.length, dark)
      + '</div>'
      + '<h3 style="margin:16px 0 8px;">Engineer Attention Queue</h3>'
      + (open.length ? open.slice(0,50).map(function(item){ return row(item, dark); }).join('') : emptyRow(dark));
  }

  function metric(label, value, dark){
    var style = dark
      ? 'padding:12px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);'
      : 'padding:12px;border-radius:14px;background:#f8fafc;border:1px solid #d1d5db;';
    var labelStyle = dark
      ? 'font-size:11px;font-weight:900;text-transform:uppercase;color:rgba(255,255,255,.78);'
      : 'font-size:11px;font-weight:900;text-transform:uppercase;color:#475569;';
    return '<div style="'+style+'"><div style="'+labelStyle+'">'+escapeHTML(label)+'</div><div style="font-size:26px;font-weight:900;">'+escapeHTML(value)+'</div></div>';
  }

  function emptyRow(dark){
    var style = dark
      ? 'padding:12px;border-radius:12px;background:rgba(51,240,163,.13);border:1px solid rgba(51,240,163,.35);font-weight:900;color:#eafff6;'
      : 'padding:12px;border-radius:12px;background:#dcfce7;font-weight:900;';
    return '<div style="'+style+'">No open project alerts.</div>';
  }

  function row(item, dark){
    var sev = clean(item.severity || 'CHECK').toUpperCase();
    var style;
    if (dark) {
      style = sev === 'STOP'
        ? 'padding:12px;margin:8px 0;border-radius:14px;background:rgba(255,106,106,.14);border:1px solid rgba(255,106,106,.45);color:#ffeaea;'
        : 'padding:12px;margin:8px 0;border-radius:14px;background:rgba(255,204,77,.13);border:1px solid rgba(255,204,77,.45);color:#fff7dd;';
    } else {
      style = 'padding:12px;margin:8px 0;border-radius:14px;background:'+(sev === 'STOP' ? '#fee2e2' : '#fef3c7')+';border:1px solid #d1d5db;';
    }
    return '<div style="'+style+'">'
      + '<strong>'+escapeHTML(sev + ' — ' + (item.title || item.type || 'Alert'))+'</strong>'
      + '<div style="margin-top:4px;">'+escapeHTML(item.message || '')+'</div>'
      + '<small>'+escapeHTML(item.equipmentId || item.sourceId || '')+'</small>'
      + '</div>';
  }

  function cleanupControlCenter(){
    if (!isControlCenter()) return;

    // The main Control Center already has a styled document intake drop zone.
    // Remove the later standalone white intake block so it cannot duplicate controls or break layout.
    var duplicateIntake = document.getElementById('vanguard-finishline-intake');
    if (duplicateIntake && duplicateIntake.parentNode) duplicateIntake.parentNode.removeChild(duplicateIntake);

    // Keep backend URL controls useful, but make them match the dark Control Center and move them into top actions.
    var backendInput = document.getElementById('vgBackendUrl');
    if (backendInput) {
      var backendPanel = backendInput.closest('div[style]');
      var topActions = document.querySelector('.top-actions');
      if (backendPanel) {
        backendPanel.id = backendPanel.id || 'vanguard-backend-url-panel';
        backendPanel.style.cssText = 'padding:12px;border-radius:16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);font-family:Arial,Helvetica,sans-serif;color:#f6fbff;';
        if (topActions && backendPanel.parentNode !== topActions) topActions.appendChild(backendPanel);
      }
      backendInput.style.cssText = 'flex:1;min-width:220px;padding:11px 12px;border:1px solid rgba(255,255,255,.18);border-radius:12px;font-size:14px;font-weight:800;background:rgba(255,255,255,.94);color:#111;';
    }

    // Replace hardcoded starting stats with honest zeroes until real local/Firebase state renders.
    var zeroIds = ['heroDocCount','heroMappedCount','heroConflictCount','statMapped','statReview','statReady','activeQueueCount','approvedToday'];
    zeroIds.forEach(function(id){
      var el = document.getElementById(id);
      if (el && /^(12|47|6|31|4|9)$/.test(clean(el.textContent))) el.textContent = '0';
    });
    var statHealth = document.getElementById('statHealth');
    if (statHealth && clean(statHealth.textContent) === '92%') statHealth.textContent = '0%';

    // Hide legacy project option names that look like fake demos on the real Control Center.
    var projectSelect = document.getElementById('projectSelect');
    if (projectSelect) {
      Array.prototype.slice.call(projectSelect.options || []).forEach(function(opt){
        if (/demo project/i.test(opt.textContent || '')) opt.textContent = 'Project Review';
      });
    }
  }

  var api = {
    __installed: true,
    version: VERSION,
    render: render,
    alerts: alerts,
    conflicts: conflicts,
    cleanupControlCenter: cleanupControlCenter
  };

  window.NEXUS_VANGUARD_LIVE_DASHBOARD = api;
  window.VanguardLiveDashboard = api;

  window.addEventListener('vanguard:project-alerts:updated', function(){ setTimeout(function(){ render(); }, 50); });
  window.addEventListener('vanguard:conflicts:updated', function(){ setTimeout(function(){ render(); }, 50); });
  window.addEventListener('vanguard:loader:complete', function(){ setTimeout(cleanupControlCenter, 0); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cleanupControlCenter);
  else cleanupControlCenter();
})();
