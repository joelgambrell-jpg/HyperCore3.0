/*
  assets/js/nexus-ai-client.js
  NEXUS Vanguard AI client adapter

  Working behavior:
  - Calls a private backend AI endpoint when configured and enabled.
  - Falls back to deterministic local analysis when offline or unconfigured.
  - Never stores API keys in the public repo.
  - Returns structured results suitable for Vanguard validation, CCS mapping, Torque, Meg, and Package Export.
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;

  var VERSION = '1.0.0';

  function cfg(){
    return window.NEXUS_AI_CONFIG && window.NEXUS_AI_CONFIG.load ? window.NEXUS_AI_CONFIG.load() : {
      enabled:false,
      endpoint:'',
      timeoutMs:45000,
      model:'gpt-4.1-mini',
      minimumConfidenceForAutoMap:0.86,
      minimumConfidenceForValidationPass:0.82,
      stricterRequirementWins:true,
      requireHumanApproval:true
    };
  }

  function now(){ return new Date().toISOString(); }
  function text(v){ return String(v == null ? '' : v); }
  function clamp(n,min,max){ n=Number(n); if(!isFinite(n)) n=min; return Math.max(min, Math.min(max, n)); }
  function words(input){ return text(input).toLowerCase().replace(/[^a-z0-9%°.#\-/\s]/g,' ').split(/\s+/).filter(Boolean); }
  function stableId(prefix){ return (prefix || 'ai') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8); }

  function withTimeout(promise, timeoutMs){
    var t;
    return Promise.race([
      promise,
      new Promise(function(_, reject){ t=setTimeout(function(){ reject(new Error('AI request timed out')); }, timeoutMs || 45000); })
    ]).finally(function(){ clearTimeout(t); });
  }

  async function callBackend(task, payload){
    var c = cfg();
    if (!c.enabled || !c.endpoint) throw new Error(window.NEXUS_AI_CONFIG && window.NEXUS_AI_CONFIG.explainDisabled ? window.NEXUS_AI_CONFIG.explainDisabled() : 'AI endpoint disabled');
    if (!navigator.onLine) throw new Error('Offline; using local Vanguard fallback');

    var body = {
      task: task,
      model: c.model,
      timestamp: now(),
      projectContext: getProjectContext(),
      config: {
        requireHumanApproval: c.requireHumanApproval,
        enforceApprovedRulesOnly: c.enforceApprovedRulesOnly,
        stricterRequirementWins: c.stricterRequirementWins,
        minimumConfidenceForAutoMap: c.minimumConfidenceForAutoMap,
        minimumConfidenceForValidationPass: c.minimumConfidenceForValidationPass,
        sourceHierarchy: c.sourceHierarchy
      },
      payload: payload || {}
    };

    var request = fetch(c.endpoint, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      credentials:'include',
      body:JSON.stringify(body)
    }).then(async function(res){
      var raw = await res.text();
      var data;
      try { data = raw ? JSON.parse(raw) : {}; } catch(e){ data = { raw: raw }; }
      if (!res.ok) {
        var msg = data && (data.error || data.message) ? (data.error || data.message) : ('AI backend failed: HTTP ' + res.status);
        throw new Error(msg);
      }
      return normalizeResult(task, data, 'backend');
    });

    return withTimeout(request, c.timeoutMs);
  }

  function getProjectContext(){
    var out = { source:'browser', page:location.pathname, project:'', equipment:'', role:'' };
    try { out.project = localStorage.getItem('nexus_active_project') || localStorage.getItem('nexus_project_name') || ''; } catch(e){}
    try { out.equipment = new URLSearchParams(location.search).get('eq') || localStorage.getItem('nexus_active_equipment') || ''; } catch(e){}
    try {
      var user = JSON.parse(localStorage.getItem('nexus_current_user') || '{}');
      out.role = user.role || '';
      out.user = { email:user.email || '', displayName:user.displayName || '', role:user.role || '' };
    } catch(e){}
    return out;
  }

  function normalizeResult(task, data, source){
    data = data || {};
    return Object.assign({
      id: data.id || stableId('vanguard'),
      task: task,
      source: source || 'local',
      createdAt: data.createdAt || now(),
      confidence: clamp(data.confidence == null ? 0.5 : data.confidence, 0, 1),
      state: data.state || 'review',
      summary: data.summary || '',
      findings: Array.isArray(data.findings) ? data.findings : [],
      requirements: Array.isArray(data.requirements) ? data.requirements : [],
      mappings: Array.isArray(data.mappings) ? data.mappings : [],
      conflicts: Array.isArray(data.conflicts) ? data.conflicts : [],
      citations: Array.isArray(data.citations) ? data.citations : [],
      actions: Array.isArray(data.actions) ? data.actions : [],
      raw: data.raw || null
    }, data);
  }

  function keywordScore(haystack, terms){
    var w = words(haystack);
    if (!w.length) return 0;
    var set = new Set(w);
    var hits = 0;
    terms.forEach(function(t){ if(set.has(t)) hits++; });
    return hits / Math.max(terms.length || 1, 1);
  }

  function extractNumericRequirements(input){
    var s = text(input);
    var reqs = [];
    var patterns = [
      { type:'torque', re:/(\d+(?:\.\d+)?)\s*(?:ft[-\s]?lb|ftlbs?|foot[-\s]?pounds?)/ig, unit:'ft-lb' },
      { type:'torque', re:/(\d+(?:\.\d+)?)\s*(?:n\s*m|nm|newton[-\s]?meters?)/ig, unit:'Nm' },
      { type:'megohmmeter', re:/(\d+(?:\.\d+)?)\s*(?:m\s*Ω|mohm|megohm|megaohm|meg)/ig, unit:'MΩ' },
      { type:'voltage', re:/(\d+(?:\.\d+)?)\s*(?:vdc|vac|volts?|v)/ig, unit:'V' },
      { type:'temperature', re:/(\d+(?:\.\d+)?)\s*(?:°\s*f|deg\s*f|fahrenheit)/ig, unit:'F' }
    ];
    patterns.forEach(function(p){
      var m;
      while((m = p.re.exec(s))){
        reqs.push({
          id: stableId('req'),
          type:p.type,
          value:Number(m[1]),
          unit:p.unit,
          text:m[0],
          index:m.index,
          confidence:0.72,
          source:'local-extractor'
        });
      }
    });
    return reqs;
  }

  function localExtractDocumentData(payload){
    var body = text(payload && (payload.text || payload.body || payload.content || payload.rawText));
    var name = text(payload && (payload.name || payload.filename || payload.title));
    var reqs = extractNumericRequirements(body);
    var lower = body.toLowerCase();
    var findings = [];

    var classes = [
      ['torque', ['torque','bolt','lug','termination','ft','lb','nm']],
      ['megohmmeter', ['megger','megohm','insulation','resistance','mω','mohm']],
      ['prefod', ['fod','foreign','debris','inspection','clean']],
      ['l2', ['level','l2','installation','verification']],
      ['phenolic', ['phenolic','label','nameplate','placard']],
      ['rif', ['receipt','received','shipping','damage','inspection']]
    ];
    classes.forEach(function(c){
      var score = keywordScore(lower + ' ' + name, c[1]);
      if(score > 0){ findings.push({ type:'document-classification', category:c[0], confidence:clamp(0.45 + score, 0, 0.92) }); }
    });

    var state = reqs.length || findings.length ? 'review' : 'missing-info';
    return normalizeResult('extractDocumentData', {
      source:'local',
      state:state,
      confidence:reqs.length ? 0.74 : 0.45,
      summary:reqs.length ? ('Extracted ' + reqs.length + ' measurable requirement(s).') : 'No measurable requirements found with local extractor.',
      requirements:reqs,
      findings:findings,
      citations: [{ source:name || 'uploaded text', locator:'local text scan', confidence:0.5 }],
      actions: state === 'missing-info' ? [{ type:'review', label:'Upload clearer spec/submittal or enter requirement manually.' }] : [{ type:'review', label:'Engineer review required before enforcement.' }]
    });
  }

  function localMapChecklistSteps(payload){
    var steps = Array.isArray(payload && payload.steps) ? payload.steps : [];
    var requirements = Array.isArray(payload && payload.requirements) ? payload.requirements : [];
    var mappings = [];
    steps.forEach(function(step, idx){
      var label = text(step.label || step.name || step.description || step);
      var best = null;
      requirements.forEach(function(req){
        var score = keywordScore(label + ' ' + text(req.text || req.type), words(req.type + ' ' + req.text));
        if(!best || score > best.score) best = { req:req, score:score };
      });
      if(best && best.score > 0.12){
        mappings.push({
          stepIndex:idx,
          stepLabel:label,
          requirementId:best.req.id,
          requirementType:best.req.type,
          confidence:clamp(0.55 + best.score, 0, 0.86),
          state: best.score > 0.35 ? 'mapped-review' : 'weak-match-review',
          requiresHumanApproval:true
        });
      }
    });
    return normalizeResult('mapChecklistSteps', {
      source:'local',
      state:mappings.length ? 'review' : 'missing-info',
      confidence:mappings.length ? 0.68 : 0.35,
      summary:mappings.length ? ('Mapped ' + mappings.length + ' checklist step(s) for review.') : 'No confident checklist mappings found locally.',
      mappings:mappings,
      actions:[{ type:'engineer-review', label:'Approve or correct mapped steps before field enforcement.' }]
    });
  }

  function compareValues(entry, requirement){
    var ev = Number(entry && (entry.value ?? entry.measuredValue ?? entry.torque ?? entry.resistance));
    var rv = Number(requirement && requirement.value);
    if(!isFinite(ev) || !isFinite(rv)) return { state:'review', reason:'Missing numeric value.' };
    var type = text(requirement.type).toLowerCase();
    if(type === 'megohmmeter') return ev >= rv ? { state:'pass', reason:'Measured value meets or exceeds requirement.' } : { state:'blocked', reason:'Measured value is below required minimum.' };
    if(type === 'torque') {
      var tolerance = Number(requirement.tolerancePercent || 10);
      var low = rv * (1 - tolerance/100);
      var high = rv * (1 + tolerance/100);
      return ev >= low && ev <= high ? { state:'pass', reason:'Measured torque is within tolerance.' } : { state:'blocked', reason:'Measured torque is outside tolerance.' };
    }
    return ev >= rv ? { state:'pass', reason:'Measured value meets requirement.' } : { state:'review', reason:'Measured value may not meet requirement.' };
  }

  function localValidateEntry(payload){
    var entry = payload && payload.entry || {};
    var requirements = Array.isArray(payload && payload.requirements) ? payload.requirements : [];
    var findings = [];
    var blocked = false;
    requirements.forEach(function(req){
      var c = compareValues(entry, req);
      if(c.state === 'blocked') blocked = true;
      findings.push({
        type:'validation',
        requirementId:req.id || '',
        requirementType:req.type || '',
        state:c.state,
        reason:c.reason,
        confidence:0.8,
        requirement:req
      });
    });
    var state = !requirements.length ? 'review' : (blocked ? 'blocked' : findings.every(f=>f.state==='pass') ? 'pass' : 'review');
    return normalizeResult('validateEntry', {
      source:'local',
      state:state,
      confidence:requirements.length ? 0.78 : 0.42,
      summary:!requirements.length ? 'No approved requirement available for validation.' : (blocked ? 'One or more requirements failed.' : 'Entry checked against available requirements.'),
      findings:findings,
      actions: blocked ? [{ type:'block', label:'Correct entry or route to engineer/supervisor review.' }] : [{ type:'review', label:'Confirm source requirement before final sign-off.' }]
    });
  }

  function localExplainFailure(payload){
    var finding = payload && (payload.finding || payload.failure || payload);
    var reason = text(finding.reason || finding.summary || 'Requirement was not met or source information is incomplete.');
    return normalizeResult('explainFailure', {
      source:'local',
      state:'review',
      confidence:0.65,
      summary:reason,
      findings:[finding],
      actions:[
        { type:'show-source', label:'Show the exact source requirement used for this decision.' },
        { type:'correct-entry', label:'Correct the field entry if the value was entered wrong.' },
        { type:'engineer-review', label:'Route to engineer if the source is missing, conflicting, or unclear.' }
      ]
    });
  }

  async function run(task, payload){
    try {
      return await callBackend(task, payload || {});
    } catch(err) {
      var fallback;
      if(task === 'extractDocumentData') fallback = localExtractDocumentData(payload || {});
      else if(task === 'mapChecklistSteps') fallback = localMapChecklistSteps(payload || {});
      else if(task === 'validateEntry') fallback = localValidateEntry(payload || {});
      else if(task === 'explainFailure' || task === 'suggestCorrection') fallback = localExplainFailure(payload || {});
      else fallback = normalizeResult(task, { source:'local', state:'review', confidence:0.35, summary:'AI backend unavailable; local fallback has no handler for this task.', actions:[{type:'review',label:'Engineer review required.'}] });
      fallback.backendError = err && err.message ? err.message : String(err || 'backend unavailable');
      return fallback;
    }
  }

  var api = {
    __installed:true,
    version:VERSION,
    run:run,
    callBackend:callBackend,
    extractDocumentData:function(payload){ return run('extractDocumentData', payload); },
    mapChecklistSteps:function(payload){ return run('mapChecklistSteps', payload); },
    validateEntry:function(payload){ return run('validateEntry', payload); },
    explainFailure:function(payload){ return run('explainFailure', payload); },
    suggestCorrection:function(payload){ return run('suggestCorrection', payload); },
    local:{
      extractDocumentData:localExtractDocumentData,
      mapChecklistSteps:localMapChecklistSteps,
      validateEntry:localValidateEntry,
      explainFailure:localExplainFailure
    }
  };

  window.NEXUS_AI_CLIENT = api;
  window.NEXUS_VANGUARD_AI = window.NEXUS_VANGUARD_AI || api;
  window.dispatchEvent(new CustomEvent('nexus:ai-client-ready', { detail:{ version:VERSION } }));
})();
