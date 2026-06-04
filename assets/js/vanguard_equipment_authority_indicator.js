/*
  assets/js/vanguard_equipment_authority_indicator.js
  Equipment Page Option 2: small expandable Authority issue chip.

  Field UI rule:
  - Do not compete with existing green completion indicators.
  - Only surface Reviews/Stops when they exist.
  - Stops only mean field-blocking items from the Authority Engine:
      process incomplete OR FAIL without notation.
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.NEXUS_EQUIPMENT_AUTHORITY_INDICATOR && window.NEXUS_EQUIPMENT_AUTHORITY_INDICATOR.__installed) return;

  var VERSION = '1.0.0-equipment-option-2';

  function clean(v){ return String(v == null ? '' : v).trim(); }
  function lower(v){ return clean(v).toLowerCase(); }
  function esc(v){ return clean(v).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }

  function getEq(){
    try {
      if (window.NEXUS && typeof window.NEXUS.getEq === 'function') {
        var nx = clean(window.NEXUS.getEq());
        if (nx) return nx;
      }
    } catch(e) {}
    try {
      var p = new URLSearchParams(location.search);
      var q = clean(p.get('eq') || p.get('equipment') || p.get('equipmentId'));
      if (q) return q;
    } catch(e2) {}
    return clean(localStorage.getItem('nexus_active_equipment') || localStorage.getItem('nexus_active_eq') || 'NO_EQ') || 'NO_EQ';
  }

  function ensureStyle(){
    if (document.getElementById('nexus-equipment-authority-style')) return;
    var style = document.createElement('style');
    style.id = 'nexus-equipment-authority-style';
    style.textContent = ''
      + '#nexusEquipmentAuthority{margin:10px 0 14px;border-radius:16px;border:1px solid rgba(255,255,255,.20);background:rgba(0,0,0,.22);overflow:hidden;color:#fff;}'
      + '.nx-auth-summary{width:100%;min-height:46px;border:0;background:transparent;color:#fff;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;cursor:pointer;font-weight:1000;text-align:left;}'
      + '.nx-auth-summary span{display:inline-flex;align-items:center;gap:8px;}'
      + '.nx-auth-pill{padding:7px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.08);font-size:12px;white-space:nowrap;}'
      + '.nx-auth-pill.clear{border-color:rgba(45,255,155,.45);color:#eafff1;}'
      + '.nx-auth-pill.review{border-color:rgba(255,184,0,.65);color:#fff4cc;}'
      + '.nx-auth-pill.stop{border-color:rgba(255,91,91,.75);color:#ffe5e5;}'
      + '.nx-auth-details{display:none;padding:0 12px 12px;border-top:1px solid rgba(255,255,255,.14);}'
      + '#nexusEquipmentAuthority.open .nx-auth-details{display:block;}'
      + '.nx-auth-list{display:grid;gap:8px;margin-top:10px;}'
      + '.nx-auth-item{padding:9px 10px;border-radius:12px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);font-size:12px;font-weight:850;line-height:1.35;}'
      + '.nx-auth-item.stop{border-color:rgba(255,91,91,.35);background:rgba(255,91,91,.12);}'
      + '.nx-auth-item.review{border-color:rgba(255,184,0,.30);background:rgba(255,184,0,.10);}'
      + '.nx-auth-muted{font-size:12px;opacity:.84;font-weight:850;margin-top:8px;line-height:1.35;}'
      + '@media print{#nexusEquipmentAuthority{display:none!important;}}';
    document.head.appendChild(style);
  }

  function getAuthorityResult(eq){
    var adapters = window.NEXUS_VANGUARD_AUTHORITY_ADAPTERS || window.VanguardAuthorityAdapters;
    if (adapters && typeof adapters.runAuthority === 'function') {
      try { return adapters.runAuthority(eq); } catch(e) {}
    }
    try {
      var raw = localStorage.getItem('nexus_vanguard_authority_' + eq) || localStorage.getItem('nexus_' + eq + '_authority_snapshot_v1');
      return raw ? JSON.parse(raw) : null;
    } catch(e2) { return null; }
  }

  function classifyIssues(result){
    var issues = Array.isArray(result && result.issues) ? result.issues : [];
    var stops = [];
    var reviews = [];
    issues.forEach(function(issue){
      var sev = clean(issue.severity).toUpperCase();
      var code = clean(issue.code);
      var msg = clean(issue.message || code || 'Authority item');
      var item = { code:code, message:msg, raw:issue };
      if (sev === 'BLOCKER') stops.push(item);
      else if (sev === 'REVIEW') reviews.push(item);
    });
    return { stops:stops, reviews:reviews };
  }

  function host(){
    return document.querySelector('.progress-wrap') || document.querySelector('.goal-card') || document.querySelector('.card') || document.body;
  }

  function ensurePanel(){
    ensureStyle();
    var panel = document.getElementById('nexusEquipmentAuthority');
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = 'nexusEquipmentAuthority';
    panel.innerHTML = '<button class="nx-auth-summary" type="button"><span id="nxAuthTitle">✓ No Open Issues</span><span class="nx-auth-pill clear" id="nxAuthPill">Clear</span></button><div class="nx-auth-details" id="nxAuthDetails"></div>';
    var h = host();
    if (h && h.parentNode && h.classList && h.classList.contains('progress-wrap')) h.parentNode.insertBefore(panel, h.nextSibling);
    else if (h && h.firstChild) h.insertBefore(panel, h.firstChild);
    else document.body.appendChild(panel);
    panel.querySelector('.nx-auth-summary').addEventListener('click', function(){ panel.classList.toggle('open'); });
    return panel;
  }

  function render(){
    if (!/equipment\.html/i.test(location.pathname || '') && !document.getElementById('progressFill')) return;
    var eq = getEq();
    var result = getAuthorityResult(eq);
    var panel = ensurePanel();
    var title = panel.querySelector('#nxAuthTitle');
    var pill = panel.querySelector('#nxAuthPill');
    var details = panel.querySelector('#nxAuthDetails');
    var classified = classifyIssues(result);
    var stops = classified.stops;
    var reviews = classified.reviews;

    if (!stops.length && !reviews.length) {
      title.textContent = '✓ No Open Issues';
      pill.textContent = 'Clear';
      pill.className = 'nx-auth-pill clear';
      details.innerHTML = '<div class="nx-auth-muted">Authority is clear. Existing completion percentage and green step buttons remain the main field workflow.</div>';
      panel.classList.remove('open');
      return;
    }

    var label = stops.length ? ('🛑 ' + stops.length + ' Stop Item' + (stops.length === 1 ? '' : 's')) : ('⚠ ' + reviews.length + ' Review Item' + (reviews.length === 1 ? '' : 's'));
    if (stops.length && reviews.length) label += ' • ⚠ ' + reviews.length + ' Review';
    title.textContent = label;
    pill.textContent = stops.length ? 'Stops: ' + stops.length : 'Reviews: ' + reviews.length;
    pill.className = 'nx-auth-pill ' + (stops.length ? 'stop' : 'review');

    var html = '';
    if (stops.length) {
      html += '<div class="nx-auth-muted">Stops mean field-blocking items: process incomplete or FAIL without notation.</div><div class="nx-auth-list">' + stops.slice(0,8).map(function(i){ return '<div class="nx-auth-item stop"><b>Stop:</b> ' + esc(i.message) + '</div>'; }).join('') + '</div>';
    }
    if (reviews.length) {
      html += '<div class="nx-auth-muted">Reviews do not stop field work. They stay visible for engineer/supervisor follow-up.</div><div class="nx-auth-list">' + reviews.slice(0,8).map(function(i){ return '<div class="nx-auth-item review"><b>Review:</b> ' + esc(i.message) + '</div>'; }).join('') + '</div>';
    }
    details.innerHTML = html;
  }

  function install(){
    render();
    window.addEventListener('storage', render);
    window.addEventListener('focus', render);
    window.addEventListener('pageshow', render);
    window.addEventListener('vanguard:authority-adapter:updated', render);
    window.addEventListener('nexus-workflow-change', render);
    setInterval(render, 5000);
  }

  window.NEXUS_EQUIPMENT_AUTHORITY_INDICATOR = { __installed:true, version:VERSION, render:render };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
