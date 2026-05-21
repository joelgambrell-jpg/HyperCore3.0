/*
  assets/js/vanguard_requirement_extractor.js
  NEXUS Vanguard Requirement Extractor

  Purpose:
  - Browser-side deterministic requirement extraction.
  - Not an LLM. This extracts obvious torque/meg/FOD/photo/approval requirements.
  - Later backend AI can replace or supplement this module.
*/
(function(){
  'use strict';
  if (window.NEXUS_VANGUARD_REQUIREMENT_EXTRACTOR && window.NEXUS_VANGUARD_REQUIREMENT_EXTRACTOR.__installed) return;

  var VERSION = '0.3.0-rule-requirement-extractor';

  function clean(v){ return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
  function nowISO(){ return new Date().toISOString(); }

  function makeReq(type, value, text, meta, confidence){
    meta = meta || {};
    return {
      id: 'REQ-' + type + '-' + Date.now() + '-' + Math.floor(Math.random() * 100000),
      requirementType: type,
      value: clean(value),
      exactText: clean(text),
      sourceDocument: meta.documentName || meta.sourceDocument || '',
      documentId: meta.documentId || '',
      page: meta.page || '',
      appliesTo: meta.appliesTo || '',
      units: meta.units || '',
      numericValue: meta.numericValue != null ? Number(meta.numericValue) : null,
      confidence: confidence == null ? 75 : Math.max(0, Math.min(100, Number(confidence))),
      createdAt: nowISO(),
      extractionMethod: 'LOCAL_RULES'
    };
  }

  function extractFromLine(line, meta){
    var out = [];
    var lower = line.toLowerCase();

    var torqueRegex = /(\d+(?:\.\d+)?)\s*(in[\s-]*lb|in[\s-]*lbs|inch[\s-]*pounds?|ft[\s-]*lb|ft[\s-]*lbs|foot[\s-]*pounds?|n[\s-]*m|nm)\b/ig;
    var m;
    while ((m = torqueRegex.exec(line))) {
      var units = m[2].replace(/\s+/g,'').toLowerCase();
      out.push(makeReq('TORQUE', m[0], line, Object.assign({}, meta, {
        numericValue: m[1],
        units: units
      }), lower.indexOf('torque') !== -1 ? 88 : 72));
    }

    var megRegex = /(\d+(?:\.\d+)?)\s*(mω|mohm|megohm|megohms|m\s*ohm|m\s*Ω|MΩ|MΩ|MΩ)/ig;
    while ((m = megRegex.exec(line))) {
      out.push(makeReq('MEG', m[0], line, Object.assign({}, meta, {
        numericValue: m[1],
        units: 'MΩ'
      }), lower.indexOf('insulation') !== -1 || lower.indexOf('meg') !== -1 ? 88 : 70));
    }

    if (/(foreign object|debris|fod|cleanliness|vacuum|remove debris)/i.test(line)) {
      out.push(makeReq('PREFOD', line, line, meta, 78));
    }

    if (/(photo|photograph|picture|image|visual record|final product verification|fpv)/i.test(line)) {
      out.push(makeReq('PHOTO_REQUIRED', line, line, meta, 72));
    }

    if (/(foreman|supervisor|engineer|approval|verify|sign[\s-]*off|witness)/i.test(line)) {
      out.push(makeReq('APPROVAL_REQUIRED', line, line, meta, 68));
    }

    return out;
  }

  function extract(text, meta){
    meta = meta || {};
    var raw = String(text || '');
    var lines = raw.split(/\r?\n/).map(clean).filter(Boolean);
    var out = [];

    lines.forEach(function(line, index){
      out = out.concat(extractFromLine(line, Object.assign({}, meta, {
        line: index + 1
      })));
    });

    return out;
  }

  var api = {
    __installed: true,
    version: VERSION,
    extract: extract,
    extractFromLine: extractFromLine
  };

  window.NEXUS_VANGUARD_REQUIREMENT_EXTRACTOR = api;
  window.VanguardRequirementExtractor = api;
})();
