/*
  assets/js/vanguard_ipad_ux_hardening.js
  NEXUS Vanguard iPad UX Hardening

  Purpose:
  - Additive touch/readability improvements.
  - Does not darken pages or replace existing UI.
*/
(function(){
  'use strict';
  if (window.NEXUS_VANGUARD_IPAD_UX && window.NEXUS_VANGUARD_IPAD_UX.__installed) return;

  var VERSION = '0.2.0-ipad-ux-hardening';

  function inject(){
    if (document.getElementById('vanguard-ipad-ux-style')) return;
    var style = document.createElement('style');
    style.id = 'vanguard-ipad-ux-style';
    style.textContent = ''
      + '.nexus-touch button,.nexus-touch .btn,.nexus-touch input[type="button"],.nexus-touch input[type="submit"]{min-height:44px;touch-action:manipulation;}'
      + '.nexus-touch input,.nexus-touch select,.nexus-touch textarea{font-size:16px;}'
      + '.nexus-readable-card{border-radius:14px;padding:12px;border:1px solid rgba(0,0,0,.12);background:rgba(255,255,255,.92);}'
      + '.nexus-status-good{background:#dcfce7!important;color:#14532d!important;}'
      + '.nexus-status-check{background:#fef3c7!important;color:#78350f!important;}'
      + '.nexus-status-stop{background:#fee2e2!important;color:#7f1d1d!important;}'
      + '@media(max-width:900px){body{font-size:16px;} table{font-size:14px;} .hide-on-ipad{display:none!important;}}';
    document.head.appendChild(style);
    document.documentElement.classList.add('nexus-touch');
  }

  function refresh(){ inject(); }

  var api = { __installed: true, version: VERSION, refresh: refresh };
  window.NEXUS_VANGUARD_IPAD_UX = api;
  window.VanguardIpadUX = api;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh);
  else refresh();
})();
