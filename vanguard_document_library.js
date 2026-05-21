(function(){
'use strict';
if(window.VanguardDocumentLibrary) return;
function load(){try{return JSON.parse(localStorage.getItem('nexus_vanguard_document_library_v2')||'[]');}catch(e){return[];}}
function render(id){const el=document.getElementById(id);if(!el)return;const docs=load();el.innerHTML=docs.length?docs.map(d=>'<div style="padding:10px;border:1px solid #d1d5db;border-radius:12px;margin:6px 0;"><strong>'+String(d.name||'Document')+'</strong><br><small>'+String(d.status||'')+'</small></div>').join(''):'<div>No documents loaded.</div>';}
window.VanguardDocumentLibrary={load,render};
})();
