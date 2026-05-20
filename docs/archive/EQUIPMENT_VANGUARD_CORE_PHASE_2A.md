# Equipment VanguardCore Phase 2A Update

## Scope
This update converts `equipment.html` from page-guessed workflow status toward VanguardCore-driven workflow control while preserving existing localStorage/Firebase compatibility.

## Changed
- Added `data-vanguard-step` / `data-step` attributes to the equipment workflow buttons so the shared Vanguard workflow engine can identify and control them.
- Updated the equipment orchestration layer to prefer `VanguardCore` / `NEXUS_VANGUARD` canonical step status before falling back to legacy localStorage and exported section data.
- Added canonical step mapping for equipment page button IDs, including FPV compatibility between `fpv_photo` and core `fpv`.
- Added VanguardCore readiness check for Energization unlock logic.
- Added workflow lock handling on equipment buttons using `Vanguard.canAdvance()`.
- Added active-step visual glow when VanguardCore identifies the current required action.
- Updated the equipment status panel messaging to show whether VanguardCore is actively controlling workflow state.
- Added refresh after `vanguard_loader.js` completes so the page re-renders once core modules are available.

## Preserved
- Existing URLs and button routing.
- Existing localStorage step-completion compatibility keys.
- Existing Firebase live-sync listener behavior.
- Existing Package Export and readiness summary publishing.
- Firebase config/privacy remained unchanged.

## Validation
- All standalone JavaScript files pass syntax check.
- All inline `equipment.html` scripts pass syntax check.
