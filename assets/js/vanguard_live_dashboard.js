/*
  assets/js/vanguard_live_dashboard.js
  NEXUS Vanguard Live Dashboard

  Purpose:
  - Project dashboard summarizing open alerts, conflicts, evidence gaps, export readiness.
  - KISS view: counts and a central action queue.
*/
(function(){
  'use strict';
  if (window.NEXUS_VANGUARD_LIVE_DASHBOARD && window.NEXUS_VANGUARD_LIVE_DASHBOARD.__installed) return;

  var VERSION = '0.2.0-live-dashboard';

  function clean(v){ return String(v == null ? '' : v).trim(); }
  function escapeHTML(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c];
    });
  }

  function alerts(){
    if (window.VanguardProjectAlertQueue && typeof window.VanguardProjectAlertQueue.load === 'function') {
      try { return window.VanguardProjectAlertQueue.load(); } catch(e){}
    }
    try { return JSON.parse(localStorage.getItem('nexus_vanguard_project_alerts') || '[]'); } catch(e){ return []; }
  }

  function conflicts(){
    if (window.VanguardConflictIntelligence && typeof window.VanguardConflictIntelligence.load === 'function') {
      return window.VanguardConflictIntelligence.load();
    }
    return [];
  }

  function render(targetId){
    var target = document.getElementById(targetId || 'vanguard-live-dashboard');
    if (!target) {
      target = document.createElement('section');
      target.id = targetId || 'vanguard-live-dashboard';
      target.style.cssText = 'max-width:1180px;margin:16px auto;padding:16px;border-radius:18px;background:#fff;color:#111827;border:1px solid #d1d5db;font-family:Arial,Helvetica,sans-serif;';
      var mount = document.querySelector('[data-vanguard-dashboard-mount]') || document.querySelector('main') || document.body;
      mount.appendChild(target);
    }

    var a = alerts();
    var c = conflicts();
    var open = a.filter(function(x){ return clean(x.status || 'OPEN') !== 'CLOSED'; });
    var stop = open.filter(function(x){ return clean(x.severity).toUpperCase() === 'STOP'; });
    var check = open.filter(function(x){ return clean(x.severity).toUpperCase() === 'CHECK'; });

    target.innerHTML = ''
      + '<h2 style="margin:0 0 8px;font-size:22px;">Vanguard Project Dashboard</h2>'
      + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:12px 0;">'
      + metric('Open Alerts', open.length)
      + metric('STOP', stop.length)
      + metric('CHECK', check.length)
      + metric('Conflicts', c.length)
      + '</div>'
      + '<h3 style="margin:16px 0 8px;">Engineer Attention Queue</h3>'
      + (open.length ? open.slice(0,50).map(row).join('') : '<div style="padding:12px;border-radius:12px;background:#dcfce7;font-weight:900;">No open project alerts.</div>');
  }

  function metric(label, value){
    return '<div style="padding:12px;border-radius:14px;background:#f8fafc;border:1px solid #d1d5db;"><div style="font-size:11px;font-weight:900;text-transform:uppercase;color:#475569;">'+escapeHTML(label)+'</div><div style="font-size:26px;font-weight:900;">'+escapeHTML(value)+'</div></div>';
  }

  function row(item){
    var sev = clean(item.severity || 'CHECK').toUpperCase();
    var color = sev === 'STOP' ? '#fee2e2' : '#fef3c7';
    return '<div style="padding:12px;margin:8px 0;border-radius:14px;background:'+color+';border:1px solid #d1d5db;">'
      + '<strong>'+escapeHTML(sev + ' — ' + (item.title || item.type || 'Alert'))+'</strong>'
      + '<div style="margin-top:4px;">'+escapeHTML(item.message || '')+'</div>'
      + '<small>'+escapeHTML(item.equipmentId || item.sourceId || '')+'</small>'
      + '</div>';
  }

  var api = {
    __installed: true,
    version: VERSION,
    render: render,
    alerts: alerts,
    conflicts: conflicts
  };

  window.NEXUS_VANGUARD_LIVE_DASHBOARD = api;
  window.VanguardLiveDashboard = api;

  window.addEventListener('vanguard:project-alerts:updated', function(){ setTimeout(function(){ render(); }, 50); });
  window.addEventListener('vanguard:conflicts:updated', function(){ setTimeout(function(){ render(); }, 50); });
})();
