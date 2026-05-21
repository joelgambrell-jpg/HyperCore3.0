(function(){
'use strict';
if(window.VanguardMappingReview) return;
function review(requirements){return (requirements||[]).map(r=>Object.assign({reviewStatus:'CHECK'},r));}
window.VanguardMappingReview={review};
})();
