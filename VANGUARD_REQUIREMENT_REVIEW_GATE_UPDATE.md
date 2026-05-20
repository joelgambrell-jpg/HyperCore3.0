# Vanguard Requirement Review + Approval Gate

Implemented a real human approval gate for AI/document-derived requirements.

## Added
- `vanguard_requirement_review.html` engineer review screen.
- `assets/js/vanguard_requirement_review_gate.js` approval/publish module.
- Loader integration so full/dashboard document workflows include the approval gate.
- Control Center link to Requirement Review.
- Package Export approved requirement traceability section.

## Functional behavior
- Extracted requirements remain pending until reviewed.
- Engineer/foreman/superintendent/admin-style roles can approve, correct+approve, or reject.
- Only approved requirements become `approvedRequirements`, `selectedRequirements`, and `activeRequirementRules`.
- Published rules register Vanguard evidence for customer traceability.
- Field pages are not burdened with AI review UI.

## Methodology preserved
- Field: simple status and next action.
- Office: review/correct/approve.
- Customer: clean requirement → evidence → approval documentation.

Firebase config/privacy unchanged.
