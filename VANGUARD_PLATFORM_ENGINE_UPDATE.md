# Vanguard Platform Engine Update

Implemented the next architecture step: moving NEXUS/HyperCore from page-driven logic toward a shared Vanguard workflow engine.

## Added / strengthened

- `assets/js/vanguard_core.js`
  - Added canonical platform API:
    - `Vanguard.getCanonicalState(eq)`
    - `Vanguard.getWorkflowOrder()`
    - `Vanguard.getStepStatus(eq, stepId)`
    - `Vanguard.canAdvance(eq, stepId)`
    - `Vanguard.completeStep(stepId, metadata)`
    - `Vanguard.registerEvidence(group, data)`
    - `Vanguard.validateRequirement(requirementId, observed, options)`
    - `Vanguard.getReadiness(eq)`
  - Added dependency-aware step gating.
  - Added centralized evidence registration.
  - Added centralized requirement validation.
  - Preserved existing localStorage step keys for compatibility.

- Added new platform facade modules:
  - `assets/js/vanguard_state.js`
  - `assets/js/vanguard_rules.js`
  - `assets/js/vanguard_evidence.js`
  - `assets/js/vanguard_rules_validation.js`
  - `assets/js/vanguard_export_state.js`
  - `assets/js/vanguard_ai.js`

- Updated `assets/js/vanguard_loader.js`
  - Core mode now loads the platform facade modules after `vanguard_core.js`.
  - Existing mode behavior remains intact.

- Wired platform modules into active field pages:
  - `equipment.html`
  - `construction_check_sheet_import.html`
  - `torque_log.html`
  - `meg_log.html`
  - `package_export.html` already uses loader export mode.

## Purpose

Pages can now increasingly call the Vanguard engine for state, readiness, gating, evidence, and requirement validation instead of owning business logic independently.

This is a migration-safe platform layer: old page behavior remains compatible while the system moves toward a single source of truth.

## Validation performed

- JavaScript syntax check passed for:
  - `vanguard_core.js`
  - `vanguard_loader.js`
  - all new Vanguard platform facade modules

Firebase config/privacy was not changed.
