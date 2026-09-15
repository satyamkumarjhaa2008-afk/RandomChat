# RandomChat

RandomChat is a production-oriented anonymous 1-to-1 chat MVP: authenticate, enter the matchmaking queue, meet one stranger, message in real time, skip/end safely, and report or block users.

## Stack

- React 19 + TypeScript
- Vite
- Supabase Auth + PostgreSQL + RLS + Realtime
- Zod-ready validation boundary
- Vitest
- GitHub Actions CI
- Vercel-compatible static build

## Local development

1. Install Node.js 22+.
2. Copy `.env.example` to `.env.local`.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` using the Supabase project's browser-safe values.
4. Run:

```bash
npm install
npm run dev
```

Open the URL printed by Vite.

Validation commands:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## Supabase

The live RandomChat project is PostgreSQL 17 with RLS enabled on the application tables. Matchmaking is performed by the authenticated `find_match()` RPC and uses row locking plus unique active-chat indexes to protect against concurrent claims.

Migrations live under `supabase/migrations/`. Apply them through the Supabase CLI/dashboard workflow used by the project. Never paste service-role credentials into frontend code.

Authentication providers and redirect URLs must be configured in Supabase Authentication. For local development allow the local Vite origin; for production allow the actual Vercel domain. Do not guess a production hostname in source code.

## Architecture

`src/main.tsx` owns the MVP UI/state flow. Supabase Realtime uses one scoped channel per active conversation and one queue channel while searching. Messages are stored in PostgreSQL and protected by RLS. Conversation lifecycle changes use the `end_chat()` RPC. Block-aware matchmaking checks both directions of the block relationship.

The database contains profiles, queue entries, chats, messages, reports, blocks, and the existing call-event table. Active conversations are constrained so a user cannot be in two active chats simultaneously.

## Security

- Only publishable Supabase credentials belong in `VITE_*` variables.
- Service-role keys must remain server-side and are not required by this frontend.
- RLS protects application tables.
- Chat updates are not exposed through a general participant UPDATE policy; lifecycle changes use the controlled RPC.
- Message content is rendered as React text, not HTML.
- Messages are limited to 2,000 characters and have an authoritative database rate limit.
- Reports require the reporter to be the authenticated user and, when a chat is supplied, a participant in that chat.
- Blocks cannot target the current user.

## Deployment to Vercel

Connect the GitHub repository to Vercel. Vercel should detect Vite automatically.

Set these environment variables in Development, Preview, and Production as appropriate:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Then deploy. The GitHub Actions workflow also runs install, typecheck, lint, tests, and a production build on pushes/PRs.

## Current limitations

- The core MVP is text chat; the previous WebRTC voice/video/file-transfer implementation was removed from the active frontend during the architecture migration rather than being represented as production-ready functionality. TURN configuration is therefore not part of the current MVP.
- Automated content moderation is not implemented. Reporting and blocking are the authoritative MVP safety tools.
- Password reset and a richer profile/settings surface still require the corresponding UI flow to be added before they should be advertised as complete.

## Product principles

RandomChat collects minimal profile information, does not fabricate social proof, and keeps safety controls visible. The target experience is fast, calm, accessible, mobile-friendly, and reliable under duplicate clicks, refreshes, and realtime reconnects.
