/*
  assets/js/nexus-ccs-ai-integration.js
  CCS Import -> Nexus Vanguard AI integration

  Additive integration only:
  - Does not replace the existing CCS engine.
  - Reads the current imported/default CCS state from localStorage.
  - Sends checklist context through the canonical Vanguard AI bridge/client.
  - Stores mappings/validation results locally and through Firebase bridge when available.
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;

  var VERSION = '1.0.0';
  var panelId = 'nexusCcsAiPanel';

  function qs(){ try { return new URLSearchParams(location.search); } catch(e){ return new URLSearchParams(''); } }
  function eq(){
    return (qs().get('eq') || localStorage.getItem('nexus_active_equipment') || localStorage.getItem('nexus_active_eq') || 'NO_EQ').trim() || 'NO_EQ';
  }
  function key(){ return 'nexus_' + eq() + '_ccs_two_tab_v1'; }
  function exportKey(){ return 'nexus_' + eq() + '_ccs_vanguard_export'; }
  function aiKey(){ return 'nexus_' + eq() + '_ccs_ai_analysis_v1'; }
  function now(){ return new Date().toISOString(); }
  function parse(raw, fallback){ try { return raw ? JSON.parse(raw) : fallback; } catch(e){ return fallback; } }
  function readState(){ return parse(localStorage.getItem(key()), null) || parse(localStorage.getItem(exportKey()), null) || null; }
  function text(v){ return String(v == null ? '' : v); }

  function getSteps(state){
    if (!state) return [];
    if (Array.isArray(state.steps)) return state.steps;
    if (state.checklist && Array.isArray(state.checklist.steps)) return state.checklist.steps;
    return [];
  }

  function getRequirementsFromStorage(){
    var out = [];
    try {
      Object.keys(localStorage).forEach(function(k){
        if (!/^nexus_doc_/.test(k) && k.indexOf('vanguard') === -1) return;
        var v = parse(localStorage.getItem(k), null);
        if (v && Array.isArray(v.requirements)) out = out.concat(v.requirements);
        if (v && v.payload && Array.isArray(v.payload.requirements)) out = out.concat(v.payload.requirements);
      });
    } catch(e) {}
    var seen = new Set();
    return out.filter(function(r){
      var id = r.id || [r.type, r.value, r.unit, r.text].join('|');
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function stepLabel(step){
    return text(step.title || step.name || step.label || step.description || step.id || step.step || 'Checklist Step');
  }

  function buildPayload(){
    var state = readState();
    var steps = getSteps(state).map(function(s, i){
      return {
        index:i,
        id:s.id || s.stepId || s.step || ('CCS-' + String(i+1).padStart(3,'0')),
        label:stepLabel(s),
        title:s.title || s.name || '',
        description:s.description || s.desc || s.notes || '',
        status:s.status || '',
        source:s.source || '',
        references:s.references || s.refs || []
      };
    });
    return {
      eq:eq(),
      page:'construction_check_sheet_import.html',
      state:state,
      steps:steps,
      requirements:getRequirementsFromStorage(),
      generatedAt:now()
    };
  }

  function saveAnalysis(result){
    var payload = {
      eq:eq(),
      page:'construction_check_sheet_import.html',
      version:VERSION,
      updatedAt:now(),
      result:result
    };
    try { localStorage.setItem(aiKey(), JSON.stringify(payload)); } catch(e) {}
    try {
      if (window.NEXUS_OFFLINE && typeof window.NEXUS_OFFLINE.saveLocal === 'function') {
        window.NEXUS_OFFLINE.saveLocal('ccs/' + eq() + '/ai-analysis', payload, 'ccs-ai-integration');
      }
      if (window.NEXUS_FIREBASE && typeof window.NEXUS_FIREBASE.save === 'function') {
        window.NEXUS_FIREBASE.save('ccs/' + eq() + '/ai-analysis', payload);
      }
    } catch(e) {}
    window.dispatchEvent(new CustomEvent('nexus:ccs-ai-analysis-saved', { detail:payload }));
    return payload;
  }

  function renderPanel(){
    if (document.getElementById(panelId)) return;
    var target = document.getElementById('dropZone') || document.querySelector('.tools') || document.body;
    if (!target || !target.parentNode) return;
    var panel = document.createElement('div');
    panel.id = panelId;
    panel.style.cssText = 'margin-top:10px;padding:12px;border-radius:14px;border:1px solid rgba(125,211,252,.55);background:rgba(8,18,36,.82);color:#e0f2fe;display:grid;gap:8px;font-family:Arial,Helvetica,sans-serif;';
    panel.innerHTML = '<div style="font-weight:900;font-size:15px;">NEXUS Vanguard AI</div>' +
      '<div id="nexusCcsAiStatus" style="font-size:13px;line-height:1.35;opacity:.95;">Ready to map checklist requirements.</div>' +
      '<button id="nexusCcsAiAnalyzeBtn" type="button" style="padding:10px 12px;border:0;border-radius:12px;font-weight:900;background:#38bdf8;color:#03121f;cursor:pointer;">Run Vanguard Mapping</button>';
    target.parentNode.insertBefore(panel, target.nextSibling);
    var btn = document.getElementById('nexusCcsAiAnalyzeBtn');
    if (btn) btn.addEventListener('click', function(){ analyzeCurrentChecklist(true); });
  }

  function setStatus(msg, tone){
    var el = document.getElementById('nexusCcsAiStatus');
    if (!el) return;
    el.textContent = msg;
    el.style.color = tone === 'bad' ? '#fecaca' : tone === 'good' ? '#bbf7d0' : '#e0f2fe';
  }

  async function analyzeCurrentChecklist(userInitiated){
    renderPanel();
    var payload = buildPayload();
    if (!payload.steps.length) {
      setStatus('No checklist steps found yet. Import or load a checklist first.', 'bad');
      return null;
    }
    setStatus('Vanguard is mapping ' + payload.steps.length + ' checklist step(s)...', 'info');
    try {
      var result;
      if (window.VANGUARD_AI_BRIDGE && typeof window.VANGUARD_AI_BRIDGE.mapChecklist === 'function') {
        result = await window.VANGUARD_AI_BRIDGE.mapChecklist(payload);
      } else if (window.NEXUS_AI_CLIENT && typeof window.NEXUS_AI_CLIENT.mapChecklistSteps === 'function') {
        result = await window.NEXUS_AI_CLIENT.mapChecklistSteps(payload);
      } else {
        throw new Error('Vanguard AI client is not loaded.');
      }
      saveAnalysis(result);
      var count = result && Array.isArray(result.mappings) ? result.mappings.length : 0;
      setStatus('Vanguard mapping complete: ' + count + ' mapped step(s). State: ' + (result.state || 'review') + '.', count ? 'good' : 'info');
      return result;
    } catch(err) {
      setStatus('Vanguard mapping failed: ' + (err && err.message ? err.message : err), 'bad');
      if (userInitiated) alert('Vanguard mapping failed: ' + (err && err.message ? err.message : err));
      return null;
    }
  }

  function scheduleAfterImport(){
    clearTimeout(window.__nexusCcsAiTimer);
    window.__nexusCcsAiTimer = setTimeout(function(){ analyzeCurrentChecklist(false); }, 1600);
  }

  function attachImportHooks(){
    var input = document.getElementById('excelInput');
    if (input && !input.__nexusCcsAiHooked) {
      input.__nexusCcsAiHooked = true;
      input.addEventListener('change', scheduleAfterImport);
    }
    var zone = document.getElementById('dropZone');
    if (zone && !zone.__nexusCcsAiHooked) {
      zone.__nexusCcsAiHooked = true;
      zone.addEventListener('drop', scheduleAfterImport);
    }
    window.addEventListener('nexus:local-save', function(ev){
      var k = ev && ev.detail && ev.detail.key || '';
      if (k.indexOf('ccs') !== -1 || k.indexOf(eq()) !== -1) scheduleAfterImport();
    });
  }

  function init(){
    renderPanel();
    attachImportHooks();
    setTimeout(function(){
      var state = readState();
      if (state && getSteps(state).length) setStatus('Checklist loaded. Vanguard mapping is ready.', 'info');
    }, 500);
  }

  window.NEXUS_CCS_AI = {
    version:VERSION,
    buildPayload:buildPayload,
    analyzeCurrentChecklist:analyzeCurrentChecklist,
    readState:readState,
    saveAnalysis:saveAnalysis
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
