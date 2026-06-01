(function(){
  "use strict";
  if (typeof window === "undefined") return;

  function inject(src){
    try{
      if (document.querySelector('script[src="' + src + '"]')) return;
      var s = document.createElement("script");
      s.src = src;
      s.async = false;
      document.head.appendChild(s);
    }catch(e){ console.warn("NEXUS bridge loader failed for", src, e); }
  }

  inject("assets/js/nexus-offline-store.js");
  inject("assets/js/nexus-sync-queue.js");
  inject("assets/js/nexus-dependency-guard.js");
  inject("assets/js/nexus-firebase-bridge.js");
})();
