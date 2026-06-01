/* NEXUS Vanguard Readiness & Risk Engine */
(function(){'use strict';if(typeof window==='undefined')return;
function now(){return new Date().toISOString();}
function parse(r,f){try{return r?JSON.parse(r):f}catch(e){return f}}
function conflicts(){return (window.NEXUS_VANGUARD_CONFLICTS&&window.NEXUS_VANGUARD_CONFLICTS.load()?window.NEXUS_VANGUARD_CONFLICTS.load().conflicts:[])||[];}
function reqs(){return window.NEXUS_REQUIREMENTS&&window.NEXUS_REQUIREMENTS.load?window.NEXUS_REQUIREMENTS.load().requirements||[]:[];}
function score(){let risk=0;const c=conflicts();const r=reqs();const pending=r.filter(x=>x.state==='review').length;const rejected=r.filter(x=>x.state==='rejected').length;risk+=c.length*15; risk+=pending*3; risk+=rejected*5; return Math.max(0,Math.min(100,risk));}
function readiness(){const risk=score(); if(risk<15)return 'READY'; if(risk<40)return 'REVIEW'; return 'BLOCKED';}
function snapshot(){return {generatedAt:now(),riskScore:score(),status:readiness(),conflicts:conflicts().length,requirements:reqs().length,pendingRequirements:reqs().filter(r=>r.state==='review').length};}
window.NEXUS_VANGUARD_READINESS={snapshot:snapshot,score:score,status:readiness};})();