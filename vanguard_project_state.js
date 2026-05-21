(function(){
'use strict';
if(window.VanguardProjectState) return;
const KEY='nexus_vanguard_project_state';
function load(){try{return JSON.parse(localStorage.getItem(KEY)||'{}');}catch(e){return{};}}
function save(p){localStorage.setItem(KEY,JSON.stringify(p||{}));return p;}
window.VanguardProjectState={load,save};
})();
