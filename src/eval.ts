import fs from "fs";
import readline from "readline";
import { TinySearch } from "./index.js";

// usage: npm run eval              (defaults to data/hn-10k.jsonl)
//        npm run eval -- data/hn.jsonl
type EvalQuery = { query: string; category: string; expected: number[] };
type Result = EvalQuery & { recall: number; mrr: number; ms: number };

const K = 10;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, i)];
}

async function buildIndex(file: string) {
  const search = new TinySearch();
  const rl = readline.createInterface({ input: fs.createReadStream(file) });
  const t0 = performance.now();
  let count = 0;
  for await (const line of rl) {
    const { id, title } = JSON.parse(line);
    search.addDoc({ id, content: title });
    count++;
  }
  search.finalize();
  return { search, count, buildMs: performance.now() - t0 };
}

async function main() {
  const corpus = process.argv[2] ?? "data/hn-10k.jsonl";
  const queries: EvalQuery[] = JSON.parse(
    fs.readFileSync("eval/queries.json", "utf8")
  );

  const { search, count, buildMs } = await buildIndex(corpus);

  const results: Result[] = [];
  for (const q of queries) {
    const t0 = performance.now();
    const topIds = search.query(q.query).slice(0, K).map((d) => d.id);
    const ms = performance.now() - t0;

    const hits = q.expected.filter((id) => topIds.includes(id)).length;
    const recall = hits / q.expected.length;

    const firstRank = topIds.findIndex((id) => q.expected.includes(id));
    const mrr = firstRank === -1 ? 0 : 1 / (firstRank + 1);

    results.push({ ...q, recall, mrr, ms });
  }

  const pad = (s: string | number, n: number) => String(s).padEnd(n);
  const date = new Date().toISOString().slice(0, 10);

  console.log(`\neval — ${date} — ${count} docs, build ${buildMs.toFixed(0)}ms\n`);
  console.log(
    pad("category", 13) + pad("queries", 9) + pad("recall@10", 11) + pad("MRR", 7) + pad("p50", 9) + "p99"
  );

  const row = (label: string, rs: Result[]) => {
    const lat = rs.map((r) => r.ms).sort((a, b) => a - b);
    const recall = rs.reduce((s, r) => s + r.recall, 0) / rs.length;
    const mrr = rs.reduce((s, r) => s + r.mrr, 0) / rs.length;
    console.log(
      pad(label, 13) +
        pad(rs.length, 9) +
        pad(recall.toFixed(2), 11) +
        pad(mrr.toFixed(2), 7) +
        pad(percentile(lat, 50).toFixed(2) + "ms", 9) +
        percentile(lat, 99).toFixed(2) + "ms"
    );
  };

  const categories = [...new Set(results.map((r) => r.category))];
  for (const c of categories) row(c, results.filter((r) => r.category === c));
  console.log("─".repeat(60));
  row("overall", results);

  const zeros = results.filter((r) => r.recall === 0);
  if (zeros.length) {
    console.log(`\nzero-recall queries (${zeros.length}):`);
    zeros.forEach((r) => console.log(`  [${r.category}] "${r.query}"`));
  }

  fs.mkdirSync("eval/results", { recursive: true });
  const out = `eval/results/${date}-${count}docs.json`;
  fs.writeFileSync(
    out,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        corpus,
        docs: count,
        buildMs: Math.round(buildMs),
        results: results.map(({ query, category, recall, mrr, ms }) => ({ query, category, recall, mrr, ms })),
      },
      null,
      2
    )
  );
  console.log(`\nsnapshot → ${out}`);

  const mem = process.memoryUsage();
  console.log(
    `heap: ${(mem.heapUsed / 1024 / 1024).toFixed(0)}MB used / ${(mem.heapTotal / 1024 / 1024).toFixed(0)}MB total, rss: ${(mem.rss / 1024 / 1024).toFixed(0)}MB`
  );
}

main();
