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

## day 2 — eval harness (next)
50 fixed queries: rare / common / misspelled / conceptual. the five above are the first seeds. runs daily from then on.
