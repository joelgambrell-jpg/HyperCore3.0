import { extractRequirementsLocally } from '../services/local_requirement_rules.js';

const text = `
Main lug torque shall be 275 in-lb.
Minimum insulation resistance shall be 11 MΩ.
Foreman shall verify final torque.
Remove all foreign object debris before FPV.
`;

const reqs = extractRequirementsLocally(text, { sourceDocument: 'smoke-test' });

if (reqs.length < 4) {
  console.error('Expected at least 4 requirements, got', reqs);
  process.exit(1);
}

console.log('Backend smoke test PASS:', reqs.length, 'requirements');
