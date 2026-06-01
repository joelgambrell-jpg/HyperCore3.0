/* Equipment-level Vanguard readiness engine */
(function(){'use strict';if(typeof window==='undefined')return;
function now(){return new Date().toISOString();}
function parse(r,f){try{return r?JSON.parse(r):f}catch(e){return f}}
function eq(){try{return new URLSearchParams(location.search).get('eq')||localStorage.getItem('nexus_active_equipment')||'NO_EQ'}catch(e){return 'NO_EQ'}}
function status(){
 let score=0;
 const keys=Object.keys(localStorage);
 const equipment=eq();
 const hasTorque=keys.some(k=>k.includes(equipment)&&k.toLowerCase().includes('torque'));
 const hasMeg=keys.some(k=>k.includes(equipment)&&k.toLowerCase().includes('meg'));
 const hasCCS=keys.some(k=>k.includes(equipment)&&k.toLowerCase().includes('ccs'));
 if(!hasCCS) score+=30;
 if(!hasTorque) score+=25;
 if(!hasMeg) score+=25;
 if(score===0) return 'TURNOVER_READY';
 if(score<40) return 'REVIEW';
 return 'BLOCKED';
 }
 function snapshot(){return {equipment:eq(),generatedAt:now(),status:status()};}
 window.NEXUS_EQUIPMENT_READINESS={snapshot:snapshot,status:status};})();