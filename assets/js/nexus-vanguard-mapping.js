/* assets/js/nexus-vanguard-mapping.js
   Compatibility shim for older pages expecting a Vanguard mapping helper. */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_MAPPING && window.NEXUS_VANGUARD_MAPPING.__installed) return;
  function clean(v){ return String(v == null ? '' : v).trim(); }
  function readJSON(k,f){ try{ var r=localStorage.getItem(k); return r ? JSON.parse(r) : f; }catch(e){ return f; } }
  function writeJSON(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch(e){ return false; } }
  function key(eq){ return 'nexus_' + clean(eq) + '_vanguard_requirements'; }
  function get(eq){ return readJSON(key(eq), null) || readJSON('nexus_vanguard_requirement_' + clean(eq), null); }
  function set(eq, payload){ writeJSON(key(eq), payload || {}); return payload || {}; }
  function mapToEquipment(eq, payload){ return set(eq, payload); }
  var api={__installed:true,get:get,set:set,mapToEquipment:mapToEquipment};
  window.NEXUS_VANGUARD_MAPPING=api;
  window.VanguardMapping=api;
  window.NEXUS=window.NEXUS||{};
  window.NEXUS.VanguardMapping=api;
})();
