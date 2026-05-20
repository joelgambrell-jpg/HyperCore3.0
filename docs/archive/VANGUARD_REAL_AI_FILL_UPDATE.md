# Vanguard Real AI Fill Update

## Purpose
Replaced the setup-page mock AI populate behavior with a real Vanguard document fill pathway.

## Changed Files
- `index.html`
- `torque_log.html`

## Functional Changes

### 1. Removed mock AI scan path
- Removed `mockAIDocumentScan()` from `index.html`.
- `AI Populate from Documentation` now calls `runVanguardDocumentFill()`.

### 2. Added real documentation intake to setup page
- Added multi-file documentation upload input.
- Added Vanguard Backend URL input.
- Supported file types include PDF, text, CSV, JSON, HTML/XML, and common image formats.

### 3. Wired real Vanguard client/backend flow
- `index.html` now loads:
  - `assets/js/vanguard_requirement_extractor.js`
  - `assets/js/vanguard_extraction_engine.js`
  - `assets/js/vanguard_backend_client.js`
  - `assets/js/vanguard_document_mapper.js`
- When a backend URL is configured, documents are sent to the backend extraction route.
- When backend is unavailable, browser extraction is used where possible.
- Stored Vanguard document library data can also be consumed.

### 4. Real requirement mapping
- Extracted requirements are passed into `VanguardDocumentMapper.setRequirements()`.
- Conflicts are detected through the mapper where available.
- The result is saved into the equipment metadata and Vanguard fill history.

### 5. Field-safe behavior
- Existing setup flow, equipment save behavior, QR generation, and page navigation were preserved.
- No CSS files were stripped or reduced.
- The AI panel remains simple: upload docs, set backend URL if needed, click populate, review missing/conflicts.

### 6. Cleaned placeholder wording
- Removed torque page language referring to Firebase hook placeholders and future PDF generation.
- Torque page now describes current local/live-sync behavior and Package Export consumption.

## Validation Performed
- JS syntax check passed for touched Vanguard client/parser files.
- Inline script syntax check passed for major workflow pages.
- Backend `npm run check` passed before packaging.
- Local reference check passed after excluding generated/template URLs and backend dependency folders.

## Deferred
- Firebase config/privacy hardening remains intentionally deferred per request.
- Production backend deployment/authentication still needs environment configuration before field rollout.
