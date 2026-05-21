function clean(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function makeRequirement(type, value, line, meta = {}, confidence = 70) {
  return {
    id: `REQ-${type}-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    requirementType: type,
    value: clean(value),
    exactText: clean(line),
    appliesTo: clean(meta.appliesTo || ''),
    sourceDocument: clean(meta.sourceDocument || ''),
    page: clean(meta.page || ''),
    line: meta.line || null,
    units: clean(meta.units || ''),
    numericValue: meta.numericValue == null ? null : Number(meta.numericValue),
    confidence: Math.max(0, Math.min(100, Number(confidence))),
    extractionMethod: 'LOCAL_RULES'
  };
}

export function extractRequirementsLocally(text, meta = {}) {
  const lines = String(text || '').split(/\r?\n/).map(clean).filter(Boolean);
  const out = [];

  lines.forEach((line, index) => {
    const context = { ...meta, line: index + 1 };
    const lower = line.toLowerCase();

    let match;
    const torque = /(\d+(?:\.\d+)?)\s*(in[\s-]*lb|in[\s-]*lbs|inch[\s-]*pounds?|ft[\s-]*lb|ft[\s-]*lbs|foot[\s-]*pounds?|n[\s-]*m|nm)\b/ig;
    while ((match = torque.exec(line))) {
      out.push(makeRequirement('TORQUE', match[0], line, {
        ...context,
        numericValue: match[1],
        units: match[2].replace(/\s+/g, '').toLowerCase()
      }, lower.includes('torque') ? 90 : 72));
    }

    const meg = /(\d+(?:\.\d+)?)\s*(mω|mohm|megohm|megohms|m\s*ohm|m\s*Ω|MΩ|MΩ)/ig;
    while ((match = meg.exec(line))) {
      out.push(makeRequirement('MEG', match[0], line, {
        ...context,
        numericValue: match[1],
        units: 'MΩ'
      }, lower.includes('insulation') || lower.includes('meg') ? 90 : 72));
    }

    if (/(foreign object|debris|fod|cleanliness|remove debris|vacuum)/i.test(line)) {
      out.push(makeRequirement('PREFOD', line, line, context, 78));
    }

    if (/(photo|photograph|picture|image|visual record|final product verification|fpv)/i.test(line)) {
      out.push(makeRequirement('PHOTO_REQUIRED', line, line, context, 74));
    }

    if (/(foreman|supervisor|engineer|approval|verify|sign[\s-]*off|witness)/i.test(line)) {
      out.push(makeRequirement('APPROVAL_REQUIRED', line, line, context, 70));
    }
  });

  return out;
}
