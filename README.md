# The Living Archive

A small Next.js application where visitors choose Confucius, Socrates,
Immanuel Kant, G. W. F. Hegel, or Friedrich Nietzsche and hold a streaming
conversation with an AI interpretation of that philosopher.

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
   OPENAI_MODEL=deepseek-v4-pro
   ```

   The application uses DeepSeek's OpenAI-compatible Chat Completions endpoint.
   Keep the variable names above because the server uses the Vercel AI SDK's
   OpenAI-compatible provider.

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
  profile fields and private persona instructions for every available figure.
- `app/philosophers/[id]/page.tsx` renders each philosopher's server page and
  passes only public profile fields to the chat client.
- `app/api/chat/route.ts` validates the philosopher id, injects the persona
  prompt on the server, and streams DeepSeek V4 Pro responses using the Vercel
  AI SDK.
- No conversations are stored and there is no account system.

Never commit `.env.local`. It is ignored by Git.
