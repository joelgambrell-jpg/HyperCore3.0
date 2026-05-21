(function(){
'use strict';
if(window.VanguardGlobalCorrections) return;
const KEY='nexus_vanguard_global_corrections';
function list(){try{return JSON.parse(localStorage.getItem(KEY)||'[]');}catch(e){return[];}}
function save(items){localStorage.setItem(KEY,JSON.stringify(items||[]));return items;}
function addCorrection(c){const items=list();items.push(Object.assign({createdAt:new Date().toISOString()},c||{}));save(items);return items[items.length-1];}
window.VanguardGlobalCorrections={list,save,addCorrection};
})();
