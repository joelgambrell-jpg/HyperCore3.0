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

  function installSearchablePackageBoard(){
    if (!/vanguard_control_center/i.test(location.pathname || '') && !document.getElementById('equipmentBoard')) return;
    var board = document.getElementById('equipmentBoard');
    if (!board || board.__vanguardSearchInstalled) return;
    board.__vanguardSearchInstalled = true;

    var panel = board.closest('.panel') || board.parentNode;
    var state = { viewAll:false, query:'' };

    var style = document.createElement('style');
    style.textContent = '.pkg-search-wrap{display:grid;gap:10px;margin:10px 0 12px}.pkg-search-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.pkg-search-input{flex:1;min-width:240px;padding:13px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.94);color:#111;font-size:15px;font-weight:900}.pkg-count{font-size:12px;font-weight:1000;color:rgba(255,255,255,.78)}.pkg-help{font-size:12px;font-weight:800;color:rgba(255,255,255,.72);line-height:1.35}.pkg-highlight{outline:2px solid rgba(41,211,255,.45);box-shadow:0 0 0 4px rgba(41,211,255,.12)}';
    document.head.appendChild(style);

    var wrap = document.createElement('div');
    wrap.className = 'pkg-search-wrap';
    wrap.innerHTML = '<div class="pkg-search-row"><input id="pkgSearchInput" class="pkg-search-input" placeholder="Search equipment: SWGR, UPS, TR-01, building, partial ID..."><button id="pkgViewAllBtn" class="btn secondary" type="button">View All</button></div><div class="pkg-help">Type any partial equipment info. Default view shows the first few records only so this board does not become a giant wall of equipment.</div><div class="pkg-count" id="pkgSearchCount">0 equipment records</div>';
    panel.insertBefore(wrap, board);

    var input = document.getElementById('pkgSearchInput');
    var toggle = document.getElementById('pkgViewAllBtn');
    var count = document.getElementById('pkgSearchCount');

    function allRows(){ return Array.prototype.slice.call(board.querySelectorAll('.eqrow')); }
    function rowText(row){ return (row.textContent || '').toLowerCase(); }

    function apply(){
      var q = String(state.query || '').trim().toLowerCase();
      var rows = allRows();
      var matches = rows.filter(function(row){ return !q || rowText(row).indexOf(q) !== -1; });
      rows.forEach(function(row){ row.style.display = 'none'; row.classList.remove('pkg-highlight'); });

      var visible;
      if (q) visible = matches;
      else visible = state.viewAll ? rows : rows.slice(0, 6);

      visible.forEach(function(row){ row.style.display = ''; if(q) row.classList.add('pkg-highlight'); });
      if (count) {
        count.textContent = q ? (matches.length + ' match(es) for "' + state.query + '"') : (rows.length + ' equipment record(s)' + (state.viewAll ? ' shown' : ' — showing first ' + Math.min(6, rows.length)));
      }
      if (toggle) toggle.textContent = state.viewAll ? 'Hide All' : 'View All';
    }

    var observer = new MutationObserver(function(){ apply(); });
    observer.observe(board, { childList:true, subtree:false });

    input.addEventListener('input', function(){ state.query = input.value; apply(); });
    toggle.addEventListener('click', function(){ state.viewAll = !state.viewAll; apply(); });

    setTimeout(apply, 0);
    setInterval(apply, 2500);
  }

  var api={__installed:true,parseFiles:parseFiles,getProjectDocuments:getProjectDocuments,publishRequirementMap:publishRequirementMap,createHiddenFileInput:createHiddenFileInput,installDropZone:installDropZone,extractRequirements:extractRequirements,installSearchablePackageBoard:installSearchablePackageBoard};
  window.NEXUS_VANGUARD_PARSER=api;
  window.VanguardDocumentParser=api;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installSearchablePackageBoard);
  else installSearchablePackageBoard();
})();
