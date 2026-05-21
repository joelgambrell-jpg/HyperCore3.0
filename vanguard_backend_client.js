/*
  assets/js/vanguard_backend_client.js
  NEXUS Vanguard Backend Client

  Purpose:
  - Calls backend AI/OCR extraction when available.
  - Falls back to browser extraction engine when backend is not reachable.
*/
(function(){
  'use strict';
  if (window.NEXUS_VANGUARD_BACKEND_CLIENT && window.NEXUS_VANGUARD_BACKEND_CLIENT.__installed) return;

  var VERSION = '0.1.0-backend-client';
  var DEFAULT_BASE = localStorage.getItem('nexus_vanguard_backend_url') || '';

  function clean(v){ return String(v == null ? '' : v).trim(); }

  function baseUrl(){
    var configured = clean(localStorage.getItem('nexus_vanguard_backend_url') || DEFAULT_BASE);
    return configured.replace(/\/+$/, '');
  }

  function setBaseUrl(url){
    localStorage.setItem('nexus_vanguard_backend_url', clean(url));
  }

  async function health(){
    var base = baseUrl();
    if (!base) return { ok:false, mode:'browser-only', reason:'No backend URL configured.' };

    try {
      var res = await fetch(base + '/health');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();
      return Object.assign({ mode:'backend' }, data);
    } catch (err) {
      return { ok:false, mode:'browser-only', reason:String(err && err.message ? err.message : err) };
    }
  }

  async function extractDocuments(files){
    var base = baseUrl();

    if (base) {
      try {
        var fd = new FormData();
        Array.prototype.slice.call(files || []).forEach(function(file){
          fd.append('files', file, file.name);
        });

        var res = await fetch(base + '/api/vanguard/documents/extract', {
          method: 'POST',
          body: fd
        });

        if (!res.ok) throw new Error('Backend extraction failed: HTTP ' + res.status);

        var data = await res.json();
        if (data && data.ok) return Object.assign({ mode:'backend' }, data);
      } catch (err) {
        console.warn('[VanguardBackendClient] backend failed, falling back to browser extraction:', err);
      }
    }

    if (window.VanguardExtractionEngine && typeof window.VanguardExtractionEngine.extractFiles === 'function') {
      var docs = await window.VanguardExtractionEngine.extractFiles(files);
      return {
        ok: true,
        mode: 'browser-fallback',
        documents: docs
      };
    }

    return {
      ok: false,
      mode: 'unavailable',
      documents: [],
      error: 'No backend and no browser extraction engine available.'
    };
  }

  async function extractText(text, sourceDocument){
    var base = baseUrl();

    if (base) {
      try {
        var res = await fetch(base + '/api/vanguard/requirements/extract-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text || '', sourceDocument: sourceDocument || 'manual-text' })
        });

        if (!res.ok) throw new Error('Backend text extraction failed: HTTP ' + res.status);
        var data = await res.json();
        return Object.assign({ mode:'backend' }, data);
      } catch (err) {
        console.warn('[VanguardBackendClient] backend text extraction failed:', err);
      }
    }

    var requirements = [];
    if (window.VanguardRequirementExtractor && typeof window.VanguardRequirementExtractor.extract === 'function') {
      requirements = window.VanguardRequirementExtractor.extract(text || '', { documentName: sourceDocument || 'manual-text' });
    }

    return {
      ok: true,
      mode: 'browser-fallback',
      sourceDocument: sourceDocument || 'manual-text',
      requirements: requirements,
      localRequirements: requirements,
      aiRequirements: [],
      aiStatus: 'NO_BACKEND'
    };
  }

  var api = {
    __installed: true,
    version: VERSION,
    baseUrl: baseUrl,
    setBaseUrl: setBaseUrl,
    health: health,
    extractDocuments: extractDocuments,
    extractText: extractText
  };

  window.NEXUS_VANGUARD_BACKEND_CLIENT = api;
  window.VanguardBackendClient = api;
})();
