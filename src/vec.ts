import fs from "fs";
import readline from "readline";
import { TinySearch } from "./index.js";
import { getEmbedder, embedBatch } from "./embed.js";

// usage: tsx src/vec.ts            (full 500K)
//        tsx src/vec.ts 5000       (subset, for a quick smoke test)
const CORPUS = "data/hn.jsonl";
const LIMIT = process.argv[2] ? parseInt(process.argv[2]) : Infinity;
const BATCH = 256;

// 1. build BM25 index + collect titles in order
const search = new TinySearch();
const ids: number[] = [];
const titles: string[] = [];
const rl = readline.createInterface({ input: fs.createReadStream(CORPUS) });
for await (const line of rl) {
  const { id, title } = JSON.parse(line);
  if (!title) continue;
  search.addDoc({ id, content: title });
  ids.push(id);
  titles.push(title);
  if (ids.length >= LIMIT) break;
}
rl.close();
search.finalize();
search.freeze();
console.log(`indexed ${ids.length} docs. embedding (gte-small)...`);

// 2. vectors: load from disk if we already embedded once, else embed + SAVE
const VDIR = "freeze/vector";
if (fs.existsSync(`${VDIR}/vectors.bin`)) {
  search.loadVectors(VDIR);
  console.log(`loaded vectors from ${VDIR}/ (no re-embed)`);
} else {
  await getEmbedder();
  const N = titles.length;
  let vectors: Float32Array | null = null;
  let dim = 0;
  const t0 = performance.now();
  for (let i = 0; i < N; i += BATCH) {
    const { data, dim: d, n } = await embedBatch(titles.slice(i, i + BATCH));
    if (!vectors) {
      dim = d;
      vectors = new Float32Array(N * dim);
    }
    vectors.set(data.subarray(0, n * dim), i * dim);
    if (i % (BATCH * 20) === 0 && i > 0) {
      const rate = i / ((performance.now() - t0) / 1000);
      console.log(`  ${((i / N) * 100).toFixed(0)}%  (${rate.toFixed(0)} docs/sec)`);
    }
  }
  console.log(`embedded ${N} docs in ${((performance.now() - t0) / 1000).toFixed(0)}s (dim ${dim})`);
  search.setVectors(vectors!, Uint32Array.from(ids), dim);
  search.saveVectors(VDIR);
  console.log(`saved vectors → ${VDIR}/ (one-time; future runs load instantly)`);
}

// 3. eval: run every query through the VECTOR lane, measure recall@10
type EQ = { query: string; category: string; expected: number[] };
const queries: EQ[] = JSON.parse(fs.readFileSync("eval/queries.json", "utf8"));
const byCat: Record<string, number[]> = {};
for (const q of queries) {
  const { data, dim: d } = await embedBatch([q.query]);
  const qv = new Float32Array(data.subarray(0, d));
  const topIds = search.vectorSearch(qv, 10).map((doc) => doc.id);
  const hits = q.expected.filter((id) => topIds.includes(id)).length;
  const recall = q.expected.length ? hits / q.expected.length : 0;
  (byCat[q.category] ??= []).push(recall);
  if (q.category === "conceptual") {
    console.log(`\n[conceptual] "${q.query}"  recall=${recall.toFixed(2)}  expected=[${q.expected.join(",")}]`);
    search.vectorSearch(qv, 10).forEach((doc) => console.log(`   ${doc.id}  ${doc.content}`));
  }
}
console.log("\nrecall@10 by category (VECTOR lane only):");
for (const [c, rs] of Object.entries(byCat)) {
  console.log(`  ${c.padEnd(12)} ${(rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(2)}`);
}
