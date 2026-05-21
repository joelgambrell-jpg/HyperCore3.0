import OpenAI from 'openai';
import { z } from 'zod';

const RequirementSchema = z.object({
  requirementType: z.string(),
  value: z.string(),
  appliesTo: z.string().optional().default(''),
  sourceDocument: z.string().optional().default(''),
  page: z.union([z.string(), z.number()]).optional().default(''),
  exactText: z.string().optional().default(''),
  confidence: z.number().min(0).max(100).optional().default(70),
  reason: z.string().optional().default('')
});

const ResponseSchema = z.object({
  requirements: z.array(RequirementSchema),
  conflicts: z.array(z.object({
    type: z.string(),
    message: z.string(),
    options: z.array(z.string()).optional().default([]),
    recommended: z.string().optional().default(''),
    reason: z.string().optional().default('')
  })).optional().default([]),
  notes: z.array(z.string()).optional().default([])
});

function chunkText(text, maxChars = 18000) {
  const raw = String(text || '');
  const chunks = [];
  for (let i = 0; i < raw.length; i += maxChars) {
    chunks.push(raw.slice(i, i + maxChars));
  }
  return chunks.length ? chunks : [''];
}

function safeJsonParse(text) {
  const raw = String(text || '').trim();
  try {
    return JSON.parse(raw);
  } catch (_err) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw _err;
  }
}

export async function extractRequirementsWithAI({ text, sourceDocument = '', localRequirements = [] }) {
  const enabled = String(process.env.AI_ENABLED || 'true') === 'true';

  if (!enabled || !process.env.OPENAI_API_KEY) {
    return {
      status: 'AI_DISABLED_OR_NO_KEY',
      model: null,
      requirements: [],
      conflicts: [],
      notes: ['AI extraction skipped. OPENAI_API_KEY missing or AI_ENABLED=false.']
    };
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_REQUIREMENT_MODEL || 'gpt-5.5';
  const chunks = chunkText(text);
  const merged = {
    requirements: [],
    conflicts: [],
    notes: []
  };

  for (let i = 0; i < chunks.length; i += 1) {
    const prompt = `
You are NEXUS Vanguard, an electrical construction QA/QC requirement extraction engine.

Extract only concrete field-verifiable requirements from this document text.

Return STRICT JSON ONLY:
{
  "requirements": [
    {
      "requirementType": "TORQUE | MEG | L2 | PREFOD | FPV | PHOTO_REQUIRED | APPROVAL_REQUIRED | DOCUMENT_REFERENCE_REQUIRED | OTHER",
      "value": "exact requirement value",
      "appliesTo": "component/equipment if known",
      "sourceDocument": "${sourceDocument}",
      "page": "page if known",
      "exactText": "short exact source text",
      "confidence": 0-100,
      "reason": "why this is a requirement"
    }
  ],
  "conflicts": [
    {
      "type": "TORQUE | MEG | OTHER",
      "message": "conflict explanation",
      "options": ["option A", "option B"],
      "recommended": "recommended stricter/higher-authority value",
      "reason": "why"
    }
  ],
  "notes": []
}

Rules:
- Do not invent values.
- If unsure, lower confidence.
- Prefer exact text and page/source traceability.
- Flag contradictions.
- Do not approve anything. Engineer approval is required.

Document chunk ${i + 1}/${chunks.length}:
${chunks[i]}
`;

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: 'Return strict JSON only. No markdown.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1
    });

    const content = response.choices?.[0]?.message?.content || '{}';
    const parsed = ResponseSchema.parse(safeJsonParse(content));

    merged.requirements.push(...parsed.requirements.map((req) => ({
      ...req,
      sourceDocument: req.sourceDocument || sourceDocument,
      extractionMethod: 'OPENAI_AI',
      id: `AI-${Date.now()}-${Math.floor(Math.random() * 100000)}`
    })));

    merged.conflicts.push(...parsed.conflicts);
    merged.notes.push(...parsed.notes);
  }

  return {
    status: 'AI_EXTRACTED',
    model,
    requirements: merged.requirements,
    conflicts: merged.conflicts,
    notes: merged.notes
  };
}
