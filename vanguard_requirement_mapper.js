(function(){
'use strict';
if(window.VanguardRequirementMapper) return;
const KEY='nexus_vanguard_requirements';
function load(){try{return JSON.parse(localStorage.getItem(KEY)||'{}');}catch(e){return{};}}
function save(data){localStorage.setItem(KEY,JSON.stringify(data||{}));return data;}
function setRequirement(id,req){const data=load();data[id]=Object.assign({updatedAt:new Date().toISOString()},req||{});save(data);return data[id];}
function getRequirement(id){return load()[id]||null;}
window.VanguardRequirementMapper={load,save,setRequirement,getRequirement};
})();
