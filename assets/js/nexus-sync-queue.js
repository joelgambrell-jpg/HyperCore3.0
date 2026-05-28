/* NEXUS sync queue coordinator */
(function(){
  "use strict";
  async function defaultWriter(key, payload){
    if(window.NEXUS_FIREBASE && typeof window.NEXUS_FIREBASE.remoteSave === "function"){
      return window.NEXUS_FIREBASE.remoteSave(key, payload);
    }
    if(window.NEXUS_FIREBASE && typeof window.NEXUS_FIREBASE.__remoteSave === "function"){
      return window.NEXUS_FIREBASE.__remoteSave(key, payload);
    }
    throw new Error("No remote writer available");
  }
  async function flush(){
    if(!window.NEXUS_OFFLINE || !navigator.onLine) return { ok:false };
    return window.NEXUS_OFFLINE.flushWith(defaultWriter);
  }
  let timer = null;
  function schedule(){
    clearTimeout(timer);
    timer = setTimeout(flush, 800);
  }
  window.NEXUS_SYNC_QUEUE = window.NEXUS_SYNC_QUEUE || {};
  window.NEXUS_SYNC_QUEUE.flush = flush;
  window.NEXUS_SYNC_QUEUE.schedule = schedule;
  window.addEventListener("online", schedule);
  window.addEventListener("nexus:sync-queued", schedule);
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", schedule);
  else schedule();
})();
