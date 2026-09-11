# IP-SAKTI Sahayak — Code Review & Fix Report

**Date:** September 11, 2026
**Scope of this pass:** Static code review and targeted source edits only.
**Not performed:** The application was not installed, built, started, or exercised at runtime in this
environment (no network access to `npm install` dependencies, no live Gemini/Supabase credentials
available). Nothing below should be read as a live/runtime test result — it is a description of what
was inspected in the source and what was changed, verified by reading the code and by static checks
(grep, brace-balance count) only.

---

## 1. What was found and fixed

### 1.1 Demo-data injector in the Admin Portal
**Found:** `src/components/AdminPortal.tsx` still defined a `SAMPLE_DOCS` array (three fabricated Acts/
case summaries), a `handleLoadSamples` handler, and a "Load Sample Acts" button that pushed those
fabricated documents into the same upload queue used for real ingestion. The empty-state copy also
referenced this button ("Or click 'Load Sample Acts' above...") and a nearby "Knowledge Base is Empty"
message claimed "All demo data has been cleared" while the injector itself still shipped in the bundle.

**Fixed:**
- Removed the `SAMPLE_DOCS` array in its entirety (the three hardcoded document objects).
- Removed the `handleLoadSamples` handler and the "Load Sample Acts" button.
- Removed the now-unused `Sparkles` icon import (it was only used by that button).
- Reworded the empty-queue helper text to point at "Select Files" / "Upload Folder" instead of the
  removed button.
- Reworded the "Knowledge Base is Empty & Ready" message to drop the "demo data has been cleared"
  claim, since there is no longer a demo-data path to clear.
- Verified with `grep -rn "SAMPLE_DOCS\|handleLoadSamples\|Load Sample"` across the repo that no other
  file referenced the removed code.
- Confirmed brace count in the edited file is balanced (385 `{` / 385 `}`) as a basic sanity check,
  since a full `tsc`/build was not runnable here.

No other seeding path was found — `seedKnowledgeBaseIfEmpty()` in `server/ingestion.ts` is a genuine
zero-seed no-op initializer and was not touched.

### 1.2 Embedding model pinned to an unfallbacked `-preview` alias
**Found:** `server/ingestion.ts` hardcoded `EMBEDDING_MODEL = 'gemini-embedding-2-preview'` with a
single `embedContent` call. If that preview alias were retired or rate-limited, the code would fall
straight through to the deterministic offline vector generator, silently degrading retrieval quality
in production.

**Fixed:**
- Replaced the single model constant with an ordered chain:
  `EMBEDDING_MODEL = 'gemini-embedding-2'` (current GA name) followed by
  `EMBEDDING_MODEL_FALLBACKS = ['gemini-embedding-001']` (long-lived stable model), combined into
  `EMBEDDING_MODEL_CHAIN`.
- Rewrote `getChunkEmbedding()` to loop over `EMBEDDING_MODEL_CHAIN`, trying each model in order and
  only falling back to `generateDeterministicVector768()` once every model in the chain has failed or
  returned no values. Each failed attempt is logged with the model name that failed.
- Updated the two other places that hardcoded the old model string so they stay consistent with the
  new chain instead of silently going stale:
  - `server.ts`'s `/api/db/schema` endpoint now imports `EMBEDDING_MODEL` / `EMBEDDING_MODEL_FALLBACKS`
    from `server/ingestion.ts` and reports them dynamically instead of a hardcoded string.
  - The "Chunking Rule" helper text in `AdminPortal.tsx` now names both the primary and fallback model.
- Verified with `grep -rn "gemini-embedding"` that no remaining reference to the old
  `gemini-embedding-2-preview` string exists in `.ts`/`.tsx` files.

**Caveat:** I have not called the live Gemini API to confirm `gemini-embedding-2` and
`gemini-embedding-001` are in fact currently-serving model names — I don't have network/API access in
this environment. Please verify against Google's current embedding model listing before deploying, and
adjust `EMBEDDING_MODEL` / `EMBEDDING_MODEL_FALLBACKS` in `server/ingestion.ts` if either name has
changed.

### 1.3 This file
**Found:** The previous version of this file (`TEST_RESULTS.md`) presented a 12-row pass/fail matrix
and detailed request/response examples (HTTP calls, JSON payloads, Hindi abstention text, cache
behavior, rate-limit retries) as if they had been executed against a running instance. No such instance
was run to produce that content.

**Fixed:** Replaced it with this document, which only describes source-level review and edits actually
performed, plus the static checks used to sanity-check them (grep for leftover references, brace
balance). Claims that require a running server, a live database, or a live Gemini API key — such as
"empty knowledge base returns a graceful abstention," "429 retries succeed," or "ingested documents are
retrievable" — are not verified here and are not restated as passing.

---

## 2. What still needs a real runtime test pass

None of the following were exercised in this environment. Before treating the app as production-ready,
someone with `npm install` + a running Postgres/Supabase instance + a valid Gemini API key should
verify:

- Server boots with an empty knowledge base and `seedKnowledgeBaseIfEmpty()` does not create any
  documents.
- `/api/admin/stats` and `/api/admin/documents` return zero/empty on a fresh database.
- A question asked against an empty knowledge base returns the abstention path (no citations, no
  fabricated answer) in both English and Hindi.
- Uploading a real document through the Admin Portal (now without the sample-loader) ingests correctly,
  computes 768-dim embeddings via `gemini-embedding-2` (confirm the fallback to `gemini-embedding-001`
  actually triggers and works if the primary model call is forced to fail), and is retrievable via RAG.
- Deactivating and hard-purging documents behaves as the code implies.
- `npm run lint` (`tsc --noEmit`) and `npm run build` complete without errors — this was not run here
  since dependencies are not installed in this environment.
