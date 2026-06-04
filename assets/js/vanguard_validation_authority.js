/*
  assets/js/vanguard_validation_authority.js
  HyperCore / NEXUS Vanguard Validation Authority

  Purpose:
  - Separate ENGINEERING REVIEW from FIELD EXECUTION.
  - Engineering can flag missing references, numeric mismatches, conflicts, bad data, and review items.
  - Field execution only blocks when:
      1) The required process is not complete.
      2) A FAIL exists without a notation/reason.
  - Front-end only. No Firebase backend required.
  - Additive: does not replace existing page logic until callers opt into it.

  Canonical operating entities:
  - ENGINEERING SETUP / REVIEW: strict review intelligence, no automatic field lockout.
  - FIELD EXECUTION: field-friendly completion authority, minimal blocking.
*/
(function(){
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.NEXUS_VANGUARD_VALIDATION_AUTHORITY && window.NEXUS_VANGUARD_VALIDATION_AUTHORITY.__installed) return;

  var VERSION = '1.1.0-field-engineering-split';
  var REQUIREMENTS_KEY = 'nexus_vanguard_requirements';
  var CONFLICTS_KEY = 'nexus_vanguard_conflicts_v1';
  var AUTHORITY_KEY_PREFIX = 'nexus_vanguard_authority_';

  var MODE = {
    FIELD: 'FIELD',
    ENGINEERING: 'ENGINEERING'
  };

  var STATUS = {
    PASS: 'PASS',
    REVIEW: 'REVIEW',
    BLOCKED: 'BLOCKED'
  };

  var SEVERITY = {
    INFO: 'INFO',
    REVIEW: 'REVIEW',
    BLOCKER: 'BLOCKER'
  };

  var MODULE_SEQUENCE = [
    { id:'rif', label:'Receipt Inspection' },
    { id:'phenolic', label:'Phenolic Display' },
    { id:'torque', label:'Torque' },
    { id:'l2', label:'L2 Verification' },
    { id:'meg', label:'Megohmmeter Testing' },
    { id:'prefod', label:'Pre-FOD' },
    { id:'fpv', label:'Finished Product Verification' },
    { id:'ccs', label:'Construction Check Sheet' }
  ];

  function clean(value){ return String(value == null ? '' : value).trim(); }
  function lower(value){ return clean(value).toLowerCase(); }
  function upper(value){ return clean(value).toUpperCase(); }
  function nowISO(){ return new Date().toISOString(); }
  function id(prefix){ return (prefix || 'VAL') + '-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2,8).toUpperCase(); }

  function readJSON(key, fallback){
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch(e){
      return fallback;
    }
  }

  function writeJSON(key, value){
    try { localStorage.setItem(key, JSON.stringify(value)); } catch(e) {}
    return value;
  }

  function getEq(input){
    if (input && typeof input === 'object') {
      var fromInput = clean(input.eq || input.equipmentId || input.equipment || '');
      if (fromInput) return fromInput;
    }
    try {
      var p = new URLSearchParams(location.search);
      var fromUrl = clean(p.get('eq') || p.get('equipment') || p.get('equipmentId') || '');
      if (fromUrl) return fromUrl;
    } catch(e) {}
    return clean(localStorage.getItem('nexus_active_equipment') || localStorage.getItem('nexus_active_eq') || 'NO_EQ') || 'NO_EQ';
  }

  function numeric(value){
    if (value == null || value === '') return null;
    if (typeof value === 'number' && isFinite(value)) return value;
    var match = clean(value).replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  }

  function normalizeStatus(value){
    var s = upper(value);
    if (['PASS','PASSED','GO','GOOD','YES','Y','COMPLETE','COMPLETED','READY'].indexOf(s) !== -1) return 'PASS';
    if (['FAIL','FAILED','NO','N','NG','BAD'].indexOf(s) !== -1) return 'FAIL';
    if (['NA','N/A','NOT APPLICABLE','NOT-APPLICABLE'].indexOf(s) !== -1) return 'NA';
    if (['REVIEW','CHECK','HOLD','PENDING','UNKNOWN'].indexOf(s) !== -1) return 'REVIEW';
    return s || '';
  }

  function normalizeMode(options){
    options = options || {};
    var mode = upper(options.mode || options.authorityMode || 'FIELD');
    return mode === MODE.ENGINEERING ? MODE.ENGINEERING : MODE.FIELD;
  }

  function normalizeUnit(unit){
    var u = lower(unit).replace(/\s+/g,'').replace(/Ω/g,'ω');
    if (['ftlb','ft-lb','ftlbs','footpounds','foot-pound','lbft','lb-ft'].indexOf(u) !== -1) return 'ft-lb';
    if (['inlb','in-lb','inlbs','inchpounds','inch-pound','lbin','lb-in'].indexOf(u) !== -1) return 'in-lb';
    if (['nm','n-m','n·m'].indexOf(u) !== -1) return 'N·m';
    if (['mω','mohm','megohm','megohms','mωs'].indexOf(u) !== -1) return 'MΩ';
    if (u === 'mω' || u === 'mΩ'.toLowerCase()) return 'MΩ';
    return clean(unit);
  }

  function convertNumeric(value, fromUnit, toUnit){
    var n = numeric(value);
    if (n == null) return null;
    var from = normalizeUnit(fromUnit);
    var to = normalizeUnit(toUnit);
    if (!from || !to || from === to) return n;
    if (from === 'ft-lb' && to === 'in-lb') return n * 12;
    if (from === 'in-lb' && to === 'ft-lb') return n / 12;
    if (from === 'N·m' && to === 'ft-lb') return n * 0.737562149;
    if (from === 'ft-lb' && to === 'N·m') return n * 1.3558179483;
    if (from === 'N·m' && to === 'in-lb') return n * 8.85074579;
    if (from === 'in-lb' && to === 'N·m') return n * 0.112984829;
    return n;
  }

  function issue(code, severity, message, detail){
    return Object.assign({
      id: id('ISSUE'),
      code: clean(code || 'GENERAL'),
      severity: severity || SEVERITY.REVIEW,
      message: clean(message || ''),
      createdAt: nowISO()
    }, detail || {});
  }

  function result(scope, status, message, issues, extra){
    issues = Array.isArray(issues) ? issues : [];
    var blockers = issues.filter(function(i){ return i.severity === SEVERITY.BLOCKER; });
    var reviews = issues.filter(function(i){ return i.severity === SEVERITY.REVIEW; });
    var finalStatus = status || (blockers.length ? STATUS.BLOCKED : reviews.length ? STATUS.REVIEW : STATUS.PASS);
    return Object.assign({
      id: id('AUTH'),
      authorityVersion: VERSION,
      scope: clean(scope || 'general'),
      status: finalStatus,
      canPass: finalStatus !== STATUS.BLOCKED,
      blocking: finalStatus === STATUS.BLOCKED,
      reviewRequired: finalStatus === STATUS.REVIEW,
      message: clean(message || ''),
      issues: issues,
      blockerCount: blockers.length,
      reviewCount: reviews.length,
      createdAt: nowISO()
    }, extra || {});
  }

  function downgradeBlockersForField(issues){
    return (Array.isArray(issues) ? issues : []).map(function(item){
      if (!item || item.severity !== SEVERITY.BLOCKER) return item;
      return Object.assign({}, item, {
        severity: SEVERITY.REVIEW,
        fieldDowngraded: true,
        fieldDowngradeReason: 'Field mode only blocks incomplete process or FAIL without notation.'
      });
    });
  }

  function fieldResult(scope, message, issues, extra){
    issues = downgradeBlockersForField(issues || []);
    var reviews = issues.filter(function(i){ return i.severity === SEVERITY.REVIEW; });
    return result(scope, reviews.length ? STATUS.REVIEW : STATUS.PASS, message, issues, extra);
  }

  function citationFromRequirement(req){
    req = req || {};
    var citations = Array.isArray(req.citations) ? req.citations : [];
    if (citations.length) return citations[0];
    return {
      source: clean(req.sourceName || req.sourceDocument || req.document || ''),
      locator: clean(req.page || req.section || req.locator || ''),
      quote: clean(req.text || req.exactText || req.title || req.value || ''),
      confidence: Number(req.confidence == null ? 0 : req.confidence)
    };
  }

  function hasCitation(req){
    var c = citationFromRequirement(req || {});
    return !!(clean(c.source) && (clean(c.locator) || clean(c.quote)));
  }

  function hasReference(item){
    item = item || {};
    if (clean(item.source) && lower(item.source) !== 'nexus vanguard') return true;
    if (clean(item.sourceName || item.sourceDocument || item.documentReference || item.reference)) return true;
    if (Array.isArray(item.references) && item.references.some(function(r){ return clean(r && (r.url || r.name || r.notes || r.page || r.section)); })) return true;
    if (Array.isArray(item.evidenceRecords) && item.evidenceRecords.some(function(r){ return clean(r && (r.url || r.reference || r.sourceDocument || r.page || r.notes)); })) return true;
    if (item.aiCheck && Array.isArray(item.aiCheck.citations) && item.aiCheck.citations.length) return true;
    if (item.vanguardRule && Array.isArray(item.vanguardRule.citations) && item.vanguardRule.citations.length) return true;
    return false;
  }

  function hasReason(item){
    item = item || {};
    return !!clean(item.reason || item.note || item.notes || item.comment || (item.supervisorReview && item.supervisorReview.comment));
  }

  function requirementsAsArray(){
    var raw = readJSON(REQUIREMENTS_KEY, {});
    if (Array.isArray(raw)) return raw;
    return Object.keys(raw || {}).map(function(k){ return raw[k]; }).filter(Boolean);
  }

  function approvedRequirements(filter){
    filter = filter || {};
    var type = upper(filter.type || filter.requirementType || '');
    var eq = clean(filter.eq || filter.equipmentId || '');
    return requirementsAsArray().filter(function(req){
      if (!req) return false;
      if (!(req.approved || req.enforce || lower(req.state) === 'approved')) return false;
      if (type && upper(req.type || req.requirementType) !== type) return false;
      var reqEq = clean(req.equipmentId || req.equipment || req.appliesTo || '');
      if (eq && reqEq && reqEq !== eq) return false;
      return true;
    });
  }

  function requireApprovedRequirement(type, eq){
    var reqs = approvedRequirements({ type:type, eq:eq });
    if (!reqs.length) {
      return {
        requirement:null,
        issues:[issue('NO_APPROVED_REQUIREMENT', SEVERITY.REVIEW, 'No approved ' + type + ' requirement is available for engineering comparison.', { type:type })]
      };
    }
    var withCitation = reqs.filter(hasCitation);
    if (!withCitation.length) {
      return {
        requirement:reqs[0],
        issues:[issue('MISSING_REQUIREMENT_CITATION', SEVERITY.REVIEW, 'Approved ' + type + ' requirement is missing a source citation.', { requirement:reqs[0] })]
      };
    }
    return { requirement:withCitation[0], issues:[] };
  }

  function compareNumeric(entry, requirement, options){
    options = options || {};
    requirement = requirement || {};
    var type = upper(options.type || requirement.type || requirement.requirementType || 'GENERAL');
    var reqUnit = normalizeUnit(requirement.unit || requirement.units || options.unit || '');
    var enteredUnit = normalizeUnit(entry && (entry.unit || entry.units || entry.uom || options.enteredUnit || reqUnit));
    var reqValue = requirement.value != null && requirement.value !== '' ? numeric(requirement.value) : numeric(requirement.numericValue || requirement.requiredValue);
    var enteredValue = entry && (entry.value != null ? entry.value : entry.measuredValue != null ? entry.measuredValue : entry.reading != null ? entry.reading : entry.torque != null ? entry.torque : entry.resistance);
    var entered = convertNumeric(enteredValue, enteredUnit, reqUnit);
    var issues = [];

    if (reqValue == null) issues.push(issue('MISSING_REQUIRED_NUMERIC_VALUE', SEVERITY.REVIEW, 'Approved requirement is missing a numeric value.', { requirement:requirement }));
    if (entered == null) issues.push(issue('MISSING_ENTERED_NUMERIC_VALUE', SEVERITY.REVIEW, 'Entered field value is missing or not numeric.', { entry:entry }));
    if (issues.length) return { pass:false, issues:issues, enteredValue:entered, requiredValue:reqValue, unit:reqUnit };

    var comparator = lower(requirement.comparator || requirement.operator || '');
    var tolerancePercent = numeric(requirement.tolerancePercent);
    var pass = false;
    var low = reqValue;
    var high = reqValue;
    var rule = '';

    if (comparator === '=' || comparator === 'equals' || comparator === 'exact') {
      pass = entered === reqValue;
      rule = 'exact match';
    } else if (comparator === '<=' || comparator === 'max' || comparator === 'maximum') {
      pass = entered <= reqValue;
      rule = 'maximum';
    } else if (comparator === '>=' || comparator === 'min' || comparator === 'minimum' || type === 'MEG' || type === 'INSULATION') {
      pass = entered >= reqValue;
      rule = 'minimum';
    } else if (type === 'TORQUE') {
      var tol = tolerancePercent == null ? numeric(options.defaultTorqueTolerancePercent) : tolerancePercent;
      if (tol == null) tol = 0;
      low = reqValue * (1 - tol / 100);
      high = reqValue * (1 + tol / 100);
      pass = entered >= low && entered <= high;
      rule = tol ? ('±' + tol + '% tolerance') : 'exact torque value';
    } else {
      pass = entered >= reqValue;
      rule = 'minimum default';
    }

    if (!pass) {
      issues.push(issue('NUMERIC_MISMATCH', SEVERITY.REVIEW, 'Entered value does not match the approved ' + type + ' requirement.', {
        enteredValue: entered,
        requiredValue: reqValue,
        lowLimit: low,
        highLimit: high,
        unit: reqUnit,
        rule: rule,
        requirement: requirement,
        citation: citationFromRequirement(requirement)
      }));
    }

    return { pass:pass, issues:issues, enteredValue:entered, requiredValue:reqValue, lowLimit:low, highLimit:high, unit:reqUnit, rule:rule };
  }

  function validateNumericEntry(entry, options){
    options = options || {};
    var mode = normalizeMode(options);
    var type = upper(options.type || entry && (entry.type || entry.requirementType || entry.module) || 'GENERAL');
    var eq = clean(options.eq || options.equipmentId || entry && (entry.eq || entry.equipmentId) || getEq());
    var req = options.requirement || null;
    var issues = [];

    if (!req) {
      var reqLookup = requireApprovedRequirement(type, eq);
      req = reqLookup.requirement;
      issues = issues.concat(reqLookup.issues || []);
    } else if (!hasCitation(req)) {
      issues.push(issue('MISSING_REQUIREMENT_CITATION', SEVERITY.REVIEW, 'Requirement used for validation is missing citation/source.', { requirement:req }));
    }

    if (req) {
      var comparison = compareNumeric(entry || {}, req, options);
      issues = issues.concat(comparison.issues || []);
      var base = mode === MODE.FIELD ? fieldResult : result;
      return base('numeric:' + type.toLowerCase(), issues.length ? STATUS.REVIEW : STATUS.PASS, issues.length ? type + ' engineering comparison needs review.' : type + ' numeric comparison passed.', issues, { mode:mode, type:type, eq:eq, entry:entry, requirement:req, comparison:comparison, citation:citationFromRequirement(req) });
    }

    return fieldResult('numeric:' + type.toLowerCase(), 'Numeric comparison needs engineering setup.', issues, { mode:mode, type:type, eq:eq, entry:entry });
  }

  function validateChecklistItem(item, options){
    options = options || {};
    var mode = normalizeMode(options);
    item = item || {};
    var status = normalizeStatus(item.status || item.result || item.passFail || '');
    var issues = [];

    if (!status) {
      issues.push(issue('MISSING_STATUS', SEVERITY.BLOCKER, 'Checklist item has no PASS / FAIL / REVIEW / N/A selection.', { item:item, fieldBlockingRule:true }));
    }

    if (status === 'FAIL') {
      if (!hasReason(item)) {
        issues.push(issue('FAILED_ITEM_MISSING_NOTATION', SEVERITY.BLOCKER, 'FAIL requires notation before the field process can continue.', { item:item, fieldBlockingRule:true }));
      } else {
        issues.push(issue('FAILED_ITEM_WITH_NOTATION', SEVERITY.REVIEW, 'FAIL is documented and remains visible for review.', { item:item }));
      }
    }

    if (status === 'NA') {
      if (!hasReason(item)) issues.push(issue('NA_MISSING_REASON', mode === MODE.FIELD ? SEVERITY.REVIEW : SEVERITY.REVIEW, 'N/A should include a reason.', { item:item }));
      if (!hasReference(item)) issues.push(issue('NA_MISSING_REFERENCE', SEVERITY.REVIEW, 'N/A should include a supporting reference when available.', { item:item }));
    }

    if (status === 'REVIEW' && !hasReason(item)) {
      issues.push(issue('REVIEW_MISSING_NOTES', SEVERITY.REVIEW, 'Review item should include notes.', { item:item }));
    }

    var textForRules = upper([item.validationRule, item.rule, item.evidenceRequired, item.source, item.title, item.description].join(' '));
    var referenceRequired = /DOCUMENT|REFERENCE|SOURCE|DRAWING|SPEC|SUBMITTAL|REQUIREMENT/.test(textForRules);
    if (referenceRequired && !hasReference(item)) {
      issues.push(issue('MISSING_REFERENCE', SEVERITY.REVIEW, 'Checklist item is missing a source/reference.', { item:item }));
    }

    if (item.aiCheck) {
      var aiStatus = upper(item.aiCheck.status || item.aiCheck.state || '');
      if (aiStatus === 'BLOCKED' || aiStatus === 'FAIL' || aiStatus === 'FAILED') {
        issues.push(issue('AI_CHECK_REVIEW', SEVERITY.REVIEW, clean(item.aiCheck.message || 'AI/Vanguard check requires review.'), { aiCheck:item.aiCheck }));
      }
      var conf = numeric(item.aiCheck.confidence);
      if (conf != null && conf > 1) conf = conf / 100;
      if (conf != null && conf > 0 && conf < (options.minimumConfidence || 0.82)) {
        issues.push(issue('LOW_CONFIDENCE', SEVERITY.REVIEW, 'Validation confidence is below threshold.', { confidence:conf, aiCheck:item.aiCheck }));
      }
    }

    var finalStatus = issues.some(function(i){ return i.severity === SEVERITY.BLOCKER; }) ? STATUS.BLOCKED : issues.length ? STATUS.REVIEW : STATUS.PASS;
    return result('checklist:item', finalStatus, finalStatus === STATUS.PASS ? 'Checklist item can proceed.' : finalStatus === STATUS.BLOCKED ? 'Checklist item is blocked by field rule.' : 'Checklist item can proceed with review notation.', issues, { mode:mode, item:item });
  }

  function validateChecklist(items, options){
    options = options || {};
    var mode = normalizeMode(options);
    var list = Array.isArray(items) ? items : (items && Array.isArray(items.steps) ? items.steps : []);
    var itemResults = list.map(function(item, index){
      var r = validateChecklistItem(item, options);
      r.index = index;
      r.stepId = clean(item && (item.id || item.stepId || item.step));
      r.title = clean(item && (item.title || item.description || item.stepDescription));
      return r;
    });
    var issues = [];
    itemResults.forEach(function(r){
      if (r.status !== STATUS.PASS) {
        var sev = r.status === STATUS.BLOCKED ? SEVERITY.BLOCKER : SEVERITY.REVIEW;
        issues.push(issue('CHECKLIST_ITEM_' + r.status, sev, 'Step ' + (r.index + 1) + ': ' + (r.message || 'Review required.'), { itemResult:r }));
      }
    });
    var finalStatus = issues.some(function(i){ return i.severity === SEVERITY.BLOCKER; }) ? STATUS.BLOCKED : issues.length ? STATUS.REVIEW : STATUS.PASS;
    return result('checklist', finalStatus, finalStatus === STATUS.PASS ? 'Checklist can proceed.' : finalStatus === STATUS.BLOCKED ? 'Checklist is blocked by field rule.' : 'Checklist can proceed with review items.', issues, { mode:mode, itemResults:itemResults, total:list.length });
  }

  function validateConflicts(options){
    options = options || {};
    var mode = normalizeMode(options);
    var raw = readJSON(CONFLICTS_KEY, { conflicts:[] });
    var conflicts = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.conflicts) ? raw.conflicts : []);
    var open = conflicts.filter(function(c){
      var s = upper(c.status || c.state || 'REVIEW');
      return !(s === 'PASS' || s === 'RESOLVED' || s === 'APPROVED' || s === 'CLOSED' || s === 'OVERRIDDEN');
    });
    var issues = open.map(function(c){ return issue('OPEN_DOCUMENT_CONFLICT', SEVERITY.REVIEW, clean(c.message || c.reason || 'Open document conflict requires engineering review.'), { conflict:c }); });
    return result('documents:conflicts', issues.length ? STATUS.REVIEW : STATUS.PASS, issues.length ? 'Open document conflicts need engineering review but do not stop field execution.' : 'No open document conflicts.', issues, { mode:mode, conflicts:conflicts, openConflicts:open });
  }

  function localStepComplete(eq, step){
    var keys = [
      'nexus_' + eq + '_step_' + step,
      'nexus_' + eq + '_' + step + '_complete',
      'nexus_' + eq + '_' + step + '_completed',
      'nexus_' + eq + '_' + step + '_done',
      'nexus_' + eq + '_' + step + '_validated',
      'nexus_' + eq + '_' + step + '_signed_off'
    ];
    if (step === 'meg') {
      keys.push('nexus_' + eq + '_step_megohmmeter_line');
      keys.push('nexus_' + eq + '_step_megohmmeter_load');
    }
    return keys.some(function(k){ return ['1','true','yes','complete','completed','done','pass','passed','validated'].indexOf(lower(localStorage.getItem(k))) !== -1; });
  }

  function validateWorkflow(eq, options){
    options = options || {};
    eq = clean(eq || getEq());
    var issues = [];
    var checks = MODULE_SEQUENCE.map(function(step){
      var complete = localStepComplete(eq, step.id);
      if (!complete) issues.push(issue('WORKFLOW_STEP_INCOMPLETE', SEVERITY.BLOCKER, step.label + ' is not complete.', { step:step.id, label:step.label, fieldBlockingRule:true }));
      return { step:step.id, label:step.label, complete:complete };
    });
    return result('workflow', issues.length ? STATUS.BLOCKED : STATUS.PASS, issues.length ? 'Required field process is incomplete.' : 'Required field process is complete.', issues, { mode:normalizeMode(options), eq:eq, checks:checks });
  }

  function validateEngineeringSetup(eq, options){
    options = options || {};
    eq = clean(eq || getEq());
    var checks = [];
    checks.push(validateConflicts({ mode:MODE.ENGINEERING }));

    var requirements = requirementsAsArray();
    var reviewReqs = requirements.filter(function(req){ return req && !(req.approved || req.enforce || lower(req.state) === 'approved'); });
    var noCitation = requirements.filter(function(req){ return req && !hasCitation(req); });
    var issues = [];

    reviewReqs.forEach(function(req){
      issues.push(issue('REQUIREMENT_NEEDS_ENGINEER_REVIEW', SEVERITY.REVIEW, 'Requirement needs engineer review before enforcement.', { requirement:req }));
    });
    noCitation.forEach(function(req){
      issues.push(issue('REQUIREMENT_MISSING_CITATION', SEVERITY.REVIEW, 'Requirement is missing citation/source reference.', { requirement:req }));
    });

    checks.forEach(function(check){ issues = issues.concat(check.issues || []); });
    return result('engineering-setup', issues.length ? STATUS.REVIEW : STATUS.PASS, issues.length ? 'Engineering setup has review items.' : 'Engineering setup has no open review items.', issues, { mode:MODE.ENGINEERING, eq:eq, requirementCount:requirements.length, reviewRequirementCount:reviewReqs.length, checks:checks });
  }

  function validatePackage(eq, options){
    options = options || {};
    var mode = normalizeMode(options);
    eq = clean(eq || getEq());
    var checks = [];
    var issues = [];

    checks.push(validateWorkflow(eq, { mode:mode }));

    var ccsPayload = readJSON('nexus_' + eq + '_ccs_vanguard_export', null);
    if (ccsPayload && Array.isArray(ccsPayload.steps)) {
      checks.push(validateChecklist(ccsPayload.steps, { eq:eq, mode:mode }));
    } else {
      issues.push(issue('MISSING_CCS_PAYLOAD', SEVERITY.REVIEW, 'CCS Vanguard export payload is missing.', { eq:eq }));
    }

    var engineering = validateEngineeringSetup(eq, { mode:MODE.ENGINEERING });
    checks.push(engineering);

    checks.forEach(function(check){
      (check.issues || []).forEach(function(i){ issues.push(i); });
    });

    var fieldBlockers = issues.filter(function(i){ return i && i.severity === SEVERITY.BLOCKER; });
    var reviews = issues.filter(function(i){ return i && i.severity === SEVERITY.REVIEW; });
    var finalStatus = fieldBlockers.length ? STATUS.BLOCKED : reviews.length ? STATUS.REVIEW : STATUS.PASS;
    var message = finalStatus === STATUS.BLOCKED
      ? 'Field process is blocked because required work is incomplete or a FAIL is missing notation.'
      : finalStatus === STATUS.REVIEW
        ? 'Field process can continue; engineering/review items remain visible.'
        : 'Field process can continue.';

    var out = result('package', finalStatus, message, fieldBlockers.concat(reviews), { mode:mode, eq:eq, checks:checks, engineeringSetup:engineering });
    writeJSON(AUTHORITY_KEY_PREFIX + eq, out);
    return out;
  }

  function explain(authorityResult){
    authorityResult = authorityResult || {};
    var lines = [];
    lines.push((authorityResult.status || 'REVIEW') + ': ' + (authorityResult.message || 'Validation authority result.'));
    (authorityResult.issues || []).slice(0, 8).forEach(function(i){ lines.push('- ' + i.message); });
    return lines.join('\n');
  }

  function assertCanPass(scope, payload, options){
    var out;
    var s = lower(scope);
    options = options || {};
    if (s === 'checklist' || s === 'ccs') out = validateChecklist(payload, Object.assign({}, options, { mode:normalizeMode(options) }));
    else if (s === 'package') out = validatePackage(payload && (payload.eq || payload.equipmentId) || getEq(payload), Object.assign({}, options, { mode:normalizeMode(options) }));
    else if (s === 'engineering' || s === 'engineering-setup') out = validateEngineeringSetup(payload && (payload.eq || payload.equipmentId) || getEq(payload), Object.assign({}, options, { mode:MODE.ENGINEERING }));
    else if (s === 'numeric' || s === 'torque' || s === 'meg') out = validateNumericEntry(payload, Object.assign({}, options, { type:s === 'numeric' ? (options && options.type) : upper(s), mode:normalizeMode(options) }));
    else out = result(scope, STATUS.REVIEW, 'No authority validator exists for scope: ' + scope, [issue('UNKNOWN_AUTHORITY_SCOPE', SEVERITY.REVIEW, 'No validator exists for this scope.', { scope:scope })]);
    if (out.status === STATUS.BLOCKED) {
      var err = new Error(explain(out));
      err.authorityResult = out;
      throw err;
    }
    return out;
  }

  var api = {
    __installed:true,
    version:VERSION,
    MODE:MODE,
    STATUS:STATUS,
    SEVERITY:SEVERITY,
    normalizeStatus:normalizeStatus,
    normalizeMode:normalizeMode,
    normalizeUnit:normalizeUnit,
    convertNumeric:convertNumeric,
    compareNumeric:compareNumeric,
    approvedRequirements:approvedRequirements,
    requireApprovedRequirement:requireApprovedRequirement,
    validateNumericEntry:validateNumericEntry,
    validateChecklistItem:validateChecklistItem,
    validateChecklist:validateChecklist,
    validateConflicts:validateConflicts,
    validateWorkflow:validateWorkflow,
    validateEngineeringSetup:validateEngineeringSetup,
    validatePackage:validatePackage,
    assertCanPass:assertCanPass,
    explain:explain
  };

  window.NEXUS_VANGUARD_VALIDATION_AUTHORITY = api;
  window.VanguardValidationAuthority = api;
  window.NEXUS = window.NEXUS || {};
  window.NEXUS.VanguardValidationAuthority = api;

  try { window.dispatchEvent(new CustomEvent('vanguard:validation-authority-ready', { detail:{ version:VERSION } })); } catch(e) {}
})();
