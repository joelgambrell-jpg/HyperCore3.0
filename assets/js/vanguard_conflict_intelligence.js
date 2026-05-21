/*
  assets/js/vanguard_conflict_intelligence.js
  NEXUS Vanguard Conflict Intelligence

  Purpose:
  - Deterministic conflict grouping and recommended resolution.
  - Rule: stricter / higher-rated / higher-source-authority wins by default.
*/
(function(){
  'use strict';
  if (window.NEXUS_VANGUARD_CONFLICT_INTELLIGENCE && window.NEXUS_VANGUARD_CONFLICT_INTELLIGENCE.__installed) return;

  var VERSION = '0.2.0-conflict-intelligence';
  var KEY = 'nexus_vanguard_conflict_intelligence';

  function clean(v){ return String(v == null ? '' : v).trim(); }
  function upper(v){ return clean(v).toUpperCase(); }
  function nowISO(){ return new Date().toISOString(); }

  function sourceRank(req){
    var s = upper((req && (req.sourceType || req.sourceDocument || req.documentName)) || '');
    if (s.indexOf('PROJECT') !== -1 || s.indexOf('SPEC') !== -1 || s.indexOf('AWS') !== -1) return 50;
    if (s.indexOf('OEM') !== -1 || s.indexOf('MANUFACTURER') !== -1 || s.indexOf('SUBMITTAL') !== -1) return 45;
    if (s.indexOf('DRAWING') !== -1 || s.indexOf('PRINT') !== -1) return 40;
    if (s.indexOf('SOP') !== -1 || s.indexOf('MOP') !== -1 || s.indexOf('PROCEDURE') !== -1) return 35;
    return 20;
  }

  function family(req){
    req = req || {};
    return [
      upper(req.requirementType || req.type || 'GENERAL'),
      clean(req.appliesTo || 'GENERAL').toLowerCase(),
      clean(req.units || '').toLowerCase()
    ].join('|');
  }

  function stricter(a,b){
    a = a || {};
    b = b || {};
    var av = Number(a.numericValue);
    var bv = Number(b.numericValue);
    var at = upper(a.requirementType || b.requirementType);

    if (isFinite(av) && isFinite(bv) && av !== bv) {
      if (at === 'TORQUE' || at === 'MEG') {
        return bv > av ? b : a;
      }
      return bv > av ? b : a;
    }

    var ar = sourceRank(a), br = sourceRank(b);
    if (ar !== br) return br > ar ? b : a;

    var ac = Number(a.confidence || 0), bc = Number(b.confidence || 0);
    if (ac !== bc) return bc > ac ? b : a;

    return a;
  }

  function findConflicts(requirements){
    var groups = {};
    (requirements || []).forEach(function(req){
      var key = family(req);
      groups[key] = groups[key] || [];
      groups[key].push(req);
    });

    var conflicts = [];
    Object.keys(groups).forEach(function(key){
      var group = groups[key];
      var values = {};
      group.forEach(function(req){ values[clean(req.value || req.exactText || '').toLowerCase()] = true; });
      if (Object.keys(values).length <= 1) return;

      var selected = group[0];
      for (var i=1;i<group.length;i+=1) selected = stricter(selected, group[i]);

      conflicts.push({
        id: 'CONFLICT-' + key.replace(/[^a-z0-9]+/ig,'-') + '-' + Date.now(),
        family: key,
        type: upper(group[0].requirementType || 'GENERAL'),
        status: 'REVIEW',
        message: 'Conflicting ' + upper(group[0].requirementType || 'requirement') + ' requirements detected.',
        options: group,
        selected: selected,
        rule: 'STRICTER_HIGHER_AUTHORITY_WINS',
        createdAt: nowISO()
      });
    });

    return conflicts;
  }

  function load(){
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch(e){ return []; }
  }

  function save(conflicts){
    localStorage.setItem(KEY, JSON.stringify(conflicts || []));
    try { window.dispatchEvent(new CustomEvent('vanguard:conflicts:updated', { detail: { count: (conflicts||[]).length }})); } catch(e){}
    return conflicts;
  }

  function remap(requirements){
    var conflicts = findConflicts(requirements || []);
    save(conflicts);

    if (window.VanguardProjectAlertQueue && typeof window.VanguardProjectAlertQueue.addAlert === 'function') {
      conflicts.forEach(function(c){
        window.VanguardProjectAlertQueue.addAlert({
          type: 'DOCUMENT_CONFLICT',
          severity: 'CHECK',
          title: c.message,
          message: 'Engineer review needed. Recommended value: ' + (c.selected && (c.selected.value || c.selected.exactText) || ''),
          sourceId: c.id,
          status: 'OPEN'
        });
      });
    }

    return conflicts;
  }

  var api = {
    __installed: true,
    version: VERSION,
    sourceRank: sourceRank,
    family: family,
    stricter: stricter,
    findConflicts: findConflicts,
    load: load,
    save: save,
    remap: remap
  };

  window.NEXUS_VANGUARD_CONFLICT_INTELLIGENCE = api;
  window.VanguardConflictIntelligence = api;
})();
