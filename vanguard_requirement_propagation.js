/*
  assets/js/vanguard_requirement_propagation.js
  NEXUS Vanguard Requirement Propagation

  Purpose:
  - Engineer corrects once; affected equipment/templates can refresh.
  - Browser/local implementation with Firebase hook points.
*/
(function(){
  'use strict';
  if (window.NEXUS_VANGUARD_REQUIREMENT_PROPAGATION && window.NEXUS_VANGUARD_REQUIREMENT_PROPAGATION.__installed) return;

  var VERSION = '0.2.0-requirement-propagation';
  var KEY = 'nexus_vanguard_global_requirement_corrections';

  function clean(v){ return String(v == null ? '' : v).trim(); }
  function nowISO(){ return new Date().toISOString(); }

  function load(){
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch(e){ return []; }
  }

  function save(items){
    localStorage.setItem(KEY, JSON.stringify(items || []));
    try { window.dispatchEvent(new CustomEvent('vanguard:requirements:propagated', { detail: { count: (items||[]).length }})); } catch(e){}
    return items;
  }

  function appliesToEquipment(correction, equipment){
    if (!correction) return false;
    if (!correction.scope || correction.scope === 'PROJECT') return true;
    if (correction.scope === 'EQUIPMENT_TYPE') return clean(correction.equipmentType).toLowerCase() === clean(equipment && equipment.type).toLowerCase();
    if (correction.scope === 'EQUIPMENT_LIST') return (correction.equipmentIds || []).indexOf(equipment && equipment.id) !== -1;
    return false;
  }

  function addCorrection(correction){
    var items = load();
    var item = Object.assign({
      id: 'GCORR-' + Date.now(),
      scope: 'PROJECT',
      status: 'ACTIVE',
      createdAt: nowISO(),
      createdBy: 'ENGINEER',
      reason: ''
    }, correction || {});
    items.push(item);
    save(items);

    if (window.VanguardGlobalCorrections && typeof window.VanguardGlobalCorrections.addCorrection === 'function') {
      try { window.VanguardGlobalCorrections.addCorrection(item); } catch(e){}
    }

    return item;
  }

  function getActiveForEquipment(equipment){
    return load().filter(function(item){
      return item.status !== 'VOID' && appliesToEquipment(item, equipment || {});
    });
  }

  function applyToState(state){
    if (!state) return state;
    var equipment = state.equipment || { id: state.equipmentId, type: state.equipmentType };
    var corrections = getActiveForEquipment(equipment);
    state.appliedGlobalCorrections = corrections;
    return state;
  }

  var api = {
    __installed: true,
    version: VERSION,
    load: load,
    save: save,
    addCorrection: addCorrection,
    getActiveForEquipment: getActiveForEquipment,
    applyToState: applyToState
  };

  window.NEXUS_VANGUARD_REQUIREMENT_PROPAGATION = api;
  window.VanguardRequirementPropagation = api;
})();
