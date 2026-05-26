/*
  vanguard_registry.js
  Compatibility shim for older pages that load Vanguard registry from the repo root.
  The active Vanguard registry lives at assets/js/vanguard_registry.js.
*/
(function () {
  "use strict";

  if (typeof window === "undefined" || typeof document === "undefined") return;

  function alreadyLoaded(srcPart) {
    var scripts = document.querySelectorAll("script[src]");
    for (var i = 0; i < scripts.length; i += 1) {
      var src = scripts[i].getAttribute("src") || "";
      if (src.indexOf(srcPart) !== -1) return true;
    }
    return false;
  }

  if (alreadyLoaded("assets/js/vanguard_registry.js")) return;

  var script = document.createElement("script");
  script.src = "assets/js/vanguard_registry.js";
  script.async = false;
  script.onerror = function () {
    console.warn("Vanguard registry compatibility shim could not load assets/js/vanguard_registry.js");
  };
  document.head.appendChild(script);
})();
