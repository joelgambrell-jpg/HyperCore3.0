/* NEXUS Meg -> Vanguard validation */
(function(){
'use strict';
if(typeof window==='undefined') return;
function reqs(){ return window.NEXUS_REQUIREMENTS && window.NEXUS_REQUIREMENTS.consumeForValidation ? window.NEXUS_REQUIREMENTS.consumeForValidation('megohmmeter') : []; }
async function validate(entry){
 const requirements=reqs();
 const payload={module:'meg',entry:entry||{},requirements:requirements};
 if(window.VANGUARD_AI_BRIDGE && window.VANGUARD_AI_BRIDGE.validateEntry) return window.VANGUARD_AI_BRIDGE.validateEntry(payload);
 if(window.NEXUS_AI_CLIENT && window.NEXUS_AI_CLIENT.validateEntry) return window.NEXUS_AI_CLIENT.validateEntry(payload);
 return {state:'review',summary:'AI validator unavailable'};
}
window.NEXUS_MEG_VANGUARD={validate:validate,requirements:reqs};
})();
