# IP-SAKTI Sahayak

### Smart India Hackathon Submission

| | |
|---|---|
| **Problem Statement ID** | `[Fill in PS ID]` |
| **Problem Statement Title** | `[Fill in official PS title]` |
| **Theme** | `[e.g. MedTech / BioTech / HealthTech]` |
| **Team Name** | `[Fill in team name]` |
| **Team Members** | `[Name 1, Name 2, ...]` |
| **Live Demo** | `[Deployed URL]` |
| **Demo Video** | `[Link]` |

---

## Problem Statement

Ayurveda manufacturers, formulators, and startups routinely need to navigate a tangled, high-stakes web of Intellectual Property and regulatory rules before they can legally develop, license, or sell a product — spanning **AYUSH ministry classifications, CDSCO drug/cosmetic rules, IPO patent exclusions (Section 3(p)), classical vs. proprietary formulation licensing (Rule 158B), and poisonous-botanical scheduling (Schedule E(1))**, often across both Indian and international regimes simultaneously.

This knowledge is scattered across dense statutory PDFs, gazette notifications, and circulars. Getting a reliable, citable answer today typically means either an expensive attorney consultation or hours of manual cross-referencing — a barrier that disproportionately affects small formulators and early-stage founders who can least afford it.

## Our Solution

**IP-SAKTI Sahayak** ("Sahayak" = "assistant" in Hindi) is a bilingual (English/Hindi) AI assistant that answers regulatory and IP questions **grounded in and cited to actual statutory source text**, not open-ended model guesses. It:

- Retrieves the most relevant statutory passages for a query using a Retrieval-Augmented Generation (RAG) pipeline over a curated, admin-managed knowledge base
- Attaches a **confidence level** to every answer, and explicitly abstains — rather than hallucinating — when the knowledge base doesn't support a confident answer
- **Classifies a user's specific product** into the correct AYUSH regulatory category through a short guided form, so guidance is tailored rather than generic
- Lets users **inspect the exact source chunk** behind any answer, for verification
- **Escalates to a human facilitator/attorney** when a question exceeds what the AI can responsibly answer

## Key Differentiators

- **Citation-first, not chat-first** — every answer traces back to a specific, viewable statutory chunk; low-confidence answers abstain instead of guessing
- **Domain-specific classification**, not generic Q&A — the product-classification flow routes users into the actual regulatory pathway that applies to their formulation
- **Built for India's dual-jurisdiction reality** — India and international regimes are treated as distinct, switchable contexts rather than blended together
- **Human-in-the-loop by design** — low-confidence answers escalate to a real facilitator instead of leaving the user with an unreliable AI answer on a compliance-critical question

## Impact & Who It Helps

- **Ayurveda product manufacturers & formulators** navigating classical vs. proprietary licensing decisions
- **Early-stage Ayurveda/nutraceutical startups** who need directional regulatory guidance before engaging paid legal counsel
- **AYUSH facilitation desks / licensing officers** who can use the escalation queue to triage which queries actually need expert time
- **Researchers and TKDL-adjacent stakeholders** cross-referencing classical formulary status against current patent exclusions

---

## Table of Contents

- [Problem Statement](#problem-statement)
- [Our Solution](#our-solution)
- [Key Differentiators](#key-differentiators)
- [Impact & Who It Helps](#impact--who-it-helps)
- [Screenshots](#screenshots)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Running Locally](#running-locally)
- [Deploying to Render](#deploying-to-render)
- [Admin / Ingestion Portal](#admin--ingestion-portal)
- [Data Persistence](#data-persistence)
- [Security Notes](#security-notes)
- [Scripts](#scripts)

---

## Screenshots

> _Add 2-4 screenshots or a short GIF here before submission — the chat interface, the source viewer, the product-classification form, and the admin ingestion portal are the strongest ones to show._
>
> ```markdown
> ![Chat interface](./docs/screenshot-chat.png)
> ![Product classification](./docs/screenshot-classification.png)
> ```

---

## Features

- **Cited RAG chat** — every answer is grounded in retrieved statutory source chunks, with confidence scoring (high / medium / low) and an automatic abstention response when the knowledge base doesn't support a confident answer.
- **Bilingual support** — English and Hindi, including localized abstention messaging and query translation.
- **Jurisdiction switching** — India vs. International regulatory context, selectable per conversation.
- **Guided product classification** — a short structured form (formulation basis, intended use, licensing status) that routes the user's product into one of the defined AYUSH regulatory categories, with an AI-based classifier and a heuristic fallback.
- **Source viewer** — inspect the exact statutory chunk(s) a given answer was grounded in.
- **Escalation to a human facilitator** — low-confidence or complex queries can be escalated to a facilitator/attorney queue, without forcing a modal over every response.
- **Admin ingestion portal** — a protected, two-step-authenticated interface for uploading, tagging (with AI-suggested metadata), and managing the statutory document corpus, including activating/deactivating and purging documents.
- **Conversation reset** — clears chat, classification, and sources while preserving jurisdiction/language preferences.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express |
| Database | Supabase Postgres with `pgvector` (768-dim embeddings) |
| AI | Google Gemini (`@google/genai`) — embeddings, RAG answer generation, product classification |
| Build | Vite (frontend) + esbuild (server bundle) |

## Architecture

The app is a **single Node/Express process** that:

1. Serves the built React frontend (static files from `dist/`) on all non-API routes.
2. Exposes a JSON API (`/api/*`) for chat, classification, conversations, feedback, escalation, and admin/ingestion.
3. Talks to Supabase Postgres via a direct connection pool (`pg`) as the primary data path, with the Supabase REST client as a secondary fallback, and an in-memory registry as a last-resort dev-only fallback (see [Data Persistence](#data-persistence)).

There is no separate backend deployment — one Web Service running `npm run start` handles everything.

## Project Structure

```
├── server.ts                  # Express app: routes, auth, server bootstrap
├── server/
│   ├── rag.ts                 # Retrieval + grounding + confidence + answer generation
│   ├── ingestion.ts           # Chunking, embedding, document ingestion & management
│   ├── classification.ts      # AI + heuristic product classification
│   ├── conversations.ts       # Conversation/feedback/escalation persistence
│   └── supabase.ts            # Postgres pool + Supabase client + connection test
├── src/
│   ├── App.tsx                 # Top-level app state & orchestration
│   ├── components/              # Chat thread, modals, admin portal, rails, etc.
│   └── types.ts
├── supabase/
│   └── schema.sql              # Full DB schema + match_chunks RPC function
├── vite.config.ts
├── package.json
└── .env.example
```

## Environment Variables

Copy `.env.example` to `.env` for local development. On a hosting platform (e.g. Render), set these in the dashboard's Environment tab — never commit real values.

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | **Yes** | Embeddings, RAG answer generation, AI product classification, admin metadata suggestions. |
| `DATABASE_URL` | Recommended | Direct Postgres connection string to your Supabase project (primary persistence path — used for both writing and reading documents/chunks). Use the **Session pooler** URI from Supabase, with the real password filled in. |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_ANON_KEY`) | Optional | Secondary persistence path via Supabase's REST client, used only if `DATABASE_URL` isn't set or fails to connect. |
| `ADMIN_PASSCODE` | **Yes** (for admin access) | Step 1 passcode required to access the admin/ingestion portal. |
| `ADMIN_SECURITY_PINS` | **Yes** (for admin access) | Comma-separated list of valid Step 2 security PINs (e.g. `AYUSH-2026,ADMIN-2026`). |
| `PORT` | No | Set automatically by most hosting platforms (e.g. Render); the server reads it and falls back to `3000` locally. |

> **Without `DATABASE_URL`/Supabase credentials configured, ingested documents are only held in server memory and will be lost on every restart or redeploy.** See [Data Persistence](#data-persistence).

## Running Locally

**Prerequisites:** Node.js 18+

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# then fill in GEMINI_API_KEY, DATABASE_URL, ADMIN_PASSCODE, ADMIN_SECURITY_PINS

# 3. (Once) initialize the database schema
# Run the contents of supabase/schema.sql in your Supabase project's SQL editor

# 4. Run in development mode
npm run dev
```

The dev server runs the Express app directly via `tsx`, serving the API. For a full production-shaped run locally, use the build + start flow below.

## Deploying to Render

1. Push this repository to GitHub (`.env` files are already excluded via `.gitignore`).
2. On Render: **New → Web Service**, connect the repository.
3. Build command: `npm run build`
4. Start command: `npm run start`
5. Add the environment variables listed above in the service's **Environment** tab.
6. Deploy, then watch the logs for `Server running on http://0.0.0.0:<port>`.
7. Open the app, go to the admin portal, and confirm document ingestion reports persisting to Postgres/Supabase (not the in-memory fallback).

The app should work equally well on any platform that runs a persistent Node process (Railway, Fly.io, a VPS/Docker), since it reads `PORT` from the environment and has no platform-specific dependencies.

## Admin / Ingestion Portal

The admin portal is a two-step authenticated flow:

1. **Step 1** — submit `ADMIN_PASSCODE` to receive a short-lived challenge token.
2. **Step 2** — submit an authority declaration plus one of the configured `ADMIN_SECURITY_PINS` to receive a session token (valid 2 hours).

From the portal you can upload documents (`.pdf`, `.txt`, `.md`, `.json`, `.csv`, `.docx`), get AI-suggested metadata (title, jurisdiction, category, language, authority, source URL), review/edit it, and confirm ingestion — which chunks the text, computes embeddings, and writes to the configured database. You can also activate/deactivate individual documents or purge the entire corpus.

> **Text extraction:** `.pdf` uses `pdf.js` and `.docx` uses `mammoth`, both client-side, extracting only real/selectable text — scanned or image-only files with no text layer come through empty and need OCR first. **Legacy `.doc`** (pre-2007 binary Word format) isn't supported and is skipped with an on-screen message asking you to re-save it as `.docx` or `.pdf` first. These libraries are lazy-loaded only when the admin portal is opened, so they don't add to the regular chat bundle size.

## Data Persistence

Ingestion is attempted in this order, and the first one that succeeds is used:

1. **Direct Postgres** (`DATABASE_URL`) — real, durable persistence in your Supabase database.
2. **Supabase REST client** (`SUPABASE_URL` + key) — real, durable persistence via Supabase's API.
3. **In-memory registry** — a dev-only fallback held in the Node process's RAM. This is **not persistent**: it is wiped on every server restart, redeploy, or scale event.

To guarantee documents survive restarts and redeploys, make sure `DATABASE_URL` (or the Supabase URL/key pair) is set correctly before ingesting — see [Environment Variables](#environment-variables).

## Security Notes

- Admin authentication requires both `ADMIN_PASSCODE` and `ADMIN_SECURITY_PINS` to be explicitly configured — there are no hardcoded fallback credentials. If these are unset, admin access is denied by default rather than falling back to a default value.
- The admin security PIN field is a masked (`type="password"`) input and is never pre-filled with a real value.
- `match_chunks` (the Supabase RPC search path) only returns chunks belonging to documents with `status = 'active'`, matching the direct-Postgres search path.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Run the server directly with `tsx` (development). |
| `npm run build` | Build the frontend with Vite and bundle the server with esbuild into `dist/`. |
| `npm run start` | Run the production build (`node dist/server.cjs`). |
| `npm run preview` | Preview the built frontend via Vite. |
| `npm run lint` | Type-check the whole project with `tsc --noEmit`. |
| `npm run clean` | Remove build output. |
