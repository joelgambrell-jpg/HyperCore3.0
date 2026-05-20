# Vanguard Continuation Hardening Update

## Purpose
Continue the HyperCore/NEXUS Vanguard build after the real AI Fill update by removing remaining mock/demo wiring from active setup/control pages and tightening the real document-to-requirement-to-equipment flow.

## Changes Made

### 1. `index_equipment_registry.html` real Vanguard AI Fill
- Removed the remaining `mockAIDocumentScan()` path.
- Added documentation file upload input for Vanguard Fill.
- Added Vanguard Backend URL input.
- Loaded the real Vanguard extraction/backend/document mapper scripts.
- Wired the AI Populate button to the same real `runVanguardDocumentFill()` flow used by `index.html`.
- Preserved the existing equipment registry selector and existing page behavior.

### 2. `vanguard_control_center.html` publish hardening
- Removed hardcoded demo AI payload publishing.
- Removed hardcoded fallback equipment publishes for `TR-001`, `TR-004`, and `SWGR-02`.
- Publish All now publishes only equipment found in the real Vanguard requirement map for the selected project.
- Single-equipment publish now creates an unmapped/low-confidence record if no approved requirement map exists, instead of inventing fake torque/meg/phenolic data.
- Removed demo naming from the project selector and publish function names.

### 3. Real package behavior
- The system no longer claims fake AI-derived values from demo payloads when the documents have not actually produced a requirement map.
- Setup AI Fill now has consistent behavior between the active setup page and equipment registry setup page.
- Existing field-page styling and control layout were preserved.

## Validation Performed
- JS syntax check: PASS
- Inline HTML script syntax check: PASS
- Backend syntax check: PASS
- Static local reference check: PASS
- Remaining mock/demo active-code scan: PASS, only historical update log references remain

## Deferred / Not Changed
- Firebase config/privacy audit remains intentionally deferred.
- Full live browser click-through still requires a local/browser environment with file access and optional backend URL configured.
- Real scanned-PDF/image OCR requires backend dependencies and runtime environment.
