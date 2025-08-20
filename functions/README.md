Serverless Gemini proxy (Firebase Functions)

Endpoints
- POST /generateContent — forwards a prompt (and optional imageData) to Gemini using the server‑side API key.

Local dev
- Put your key in functions/.env as GEMINI_API_KEY=...
- npm run build; firebase emulators:start --only functions

Notes
- Deployed in asia-east1, Node.js 22, Gen 2.
- CORS is permissive by default; consider restricting to production origins.
