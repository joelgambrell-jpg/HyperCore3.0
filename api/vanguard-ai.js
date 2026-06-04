/*
  api/vanguard-ai.js
  HyperCore / NEXUS Vanguard private AI endpoint

  Deployment target: Vercel-style Node serverless function.

  Required env:
  - GEMINI_API_KEY

  Optional env:
  - GEMINI_MODEL=gemini-2.5-flash
  - NEXUS_AI_ALLOWED_ORIGIN=https://joelgambrell-jpg.github.io

  Contract:
  - Accepts the existing browser client body from assets/js/nexus-ai-client.js
  - Returns the existing structured Vanguard result shape:
    { id, task, source, createdAt, confidence, state, summary, findings, requirements, mappings, conflicts, citations, actions }
*/

'use strict';

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_TEXT_CHARS = 120000;

function nowISO() {
  return new Date().toISOString();
}

function stableId(prefix) {
  return `${prefix || 'vanguard'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function text(value) {
  return String(value == null ? '' : value).trim();
}

function safeJsonParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

function truncateLargeStrings(value, maxChars) {
  const limit = Number(maxChars) || MAX_TEXT_CHARS;
  if (typeof value === 'string') return value.length > limit ? value.slice(0, limit) : value;
  if (Array.isArray(value)) return value.map((item) => truncateLargeStrings(item, limit));
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach((key) => {
      out[key] = truncateLargeStrings(value[key], limit);
    });
    return out;
  }
  return value;
}

function corsHeaders(req) {
  const configured = text(process.env.NEXUS_AI_ALLOWED_ORIGIN);
  const origin = text(req.headers.origin || req.headers.Origin);
  const allowedOrigin = configured || origin || '*';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  };
}

function send(res, statusCode, payload, headers) {
  res.statusCode = statusCode;
  Object.entries(headers || {}).forEach(([key, value]) => res.setHeader(key, value));
  res.end(JSON.stringify(payload));
}

function normalizeCitation(citation) {
  citation = citation && typeof citation === 'object' ? citation : {};
  return {
    source: text(citation.source || citation.sourceName || citation.document || citation.documentName || 'Unknown source'),
    locator: text(citation.locator || citation.page || citation.section || citation.reference || ''),
    quote: text(citation.quote || citation.excerpt || ''),
    confidence: clampNumber(citation.confidence, 0, 1, 0.5)
  };
}

function normalizeRequirement(req) {
  req = req && typeof req === 'object' ? req : {};
  const citations = Array.isArray(req.citations) ? req.citations.map(normalizeCitation) : [];
  if (!citations.length && (req.sourceName || req.source || req.page || req.section)) {
    citations.push(normalizeCitation({
      source: req.sourceName || req.documentName || req.source,
      locator: [req.page ? `p. ${req.page}` : '', req.section || ''].filter(Boolean).join(' '),
      quote: req.quote || req.text || '',
      confidence: req.confidence
    }));
  }

  return {
    id: text(req.id) || stableId('req'),
    type: text(req.type || req.category || 'general'),
    title: text(req.title || req.name || req.text || req.description || req.type || 'Requirement'),
    text: text(req.text || req.description || req.title || ''),
    value: req.value == null || req.value === '' ? null : Number(req.value),
    unit: text(req.unit || ''),
    tolerancePercent: req.tolerancePercent == null || req.tolerancePercent === '' ? null : Number(req.tolerancePercent),
    comparator: text(req.comparator || req.operator || ''),
    equipmentType: text(req.equipmentType || req.eqType || req.scope || ''),
    system: text(req.system || ''),
    sourceName: text(req.sourceName || req.documentName || req.filename || (req.source && req.source.name) || 'Uploaded Document'),
    sourceType: text(req.sourceType || req.documentType || (req.source && req.source.type) || 'document'),
    page: text(req.page || ''),
    section: text(req.section || ''),
    confidence: clampNumber(req.confidence, 0, 1, 0.5),
    state: text(req.state || 'review'),
    approved: false,
    enforce: false,
    citations
  };
}

function normalizeFinding(finding) {
  finding = finding && typeof finding === 'object' ? finding : {};
  return {
    id: text(finding.id) || stableId('finding'),
    type: text(finding.type || 'finding'),
    state: text(finding.state || 'review'),
    message: text(finding.message || finding.summary || finding.reason || ''),
    reason: text(finding.reason || finding.message || ''),
    requirementId: text(finding.requirementId || ''),
    requirementType: text(finding.requirementType || ''),
    enteredValue: finding.enteredValue == null ? null : finding.enteredValue,
    requiredValue: finding.requiredValue == null ? null : finding.requiredValue,
    unit: text(finding.unit || ''),
    confidence: clampNumber(finding.confidence, 0, 1, 0.5),
    citations: Array.isArray(finding.citations) ? finding.citations.map(normalizeCitation) : []
  };
}

function normalizeResult(task, raw, source) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const requirements = Array.isArray(raw.requirements) ? raw.requirements.map(normalizeRequirement) : [];
  const findings = Array.isArray(raw.findings) ? raw.findings.map(normalizeFinding) : [];
  const citations = Array.isArray(raw.citations) ? raw.citations.map(normalizeCitation) : [];

  let state = text(raw.state || 'review').toLowerCase();
  if (findings.some((f) => ['blocked', 'fail', 'failed'].includes(text(f.state).toLowerCase()))) state = 'blocked';
  if (!['pass', 'review', 'blocked', 'missing-info', 'mapped-review', 'weak-match-review'].includes(state)) state = 'review';

  return {
    id: text(raw.id) || stableId('vanguard'),
    task: task,
    source: source || 'gemini',
    createdAt: text(raw.createdAt) || nowISO(),
    confidence: clampNumber(raw.confidence, 0, 1, 0.5),
    state,
    summary: text(raw.summary || ''),
    findings,
    requirements,
    mappings: Array.isArray(raw.mappings) ? raw.mappings : [],
    conflicts: Array.isArray(raw.conflicts) ? raw.conflicts : [],
    citations,
    actions: Array.isArray(raw.actions) ? raw.actions : []
  };
}

function valueFromEntry(entry) {
  if (!entry || typeof entry !== 'object') return NaN;
  const candidates = [entry.value, entry.measuredValue, entry.torque, entry.resistance, entry.reading, entry.ftlb, entry.ft_lbs, entry.nm];
  for (const candidate of candidates) {
    const n = Number(candidate);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

function deterministicCompare(entry, requirement) {
  const measured = valueFromEntry(entry);
  const required = Number(requirement && requirement.value);
  const unit = text(requirement && requirement.unit);
  const type = text(requirement && requirement.type).toLowerCase();
  const comparator = text(requirement && requirement.comparator).toLowerCase();

  if (!Number.isFinite(measured) || !Number.isFinite(required)) {
    return {
      type: 'numeric-validation',
      state: 'review',
      reason: 'Missing numeric value or approved numeric requirement.',
      enteredValue: Number.isFinite(measured) ? measured : null,
      requiredValue: Number.isFinite(required) ? required : null,
      unit
    };
  }

  let pass = false;
  let reason = '';

  if (comparator === 'equals' || comparator === '=' || comparator === 'exact') {
    pass = measured === required;
    reason = pass ? 'Measured value exactly matches requirement.' : 'Measured value does not exactly match requirement.';
  } else if (comparator === '<=' || comparator === 'max' || comparator === 'maximum') {
    pass = measured <= required;
    reason = pass ? 'Measured value is at or below maximum.' : 'Measured value exceeds maximum.';
  } else if (type.includes('meg') || type.includes('resistance') || comparator === '>=' || comparator === 'min' || comparator === 'minimum') {
    pass = measured >= required;
    reason = pass ? 'Measured value meets or exceeds minimum requirement.' : 'Measured value is below minimum requirement.';
  } else if (type.includes('torque')) {
    const tolerance = Number.isFinite(Number(requirement.tolerancePercent)) ? Number(requirement.tolerancePercent) : 10;
    const low = required * (1 - tolerance / 100);
    const high = required * (1 + tolerance / 100);
    pass = measured >= low && measured <= high;
    reason = pass ? `Measured torque is within ${tolerance}% tolerance.` : `Measured torque is outside ${tolerance}% tolerance.`;
  } else {
    pass = measured >= required;
    reason = pass ? 'Measured value meets requirement.' : 'Measured value does not meet requirement.';
  }

  return {
    type: 'numeric-validation',
    state: pass ? 'pass' : 'blocked',
    reason,
    enteredValue: measured,
    requiredValue: required,
    unit,
    requirementId: requirement.id || '',
    requirementType: requirement.type || '',
    citations: Array.isArray(requirement.citations) ? requirement.citations : []
  };
}

function applyDeterministicValidation(task, result, payload) {
  if (task !== 'validateEntry') return result;

  const entry = payload && payload.entry ? payload.entry : {};
  const requirements = Array.isArray(payload && payload.requirements) ? payload.requirements.map(normalizeRequirement) : [];
  if (!requirements.length) {
    result.state = 'review';
    result.summary = result.summary || 'No approved requirement available for validation.';
    result.actions.push({ type: 'engineer-review', label: 'Approve a requirement before this entry can pass.' });
    return result;
  }

  const deterministicFindings = requirements.map((req) => normalizeFinding(deterministicCompare(entry, req)));
  const blocked = deterministicFindings.some((finding) => finding.state === 'blocked');

  result.findings = result.findings.concat(deterministicFindings);
  result.state = blocked ? 'blocked' : 'pass';
  result.confidence = Math.max(result.confidence, 0.86);
  result.summary = blocked
    ? 'One or more numeric values do not meet the approved requirement.'
    : 'Entry satisfies the approved numeric requirement check.';

  if (blocked) {
    result.actions.push({ type: 'block', label: 'Correct the value or route to engineer/supervisor review.' });
  }

  return result;
}

function schemaForTask(task) {
  const citation = {
    type: 'object',
    properties: {
      source: { type: 'string' },
      locator: { type: 'string' },
      quote: { type: 'string' },
      confidence: { type: 'number' }
    },
    required: ['source', 'locator', 'quote', 'confidence']
  };

  const requirement = {
    type: 'object',
    properties: {
      id: { type: 'string' },
      type: { type: 'string' },
      title: { type: 'string' },
      text: { type: 'string' },
      value: { type: ['number', 'null'] },
      unit: { type: 'string' },
      tolerancePercent: { type: ['number', 'null'] },
      comparator: { type: 'string' },
      equipmentType: { type: 'string' },
      system: { type: 'string' },
      sourceName: { type: 'string' },
      sourceType: { type: 'string' },
      page: { type: 'string' },
      section: { type: 'string' },
      confidence: { type: 'number' },
      state: { type: 'string' },
      citations: { type: 'array', items: citation }
    },
    required: ['type', 'title', 'text', 'value', 'unit', 'sourceName', 'sourceType', 'confidence', 'state', 'citations']
  };

  const finding = {
    type: 'object',
    properties: {
      type: { type: 'string' },
      state: { type: 'string' },
      message: { type: 'string' },
      reason: { type: 'string' },
      requirementId: { type: 'string' },
      requirementType: { type: 'string' },
      enteredValue: { type: ['number', 'string', 'null'] },
      requiredValue: { type: ['number', 'string', 'null'] },
      unit: { type: 'string' },
      confidence: { type: 'number' },
      citations: { type: 'array', items: citation }
    },
    required: ['type', 'state', 'message', 'reason', 'confidence', 'citations']
  };

  return {
    type: 'object',
    properties: {
      confidence: { type: 'number' },
      state: { type: 'string' },
      summary: { type: 'string' },
      findings: { type: 'array', items: finding },
      requirements: { type: 'array', items: requirement },
      mappings: { type: 'array', items: { type: 'object' } },
      conflicts: { type: 'array', items: { type: 'object' } },
      citations: { type: 'array', items: citation },
      actions: { type: 'array', items: { type: 'object' } }
    },
    required: ['confidence', 'state', 'summary', 'findings', 'requirements', 'mappings', 'conflicts', 'citations', 'actions']
  };
}

function instructionForTask(task) {
  const shared = [
    'You are NEXUS Vanguard, a construction electrical QA/QC validation engine for mission critical equipment.',
    'Return only JSON matching the schema. Do not return markdown.',
    'Never invent references. Every requirement or validation finding must include citations when source text is available.',
    'If source information is missing, unclear, scanned, contradictory, or low confidence, set state to review or blocked.',
    'Field completion must be conservative: missing references, N/A without reason, failed items, and wrong numeric values cannot pass.',
    'Use stricter/higher-rated requirements when source documents conflict, but flag the conflict for engineer review.',
    'Requirement states should start as review, not approved. HyperCore requires human approval before enforcement.'
  ].join('\n');

  if (task === 'extractDocumentData') {
    return `${shared}\n\nTask: Extract measurable requirements, document references, page/section references, and possible conflicts from uploaded document text.`;
  }
  if (task === 'mapChecklistSteps') {
    return `${shared}\n\nTask: Map checklist steps to extracted requirements. Weak or uncertain matches must be review, not pass.`;
  }
  if (task === 'validateEntry') {
    return `${shared}\n\nTask: Validate the field entry against approved requirements. Numeric mismatches must be blocked. Include entered value, required value, unit, reason, and source reference.`;
  }
  if (task === 'explainFailure' || task === 'suggestCorrection') {
    return `${shared}\n\nTask: Explain why the item failed or needs review in plain field language, including the source requirement and the correction path.`;
  }
  return `${shared}\n\nTask: Analyze the provided HyperCore payload and return conservative Vanguard validation output.`;
}

async function callGemini(task, payload, config) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');

  const model = text((config && config.model) || DEFAULT_MODEL) || DEFAULT_MODEL;
  const safePayload = truncateLargeStrings(payload || {}, MAX_TEXT_CHARS);
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `${instructionForTask(task)}\n\nHyperCore task: ${task}\n\nPayload JSON:\n${JSON.stringify(safePayload, null, 2)}`
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseJsonSchema: schemaForTask(task)
    }
  };

  const url = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify(body)
  });

  const raw = await response.text();
  const data = safeJsonParse(raw, null);
  if (!response.ok) {
    const message = data && data.error && data.error.message ? data.error.message : `Gemini API failed with HTTP ${response.status}`;
    throw new Error(message);
  }

  const contentText = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts
    ? data.candidates[0].content.parts.map((part) => part.text || '').join('').trim()
    : '';

  const parsed = safeJsonParse(contentText, null);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Gemini did not return valid structured JSON.');
  }

  return parsed;
}

module.exports = async function handler(req, res) {
  const headers = corsHeaders(req);

  if (req.method === 'OPTIONS') {
    return send(res, 204, {}, headers);
  }

  if (req.method !== 'POST') {
    return send(res, 405, { error: 'Method not allowed. Use POST.' }, headers);
  }

  try {
    const body = typeof req.body === 'object' && req.body !== null ? req.body : safeJsonParse(req.body, {});
    const task = text(body.task || 'analyze');
    const payload = body.payload || {};
    const config = body.config || {};

    const geminiRaw = await callGemini(task, payload, config);
    const normalized = normalizeResult(task, geminiRaw, 'gemini');
    const finalResult = applyDeterministicValidation(task, normalized, payload);

    return send(res, 200, finalResult, headers);
  } catch (err) {
    return send(res, 500, {
      id: stableId('vanguard_error'),
      task: 'error',
      source: 'gemini-backend',
      createdAt: nowISO(),
      confidence: 0,
      state: 'review',
      summary: 'AI backend failed safely. Route this item to engineer review.',
      findings: [{
        id: stableId('finding'),
        type: 'backend-error',
        state: 'review',
        message: err && err.message ? err.message : String(err),
        reason: 'Backend validation did not complete.',
        requirementId: '',
        requirementType: '',
        enteredValue: null,
        requiredValue: null,
        unit: '',
        confidence: 0,
        citations: []
      }],
      requirements: [],
      mappings: [],
      conflicts: [],
      citations: [],
      actions: [{ type: 'engineer-review', label: 'Review manually until backend is restored.' }]
    }, headers);
  }
};
