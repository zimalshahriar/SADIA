# SADIA - Smart Autonomous Digital Intelligence Assistant

## Setup

1. Copy `.env.example` to `.env` and set your Gemini key:

	VITE_GEMINI_API_KEY=your_gemini_api_key_here

2. Install dependencies and start:

	- Windows (cmd):
	  - npm install
	  - npm run dev

## Notes

- Vite only exposes variables prefixed with `VITE_` to the client.
- The key is read in `src/ai/gemini.ts`.
- Keep `.env` out of version control (already in `.gitignore`).
