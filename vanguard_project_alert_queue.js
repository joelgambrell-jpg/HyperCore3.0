(function(){
'use strict';
if(window.VanguardProjectAlertQueue) return;
const KEY='nexus_vanguard_project_alerts';
function load(){try{return JSON.parse(localStorage.getItem(KEY)||'[]');}catch(e){return[];}}
function save(items){localStorage.setItem(KEY,JSON.stringify(items||[]));window.dispatchEvent(new CustomEvent('vanguard:project-alerts:updated',{detail:{count:(items||[]).length}}));return items;}
function addAlert(alert){const items=load();items.push(Object.assign({id:'ALERT-'+Date.now(),status:'OPEN',createdAt:new Date().toISOString()},alert||{}));save(items);return items[items.length-1];}
function closeAlert(id,comment){const items=load().map(a=>a.id===id?Object.assign({},a,{status:'CLOSED',closedAt:new Date().toISOString(),closeComment:comment||''}):a);save(items);return items;}
window.VanguardProjectAlertQueue={load,save,addAlert,closeAlert};
})();
