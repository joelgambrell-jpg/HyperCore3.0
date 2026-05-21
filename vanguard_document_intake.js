(function(){
'use strict';
if(window.VanguardDocumentIntake) return;
const KEY='nexus_vanguard_documents';
function load(){try{return JSON.parse(localStorage.getItem(KEY)||'[]');}catch(e){return[];}}
function save(items){localStorage.setItem(KEY,JSON.stringify(items||[]));return items;}
function addDocument(doc){const items=load();items.push(Object.assign({id:'DOC-'+Date.now(),uploadedAt:new Date().toISOString()},doc||{}));save(items);window.dispatchEvent(new CustomEvent('vanguard:documents:updated',{detail:{count:items.length}}));return items;}
window.VanguardDocumentIntake={load,save,addDocument};
})();
