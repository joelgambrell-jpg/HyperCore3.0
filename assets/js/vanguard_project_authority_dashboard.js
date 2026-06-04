/*
  assets/js/vanguard_project_authority_dashboard.js
  Project Dashboard Option 3: Reviews / Stops rollup by equipment.

  Purpose:
  - Adds project-level authority visibility to dashboard/registry pages.
  - Does not change field workflow, completion percentage, or green completion states.
  - Uses Authority Engine + Adapters when loaded; falls back to local snapshots.
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.NEXUS_PROJECT_AUTHORITY_DASHBOARD && window.NEXUS_PROJECT_AUTHORITY_DASHBOARD.__installed) return;

  var VERSION = '1.0.0-project-option-3';

  function clean(v){ return String(v == null ? '' : v).trim(); }
  function esc(v){ return clean(v).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function lower(v){ return clean(v).toLowerCase(); }

  function readJSON(key, fallback){
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch(e){ return fallback; }
  }

  function getRegistryRows(){
    try {
      if (window.NEXUS_REGISTRY) {
        var project = typeof window.NEXUS_REGISTRY.getActiveProject === 'function' ? window.NEXUS_REGISTRY.getActiveProject() : '';
        if (typeof window.NEXUS_REGISTRY.listByProject === 'function') {
          var rows = window.NEXUS_REGISTRY.listByProject(project) || [];
          if (rows.length) return rows;
        }
        if (typeof window.NEXUS_REGISTRY.list === 'function') {
          var all = window.NEXUS_REGISTRY.list() || [];
          if (all.length) return all;
        }
      }
    } catch(e) {}

    var found = {};
    try {
      for (var i = 0; i < localStorage.length; i += 1) {
        var key = localStorage.key(i) || '';
        var m = key.match(/^nexus_(.+?)_step_/);
        if (m && m[1] && m[1] !== 'NO_EQ') found[m[1]] = true;
        var m2 = key.match(/^nexus_(.+?)_authority_snapshot_v1$/);
        if (m2 && m2[1] && m2[1] !== 'NO_EQ') found[m2[1]] = true;
      }
    } catch(e2) {}
    return Object.keys(found).sort().map(function(eq){ return { eq:eq, type:'equipment' }; });
  }

  function workflowProgress(eq){
    var steps = ['rif','phenolic','torque','l2','meg','prefod','fpv','ccs'];
    var complete = 0;
    steps.forEach(function(step){
      var done = false;
      if (step === 'ccs') done = localStorage.getItem('nexus_' + eq + '_ccs_signed_off') === '1' || localStorage.getItem('nexus_' + eq + '_step_ccs') === '1';
      else if (step === 'meg') done = localStorage.getItem('nexus_' + eq + '_step_meg') === '1' || (localStorage.getItem('nexus_' + eq + '_step_megohmmeter_line') === '1' && localStorage.getItem('nexus_' + eq + '_step_megohmmeter_load') === '1');
      else if (step === 'fpv') done = localStorage.getItem('nexus_' + eq + '_step_fpv') === '1' || localStorage.getItem('nexus_' + eq + '_step_fpv_photo') === '1';
      else done = localStorage.getItem('nexus_' + eq + '_step_' + step) === '1';
      if (done) complete += 1;
    });
    return { complete:complete, total:steps.length, percent:steps.length ? Math.round((complete / steps.length) * 100) : 0, remaining:Math.max(0, steps.length - complete) };
  }

  function runAuthority(eq){
    var adapters = window.NEXUS_VANGUARD_AUTHORITY_ADAPTERS || window.VanguardAuthorityAdapters;
    if (adapters && typeof adapters.runAuthority === 'function') {
      try { return adapters.runAuthority(eq); } catch(e) {}
    }
    return readJSON('nexus_' + eq + '_authority_snapshot_v1', readJSON('nexus_vanguard_authority_' + eq, null));
  }

  function classify(result){
    var issues = Array.isArray(result && result.issues) ? result.issues : [];
    var reviews = 0;
    var stops = 0;
    issues.forEach(function(issue){
      var sev = clean(issue.severity).toUpperCase();
      if (sev === 'BLOCKER') stops += 1;
      else if (sev === 'REVIEW') reviews += 1;
    });
    return { reviews:reviews, stops:stops };
  }

  function ensureStyle(){
    if (document.getElementById('nexus-project-authority-style')) return;
    var style = document.createElement('style');
    style.id = 'nexus-project-authority-style';
    style.textContent = ''
      + '#nexusProjectAuthority{margin:16px 0;padding:16px;border-radius:18px;background:rgba(0,0,0,.24);border:1px solid rgba(255,255,255,.18);color:#fff;}'
      + '.nx-pa-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px;}'
      + '.nx-pa-title{font-size:18px;font-weight:1000;}'
      + '.nx-pa-sub{margin-top:4px;font-size:12px;font-weight:850;opacity:.86;line-height:1.35;}'
      + '.nx-pa-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:12px 0;}'
      + '@media(max-width:900px){.nx-pa-cards{grid-template-columns:1fr 1fr;}}'
      + '.nx-pa-card{padding:12px;border-radius:14px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);}'
      + '.nx-pa-card b{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.8;margin-bottom:6px;}'
      + '.nx-pa-card span{font-size:20px;font-weight:1000;}'
      + '.nx-pa-table-wrap{overflow:auto;border-radius:14px;border:1px solid rgba(255,255,255,.14);}'
      + '.nx-pa-table{width:100%;border-collapse:collapse;font-size:12px;min-width:680px;}'
      + '.nx-pa-table th,.nx-pa-table td{padding:10px;border-bottom:1px solid rgba(255,255,255,.12);text-align:left;vertical-align:middle;}'
      + '.nx-pa-table th{background:rgba(255,255,255,.08);font-size:11px;text-transform:uppercase;letter-spacing:.06em;}'
      + '.nx-pa-pill{display:inline-flex;align-items:center;justify-content:center;min-width:34px;padding:5px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.18);font-weight:1000;}'
      + '.nx-pa-pill.clear{color:#eafff1;border-color:rgba(45,255,155,.45);}.nx-pa-pill.review{color:#fff4cc;border-color:rgba(255,184,0,.65);}.nx-pa-pill.stop{color:#ffe5e5;border-color:rgba(255,91,91,.75);}'
      + '.nx-pa-link{color:#7be6ff;font-weight:1000;text-decoration:none;}'
      + '@media print{#nexusProjectAuthority{display:none!important;}}';
    document.head.appendChild(style);
  }

  function host(){
    return document.querySelector('.shell') || document.querySelector('.wrap') || document.body;
  }

  function ensurePanel(){
    ensureStyle();
    var panel = document.getElementById('nexusProjectAuthority');
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = 'nexusProjectAuthority';
    var h = host();
    if (h && h.firstChild) h.insertBefore(panel, h.firstChild);
    else document.body.appendChild(panel);
    return panel;
  }

  function render(){
    var isRegistry = /index_equipment_registry/i.test(location.pathname || '') || !!document.getElementById('registrySelect');
    if (!isRegistry) return;
    var rows = getRegistryRows();
    var summaries = rows.map(function(row){
      var eq = clean(row.eq || row.equipment || row.id || '');
      var progress = workflowProgress(eq);
      var authority = runAuthority(eq);
      var counts = classify(authority);
      return { row:row, eq:eq, progress:progress, authority:authority, reviews:counts.reviews, stops:counts.stops };
    }).filter(function(x){ return x.eq; });

    var panel = ensurePanel();
    var total = summaries.length;
    var readyTurnover = summaries.filter(function(s){ return s.progress.remaining === 0; }).length;
    var readyEnergization = summaries.filter(function(s){ return s.progress.remaining === 0 && s.stops === 0; }).length;
    var reviewTotal = summaries.reduce(function(sum,s){ return sum + s.reviews; }, 0);
    var stopTotal = summaries.reduce(function(sum,s){ return sum + s.stops; }, 0);

    panel.innerHTML = ''
      + '<div class="nx-pa-head"><div><div class="nx-pa-title">Project Authority Rollup</div><div class="nx-pa-sub">Dashboard view only. Field users still use progress percentage and green completion buttons.</div></div></div>'
      + '<div class="nx-pa-cards">'
      + '<div class="nx-pa-card"><b>Equipment Total</b><span>' + total + '</span></div>'
      + '<div class="nx-pa-card"><b>Ready For Turnover</b><span>' + readyTurnover + '</span></div>'
      + '<div class="nx-pa-card"><b>Review Items</b><span>' + reviewTotal + '</span></div>'
      + '<div class="nx-pa-card"><b>Stop Items</b><span>' + stopTotal + '</span></div>'
      + '</div>'
      + '<div class="nx-pa-table-wrap"><table class="nx-pa-table"><thead><tr><th>Equipment</th><th>Type</th><th>Progress</th><th>Reviews</th><th>Stops</th><th>Open</th></tr></thead><tbody>'
      + (summaries.length ? summaries.map(function(s){
        return '<tr>'
          + '<td><b>' + esc(s.eq) + '</b></td>'
          + '<td>' + esc(s.row.type || s.row.equipmentType || 'equipment') + '</td>'
          + '<td>' + s.progress.percent + '% (' + s.progress.complete + '/' + s.progress.total + ')</td>'
          + '<td><span class="nx-pa-pill ' + (s.reviews ? 'review' : 'clear') + '">' + s.reviews + '</span></td>'
          + '<td><span class="nx-pa-pill ' + (s.stops ? 'stop' : 'clear') + '">' + s.stops + '</span></td>'
          + '<td><a class="nx-pa-link" href="equipment.html?eq=' + encodeURIComponent(s.eq) + '">Open</a></td>'
          + '</tr>';
      }).join('') : '<tr><td colspan="6">No equipment records detected yet.</td></tr>')
      + '</tbody></table></div>';
  }

  function install(){
    render();
    window.addEventListener('storage', render);
    window.addEventListener('focus', render);
    window.addEventListener('pageshow', render);
    window.addEventListener('vanguard:authority-adapter:updated', render);
    window.addEventListener('nexus-workflow-change', render);
    setInterval(render, 7000);
  }

  window.NEXUS_PROJECT_AUTHORITY_DASHBOARD = { __installed:true, version:VERSION, render:render };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
