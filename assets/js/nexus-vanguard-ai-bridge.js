/*
  assets/js/nexus-vanguard-ai-bridge.js
  Connects the canonical NEXUS_AI_CLIENT to existing Vanguard modules without breaking legacy names.
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;

  var VERSION = '1.0.0';

  function ai(){ return window.NEXUS_AI_CLIENT || window.NEXUS_VANGUARD_AI || null; }
  function log(){ try { console.info.apply(console, arguments); } catch(e){} }
  function warn(){ try { console.warn.apply(console, arguments); } catch(e){} }

  function normalizeDocumentInput(input){
    input = input || {};
    return {
      id: input.id || input.documentId || input.name || ('doc_' + Date.now().toString(36)),
      name: input.name || input.filename || input.title || 'Untitled Document',
      filename: input.filename || input.name || input.title || '',
      type: input.type || input.documentType || 'unknown',
      text: input.text || input.rawText || input.content || input.body || '',
      metadata: input.metadata || {},
      source: input.source || 'vanguard-bridge'
    };
  }

  function saveResult(key, result){
    try {
      if (window.NEXUS_OFFLINE && typeof window.NEXUS_OFFLINE.saveLocal === 'function') {
        window.NEXUS_OFFLINE.saveLocal(key, result, 'vanguard-ai-bridge');
      }
      if (window.NEXUS_FIREBASE && typeof window.NEXUS_FIREBASE.save === 'function') {
        window.NEXUS_FIREBASE.save(key, result);
      }
    } catch(e) { warn('Vanguard result save failed', e); }
  }

  async function analyzeDocument(input){
    var client = ai();
    if (!client || typeof client.extractDocumentData !== 'function') throw new Error('NEXUS_AI_CLIENT is not loaded');
    var doc = normalizeDocumentInput(input);
    var result = await client.extractDocumentData(doc);
    result.document = { id: doc.id, name: doc.name, filename: doc.filename, type: doc.type };
    saveResult('vanguard/documents/' + doc.id + '/analysis', result);
    window.dispatchEvent(new CustomEvent('nexus:vanguard-document-analyzed', { detail: result }));
    return result;
  }

  async function mapChecklist(payload){
    var client = ai();
    if (!client || typeof client.mapChecklistSteps !== 'function') throw new Error('NEXUS_AI_CLIENT is not loaded');
    var result = await client.mapChecklistSteps(payload || {});
    saveResult('vanguard/mappings/' + (payload && (payload.equipmentType || payload.eq || payload.id) || 'general'), result);
    window.dispatchEvent(new CustomEvent('nexus:vanguard-checklist-mapped', { detail: result }));
    return result;
  }

  async function validateEntry(payload){
    var client = ai();
    if (!client || typeof client.validateEntry !== 'function') throw new Error('NEXUS_AI_CLIENT is not loaded');
    var result = await client.validateEntry(payload || {});
    saveResult('vanguard/validations/' + (payload && (payload.validationId || payload.eq || payload.id) || ('entry_' + Date.now().toString(36))), result);
    window.dispatchEvent(new CustomEvent('nexus:vanguard-entry-validated', { detail: result }));
    return result;
  }

  async function explainFailure(payload){
    var client = ai();
    if (!client || typeof client.explainFailure !== 'function') throw new Error('NEXUS_AI_CLIENT is not loaded');
    var result = await client.explainFailure(payload || {});
    window.dispatchEvent(new CustomEvent('nexus:vanguard-failure-explained', { detail: result }));
    return result;
  }

  function installLegacyAliases(){
    window.NEXUS_VANGUARD = window.NEXUS_VANGUARD || {};
    window.NEXUS_VANGUARD.ai = window.NEXUS_VANGUARD.ai || {};
    Object.assign(window.NEXUS_VANGUARD.ai, {
      analyzeDocument: analyzeDocument,
      extractDocumentData: analyzeDocument,
      mapChecklist: mapChecklist,
      mapChecklistSteps: mapChecklist,
      validateEntry: validateEntry,
      explainFailure: explainFailure
    });

    window.VANGUARD_AI_BRIDGE = {
      version: VERSION,
      analyzeDocument: analyzeDocument,
      mapChecklist: mapChecklist,
      validateEntry: validateEntry,
      explainFailure: explainFailure,
      saveResult: saveResult
    };

    if (window.VanguardCore && typeof window.VanguardCore === 'object') {
      window.VanguardCore.ai = Object.assign({}, window.VanguardCore.ai || {}, window.NEXUS_VANGUARD.ai);
    }

    if (window.vanguardCore && typeof window.vanguardCore === 'object') {
      window.vanguardCore.ai = Object.assign({}, window.vanguardCore.ai || {}, window.NEXUS_VANGUARD.ai);
    }
  }

  function autoHookDocumentEvents(){
    document.addEventListener('nexus:vanguard-document-ready', function(ev){
      analyzeDocument(ev.detail || {}).catch(function(err){ warn('Auto document analysis failed', err); });
    });
    document.addEventListener('nexus:vanguard-validate-entry', function(ev){
      validateEntry(ev.detail || {}).catch(function(err){ warn('Auto entry validation failed', err); });
    });
    document.addEventListener('nexus:vanguard-map-checklist', function(ev){
      mapChecklist(ev.detail || {}).catch(function(err){ warn('Auto checklist mapping failed', err); });
    });
  }

  installLegacyAliases();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoHookDocumentEvents); else autoHookDocumentEvents();
  window.dispatchEvent(new CustomEvent('nexus:vanguard-ai-bridge-ready', { detail:{ version:VERSION } }));
  log('NEXUS Vanguard AI bridge ready', VERSION);
})();
