/* vanguard_document_parser.js
   Browser-safe Vanguard parser shim. Replaces broken Python placeholder. */
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_PARSER && window.NEXUS_VANGUARD_PARSER.__installed) return;

  function clean(v){ return String(v == null ? '' : v).trim(); }
  function nowISO(){ return new Date().toISOString(); }
  function readJSON(k,f){ try{ var r=localStorage.getItem(k); return r ? JSON.parse(r) : f; }catch(e){ return f; } }
  function writeJSON(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch(e){ return false; } }
  function projectKey(project){ return 'nexus_vanguard_documents_' + clean(project || 'default'); }
  function mapKey(project){ return 'nexus_vanguard_requirement_map_' + clean(project || 'default'); }

  function extractRequirements(text, source){
    var mapper = window.NEXUS_VANGUARD_DOCUMENT_MAPPER || window.VanguardDocumentMapper;
    if (mapper && typeof mapper.extractRequirementsFromText === 'function') {
      return mapper.extractRequirementsFromText(text, source || {});
    }
    var lines = clean(text).split(/\r?\n/).map(clean).filter(Boolean);
    return lines.filter(function(line){ return /torque|meg|insulation|fod|foreign object|debris/i.test(line); }).map(function(line, i){
      return { id:'REQ-' + Date.now() + '-' + i, requirementType:/torque/i.test(line)?'TORQUE':(/meg|insulation/i.test(line)?'MEG':(/fod|foreign object|debris/i.test(line)?'PREFOD':'GENERAL')), value:line, exactText:line, sourceDocument:(source&&source.name)||'', sourceType:(source&&source.type)||'', confidence:65, createdAt:nowISO() };
    });
  }

  function fileToText(file){
    return new Promise(function(resolve){
      if (!file) { resolve(''); return; }
      var reader = new FileReader();
      reader.onload = function(){ resolve(String(reader.result || '')); };
      reader.onerror = function(){ resolve(''); };
      reader.readAsText(file);
    });
  }

  async function parseFiles(files, options){
    options = options || {};
    var project = options.project || options.projectId || 'default';
    var arr = Array.prototype.slice.call(files || []);
    var parsed = [];
    for (var i=0;i<arr.length;i+=1){
      var file = arr[i];
      var text = await fileToText(file);
      var source = { name:file.name || ('Document ' + (i+1)), type:file.type || 'FILE', uploadedAt:nowISO() };
      var requirements = extractRequirements(text, source);
      parsed.push({ id:'DOC-' + Date.now() + '-' + i, name:source.name, type:source.type, text:text, requirements:requirements, parsedAt:nowISO() });
    }
    var existing = getProjectDocuments(project);
    var merged = existing.concat(parsed);
    writeJSON(projectKey(project), merged);
    if (typeof options.onParsed === 'function') options.onParsed(parsed);
    return parsed;
  }

  function getProjectDocuments(project){ return readJSON(projectKey(project), []); }

  function publishRequirementMap(project){
    var docs = getProjectDocuments(project);
    var map = {};
    docs.forEach(function(doc){
      (doc.requirements || []).forEach(function(req){
        var eq = clean(req.equipmentId || req.eq || req.appliesTo || 'UNMAPPED') || 'UNMAPPED';
        map[eq] = map[eq] || { equipmentId:eq, requirements:[], updatedAt:nowISO() };
        map[eq].requirements.push(req);
      });
    });
    writeJSON(mapKey(project), map);
    Object.keys(map).forEach(function(eq){
      if (eq !== 'UNMAPPED') writeJSON('nexus_' + eq + '_vanguard_requirements', map[eq]);
    });
    return map;
  }

  function createHiddenFileInput(options){
    options = options || {};
    var input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.style.display = 'none';
    input.addEventListener('change', function(){ parseFiles(input.files, options); });
    document.body.appendChild(input);
    return { input:input, open:function(){ input.click(); } };
  }

  function installDropZone(el, options){
    if (!el) return;
    el.addEventListener('dragover', function(e){ e.preventDefault(); el.classList.add('dragover'); });
    el.addEventListener('dragleave', function(){ el.classList.remove('dragover'); });
    el.addEventListener('drop', function(e){ e.preventDefault(); el.classList.remove('dragover'); parseFiles(e.dataTransfer && e.dataTransfer.files, options || {}); });
  }

  var api={__installed:true,parseFiles:parseFiles,getProjectDocuments:getProjectDocuments,publishRequirementMap:publishRequirementMap,createHiddenFileInput:createHiddenFileInput,installDropZone:installDropZone,extractRequirements:extractRequirements};
  window.NEXUS_VANGUARD_PARSER=api;
  window.VanguardDocumentParser=api;
})();
