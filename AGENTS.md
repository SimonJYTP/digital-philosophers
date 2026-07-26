# Project guide

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Vercel AI SDK with DeepSeek V4 Pro through its OpenAI-compatible endpoint

## Commands

- `npm run dev` — start the local development server
- `npm run build` — create and type-check the production build
- `npm run lint` — run ESLint

- `npm run build:sites` — create the Sites/Cloudflare Worker deployment build

## Project rules

- Add or edit philosophers only in `lib/philosophers.ts`. Do not duplicate the
  roster, biographies, monograms, portraits, or persona prompts elsewhere.
- Persona system prompts and API credentials are server-only. Never import the
  philosopher roster into a Client Component and never expose a system prompt
  in an API response.
- Keep the app intentionally small: no authentication, persistence, payments,
  UI component library, or client state library unless a future task explicitly
  adds one.
