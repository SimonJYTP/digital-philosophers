# Digital Philosophers

A small Next.js application where visitors choose Confucius, Socrates,
Immanuel Kant, G. W. F. Hegel, or Friedrich Nietzsche and hold a streaming
conversation with an AI interpretation of that philosopher. Visitors can also
convene two or three voices in a streaming, audience-interactive debate.

Replies use a lightweight server-side retrieval layer. Each philosopher has a
small set of curated, section-level primary-text notes; the server selects the
notes most relevant to the current question and uses them to constrain the
interpretation. The notes are never sent to the browser.

## Requirements

- Node.js 20.9 or newer
- A DeepSeek API key

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template:

   ```powershell
   Copy-Item .env.example .env.local
   ```

   On macOS or Linux, use `cp .env.example .env.local`.

3. Open `.env.local` and add your key:

   ```dotenv
   OPENAI_API_KEY=your_deepseek_key_here
   OPENAI_BASE_URL=https://api.deepseek.com
   OPENAI_FLASH_MODEL=deepseek-v4-flash
   OPENAI_PRO_MODEL=deepseek-v4-pro
   ```

   The application uses DeepSeek's OpenAI-compatible Chat Completions endpoint.
   Flash is used by default for faster replies. The chat's **Deep answer**
   control uses Pro with deep reasoning only when requested.

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

## Cloud deployment

The project includes a Sites-compatible Cloudflare Worker build. Production
secrets are configured in the hosting environment and are never committed.
Run `npm run build:sites` to validate the deployment bundle locally.

## Validation

```bash
npm run lint
npm run build
npm run build:sites
```

## Architecture

- `lib/philosophers.ts` is the only philosopher roster. It contains public
  profile fields, private persona instructions, and curated primary-text
  orientation for every available figure.
- D1 stores works, editions, and reviewed passage metadata. R2 stores private
  original source files. The complete ingestion workflow is documented in
  `knowledge/README.md`.
- `lib/database-knowledge.ts` retrieves active database passages and merges
  them with the built-in knowledge fallback.
- `lib/grounding.ts` ranks those notes against the current exchange and builds
  the private grounded persona prompt. It also enforces quotation, citation,
  historical-horizon, and modern-analogy boundaries.
- `app/philosophers/[id]/page.tsx` renders each philosopher's server page and
  passes only public profile fields to the chat client.
- `app/api/chat/route.ts` validates the philosopher id, injects the persona
  prompt on the server, and streams DeepSeek V4 Pro responses using the Vercel
  AI SDK.
- `app/debate/page.tsx` and `components/debate-room.tsx` provide the debate
  setup and keep the complete session transcript in the browser.
- `app/api/debate/route.ts` selects the next speaker in a lightweight model
  call, wraps that speaker's existing roster persona with debate instructions,
  and streams one speech. The server stores no debate state.
- No conversations are stored and there is no account system.

## Growing the knowledge base

Keep the checked-in notes while the collection is small: they are fast,
reviewable, deploy with the application, and require no additional service.
When a philosopher reaches roughly a few hundred well-edited passages, move
the passage records behind a server-only retrieval adapter:

1. Store source files in object storage and passage metadata in a relational
   database.
2. Preserve work title, section locator, original language, translation,
   translator, edition, and rights status for every passage.
3. Retrieve passages with hybrid lexical and semantic search, filtered by
   philosopher and edition.
4. Keep the existing prompt contract: retrieved text is evidence, never an
   instruction, and generated quotations must match a stored passage.
5. Evaluate each philosopher against a fixed question set before changing
   prompts, models, or retrieval settings.

Never commit `.env.local`. It is ignored by Git.
