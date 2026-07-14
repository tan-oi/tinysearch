# TinySearch

A hybrid search engine built from scratch in TypeScript — no search libraries, no vector database. BM25F keyword ranking and local semantic embeddings, fused by rank. Searches ~1,000 of the most-rated movies on IMDb.

## How it works

### Lexical lane — BM25F

Standard BM25 scoring (IDF + term frequency + document-length normalization), extended to **BM25F**: each document is indexed as weighted fields rather than one flat blob.

```
title    ×4
director ×3
cast     ×2
genre    ×2
overview ×1
```

So a real title hit outranks a stray mention of the same word in a plot summary. Two retrieval-quality details on top:

- **Minimum-should-match** — a multi-word query requires a document to match ~60% of its words (both words for a 2-word query), which kills weak single-word matches.
- **Phonetic typo-tolerance as a fallback** — phonetic codes (double-metaphone) are only used when a query word isn't in the index. Exact words match themselves. This was a deliberate fix: always-on phonetics caused look-alike collisions (`"shaw"` bleeding into `"show"`).

### Frozen index

After building, the postings lists are flattened into typed arrays — `Uint32Array` for doc IDs, `Uint16Array` for term frequencies — with a `token → { start, len }` offset map. Compact, cache-friendly, and instant to load. Query then scans contiguous slices instead of walking hash maps.

### Semantic lane

Local `gte-small` embeddings (384-dim, mean-pooled, normalized) via `@huggingface/transformers` — no API, no key. Only the title and plot are embedded (meaning, not names). Search is brute-force dot product over normalized vectors, so dot product equals cosine similarity. Vectors are precomputed and persisted to disk so startup is instant.

### Hybrid — weighted Reciprocal Rank Fusion

Each lane is pulled deep (top 100), then documents are scored by `Σ weight / (K + rank)` with `K = 60` and per-lane weights. Fusing by rank rather than by raw score sidesteps the problem that BM25 scores and cosine similarities aren't on the same scale, and the weights keep a noisy lane from dragging results toward the middle.
