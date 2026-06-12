# mission notes

## day 1 — 2026-06-10 ✅

corpus: HF `julien040/hacker-news-posts` (4M stories, parquet) → 500K newest w/ titles (`data/hn.jsonl`, 86MB) → 10K slice (`data/hn-10k.jsonl`). titles only, no body text. converted via duckdb (`scripts/convert.sql`).

### baseline numbers (10K docs, in-memory rebuild every run)
- ingest: ~27–32ms
- query: ~0.05–0.12ms
- index is rebuilt from scratch on every process start — fine at 10K, this is the thing the frozen index (d4–5) kills

### the five hand-queries
| query | result | lesson |
|---|---|---|
| javascript | 32 hits, all topical | BM25 happy place: short dense title docs |
| dropbox | 2 hits, both relevant | rare terms = precise |
| sam altman | 26 hits, top-10 perfect | OR semantics: ranking discriminates, matching doesn't. tail = single-term matches (uncle sam, bankman-fried). near-dupes everywhere (same title 4x). "segmentation using SAM" = polysemy, lexical can't tell SAM-the-model from Sam-the-person → embeddings motivation. SCREENSHOT FOR BLOG |
| javascrpt | **0 hits** | one typo = total whiff. day 6 (double metaphone) motivation |
| database internals | 40 hits, ~all just contain "database" | vocabulary match ≠ concept match. "internals" hits were golang/tcp internals (wrong subject). a doc titled "how postgres MVCC works" would score 0. day 7–12 motivation |

### parked observations (do NOT fix yet)
- query() returns all matches; "Top 5" label lies. real top-k via min-heap = d4–5
- near-duplicate stories (reposts, curly-vs-straight quotes) — dedup is a write-up footnote
- 32 js hits at 10K → ~1600 at 500K: ranking order matters way more at scale

## day 2 — 2026-06-11/12 ✅ (eval harness)

built the measuring instrument: `eval/queries.json` (18-query answer key, hand-judged) + `src/eval.ts` runner (`npm run eval`). validated: all IDs real, no dupes. committed.

### the baseline (10K docs — the "before" photo of the whole mission)
| category | queries | recall@10 | MRR | p50 | p99 |
|---|---|---|---|---|---|
| rare | 6 | 0.90 | 0.83 | 0.00ms | 0.10ms |
| common | 4 | 0.49 | 0.30 | 0.01ms | 0.03ms |
| misspelled | 5 | 0.15 | 0.10 | 0.00ms | 0.02ms |
| conceptual | 3 | 0.08 | 0.06 | 0.03ms | 0.24ms |

zero-recall: pyhton, kubernets, javascrpt, nvdia (→ day 6), image generation models, local llm (→ day 7–12)

### rater lessons (first-time evals)
- "subject, not mention" = the picking principle
- rust vetoed: query intent ambiguity (learn-the-language vs built-with-it) — ambiguous queries make mushy ground truth
- misspelled 0.15 not 0.00: "machine lerning" got partial credit — "machine" is spelled right. multi-word typos partially match
- near-dupe trap: corpus has same story under 3 IDs; picking one canonical = engine punished on a technicality for returning a twin. fixed by adding twin IDs to expected (firefox, meta). proper fix = equivalence groups — write-up footnote
- adding dupes made common stricter (0.54→0.49): bigger expected sets. yardstick consistency > generosity. baseline FROZEN
- only sin: editing a judgment to flatter a bad score

### parked (added)
- BM25F (field weighting) + chunking — TUF-time additions, not mission scope
- optional: refresh corpus via algolia time-window fetcher for demo day (day 14–15) — eval stays on frozen 2023 corpus
- stemming (database≠databases) → fold into day 6 analyzer work
- popularity/freshness blend (score+time fields unused) → day 13 buffer experiment

## references — evidence the architecture is the real-world standard (for blog citations)
- **Elasticsearch: hybrid search + RRF** — native BM25 + kNN fusion using literally RRF. docs: elastic.co → "reciprocal rank fusion" / "hybrid search". (same for OpenSearch, Weaviate, Qdrant, Vespa)
- **Anthropic — "Introducing Contextual Retrieval"** (2024): anthropic.com/news/contextual-retrieval — their best retrieval combines BM25 + embeddings; published numbers
- **Azure AI Search hybrid benchmarks** — google "azure hybrid retrieval and ranking outperforms" — MS measured: hybrid > either alone, hybrid+reranker > everything
- **BEIR benchmark** (arxiv 2104.08663) — BM25 beats many neural retrievers out-of-domain; why the lexical lane never dies
- **MS MARCO + cross-encoder reranking** (monoBERT lineage) — the retrieve-then-rerank literature
- key insight chain for the post: rerankers can't resurrect what retrieval never fetched (cascade flaw) → parallel hybrid fixes recall, rerankers fix precision → production stacks do both
- (verify exact URLs while writing the post — descriptions + search phrases above are stable)

## day 3 — 2026-06-12/13 ✅ (scale to 500K, true baseline)

answer-key top-up via **pooling** (judge the engine's own top-15, not all 555 grep candidates — the TREC method). tanay judged ~150 docs across 15 queries; 91/92 of his solo picks verified clean. learned: ADD to expected, never replace — old good answers don't expire. conceptual queries deliberately left thin until day 8 (engine can't reach their docs; pool from the vector lane once it exists).

### THE TRUE BASELINE (500K docs — the "before" photo)
| category | queries | recall@10 | MRR | p50 | p99 |
|---|---|---|---|---|---|
| rare | 6 | 0.54 | 0.85 | 0.08ms | 1.24ms |
| common | 4 | 0.47 | **1.00** | 0.28ms | 0.80ms |
| misspelled | 5 | 0.00 | 0.00 | 0.00ms | 0.94ms |
| conceptual | 3 | 0.00 | 0.00 | 1.44ms | 4.62ms |
| **overall** | 18 | **0.28** | 0.51 | 0.23ms | **4.62ms** |

**frozen-index targets (day 4–5 must beat):**
- build: **1428ms** every process start (rebuild-from-scratch)
- memory: **heap 429MB used / rss 576MB** (Maps-of-Maps tax)
- p99: **4.62ms** (full-sort of every match on common terms)
- recall/MRR: must stay FLAT — flat = proof the refactor broke nothing

### reading the numbers
- recall@10 has a **ceiling** when expected > 10: wireguard has 16 expected, max possible = 10/16 = 0.625. rare's 0.54 is near its ~0.6 ceiling — engine is actually strong here. (nDCG fixes this properly — write-up footnote)
- common MRR 1.00 = the #1 result was relevant for every common query. BM25's top hit is reliably good; depth is what's thin
- misspelled now PURE 0.00 ("machine lerning" lost its partial credit — "machine" matches thousands of docs at 500K). day 6's bar is on the floor
- conceptual p99 4.62ms = "ai" postings list is huge + full sort. min-heap motivation in one number
