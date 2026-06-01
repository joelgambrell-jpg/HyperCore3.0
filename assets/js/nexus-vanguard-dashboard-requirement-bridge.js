/*
  assets/js/nexus-vanguard-dashboard-requirement-bridge.js
  Bridges existing Vanguard dashboard engines to the NEXUS_REQUIREMENTS library.
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;

  var VERSION = '1.0.0';
  var PANEL_ID = 'nexusRequirementReviewPanel';

  function lib(){ return window.NEXUS_REQUIREMENTS || null; }
  function now(){ return new Date().toISOString(); }
  function text(v){ return String(v == null ? '' : v).trim(); }
  function parse(raw, fallback){ try { return raw ? JSON.parse(raw) : fallback; } catch(e){ return fallback; } }
  function currentUser(){
    try { return parse(localStorage.getItem('nexus_current_user'), {}) || {}; } catch(e){ return {}; }
  }
  function pending(){ return lib() && lib().query ? lib().query({ state:'review' }) : []; }
  function approved(){ return lib() && lib().query ? lib().query({ approved:true }) : []; }
  function enforceable(){ return lib() && lib().query ? lib().query({ enforce:true }) : []; }

  function reject(ids, reason){
    ids = Array.isArray(ids) ? ids : [ids];
    var l = lib();
    if (!l || !l.load || !l.save) return 0;
    var set = new Set(ids.map(text));
    var data = l.load();
    var user = currentUser();
    var count = 0;
    data.requirements.forEach(function(r){
      if (set.has(r.id)) {
        r.state = 'rejected';
        r.approved = false;
        r.enforce = false;
        r.rejectedAt = now();
        r.rejectedBy = user.displayName || user.email || 'Engineer';
        r.rejectionReason = reason || 'Rejected during Vanguard review.';
        r.updatedAt = now();
        count++;
      }
    });
    l.save(data);
    window.dispatchEvent(new CustomEvent('nexus:vanguard-requirements-rejected', { detail:{ ids:ids, count:count, reason:reason || '' } }));
    render();
    return count;
  }

  function approve(ids){
    var user = currentUser();
    var count = lib() && lib().approve ? lib().approve(ids, { approvedBy:user.displayName || user.email || 'Engineer', user:user.displayName || user.email || 'Engineer' }) : 0;
    window.dispatchEvent(new CustomEvent('nexus:vanguard-requirements-approved', { detail:{ ids:Array.isArray(ids)?ids:[ids], count:count } }));
    render();
    return count;
  }

  function getDashboardData(){
    return {
      version:VERSION,
      generatedAt:now(),
      pending:pending(),
      approved:approved(),
      enforceable:enforceable(),
      counts:{ pending:pending().length, approved:approved().length, enforceable:enforceable().length }
    };
  }

  function exposeToExistingEngines(){
    var api = {
      version:VERSION,
      pending:pending,
      approved:approved,
      enforceable:enforceable,
      approve:approve,
      reject:reject,
      getDashboardData:getDashboardData,
      render:render
    };
    window.NEXUS_VANGUARD_DASHBOARD_REQUIREMENTS = api;
    window.NEXUS_VANGUARD = window.NEXUS_VANGUARD || {};
    window.NEXUS_VANGUARD.requirementReview = api;
    if (window.VanguardDashboard && typeof window.VanguardDashboard === 'object') window.VanguardDashboard.requirements = api;
    if (window.vanguardDashboard && typeof window.vanguardDashboard === 'object') window.vanguardDashboard.requirements = api;
    if (window.VanguardCore && typeof window.VanguardCore === 'object') window.VanguardCore.requirementReview = api;
    if (window.vanguardCore && typeof window.vanguardCore === 'object') window.vanguardCore.requirementReview = api;
  }

  function escapeHtml(s){
    return text(s).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; });
  }

  function render(){
    if (!document.body) return;
    var items = pending();
    var panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = PANEL_ID;
      panel.style.cssText = 'margin:16px auto;padding:14px;border-radius:16px;border:1px solid rgba(125,211,252,.55);background:rgba(8,18,36,.88);color:#e0f2fe;max-width:1180px;font-family:Arial,Helvetica,sans-serif;box-shadow:0 10px 28px rgba(0,0,0,.25);';
      var mount = document.querySelector('main') || document.querySelector('.wrap') || document.querySelector('.container') || document.body;
      if (mount.firstChild) mount.insertBefore(panel, mount.firstChild); else mount.appendChild(panel);
    }
    var html = '<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;">' +
      '<div><b style="font-size:18px;">Vanguard Requirement Review</b><div style="font-size:13px;opacity:.9;">Pending extracted requirements: ' + items.length + ' | Approved: ' + approved().length + ' | Enforced: ' + enforceable().length + '</div></div>' +
      '<button type="button" id="nexusReqRefreshBtn" style="padding:8px 10px;border:0;border-radius:10px;font-weight:900;background:#38bdf8;color:#03121f;cursor:pointer;">Refresh</button>' +
      '</div>';
    if (!items.length) {
      html += '<div style="margin-top:10px;padding:10px;border-radius:12px;background:rgba(255,255,255,.08);">No extracted requirements are waiting for review.</div>';
    } else {
      html += '<div style="display:grid;gap:10px;margin-top:12px;">' + items.slice(0,25).map(function(r){
        return '<div style="padding:10px;border-radius:12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);">' +
          '<div style="font-weight:900;">' + escapeHtml(r.title || r.type || 'Requirement') + '</div>' +
          '<div style="font-size:13px;opacity:.95;">' + escapeHtml(r.text || '') + '</div>' +
          '<div style="font-size:12px;opacity:.82;margin-top:4px;">Type: ' + escapeHtml(r.type) + ' | Value: ' + escapeHtml(r.value) + ' ' + escapeHtml(r.unit) + ' | Source: ' + escapeHtml(r.sourceName) + ' | Confidence: ' + Math.round((Number(r.confidence)||0)*100) + '%</div>' +
          '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">' +
          '<button type="button" data-approve="' + escapeHtml(r.id) + '" style="padding:7px 9px;border:0;border-radius:9px;background:#22c55e;color:#04210f;font-weight:900;cursor:pointer;">Approve / Enforce</button>' +
          '<button type="button" data-reject="' + escapeHtml(r.id) + '" style="padding:7px 9px;border:0;border-radius:9px;background:#f97316;color:#240a02;font-weight:900;cursor:pointer;">Reject</button>' +
          '</div></div>';
      }).join('') + '</div>';
    }
    panel.innerHTML = html;
    var refresh = document.getElementById('nexusReqRefreshBtn');
    if (refresh) refresh.onclick = render;
    panel.querySelectorAll('[data-approve]').forEach(function(btn){ btn.onclick = function(){ approve(btn.getAttribute('data-approve')); }; });
    panel.querySelectorAll('[data-reject]').forEach(function(btn){ btn.onclick = function(){ var reason = prompt('Reason for rejection?', 'Not approved for field enforcement.'); reject(btn.getAttribute('data-reject'), reason || 'Rejected.'); }; });
  }

  function init(){ exposeToExistingEngines(); render(); }
  window.addEventListener('nexus:vanguard-requirements-updated', function(){ exposeToExistingEngines(); render(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
