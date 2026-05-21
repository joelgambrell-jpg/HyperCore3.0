# NEXUS Vanguard Backend

Backend service for real document extraction, OCR fallback, and AI requirement extraction.

## Run locally

```bash
cd backend
cp .env.example .env
npm install
npm run check
npm run dev
```

Health check:

```bash
curl http://localhost:8787/health
```

## Configure frontend

Open `vanguard_control_center.html`, set:

```plaintext
http://localhost:8787
```

in the Vanguard Backend URL box.

## What works

- Text PDFs: extracted with `pdf-parse`
- Images/scanned docs: OCR with Tesseract
- Text/manual input: deterministic local extraction
- AI extraction: enabled only when `OPENAI_API_KEY` is present
- Engineer review remains required before requirements become active

## Production notes

- Put this behind HTTPS.
- Do not expose API keys in frontend code.
- Add auth before real project deployment.
- Store approved requirements in Firebase after engineer approval.
