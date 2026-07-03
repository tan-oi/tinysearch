import fs from "fs";
import readline from "readline";
import { TinySearch } from "./index.js";
import { embedBatch } from "./embed.js";

// build BM25 from corpus + load saved vectors → compare lanes + weighted hybrid
const search = new TinySearch();
const rl = readline.createInterface({ input: fs.createReadStream("data/hn.jsonl") });
for await (const line of rl) {
  const { id, title } = JSON.parse(line);
  if (!title) continue;
  search.addDoc({ id, content: title });
}
rl.close();
search.finalize();
search.freeze();
search.loadVectors("freeze/vector");
console.log("index + vectors loaded\n");

type EQ = { query: string; category: string; expected: number[] };
const queries: EQ[] = JSON.parse(fs.readFileSync("eval/queries.json", "utf8"));

const recall = (ids: number[], expected: number[]) =>
  expected.length ? expected.filter((id) => ids.includes(id)).length / expected.length : 0;

// pre-embed every query once
const qv: Float32Array[] = [];
for (const q of queries) {
  const { data, dim } = await embedBatch([q.query]);
  qv.push(new Float32Array(data.subarray(0, dim)));
}

const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const cats = [...new Set(queries.map((q) => q.category))];

// evaluate a scorer fn (query index → ranked ids) across categories + overall
function evalLane(name: string, getIds: (i: number) => number[]) {
  const perCat: Record<string, number[]> = {};
  const all: number[] = [];
  queries.forEach((q, i) => {
    const r = recall(getIds(i).slice(0, 10), q.expected);
    (perCat[q.category] ??= []).push(r);
    all.push(r);
  });
  return { name, perCat, overall: avg(all) };
}

const lanes = [
  evalLane("lexical", (i) => search.query(queries[i]!.query, 10).map((d) => d.id)),
  evalLane("vector", (i) => search.vectorSearch(qv[i]!, 10).map((d) => d.id)),
  evalLane("hybrid 1:1", (i) => search.hybridSearch(queries[i]!.query, qv[i]!, 10, 1, 1).map((d) => d.id)),
  evalLane("hybrid 1:.5", (i) => search.hybridSearch(queries[i]!.query, qv[i]!, 10, 1, 0.5).map((d) => d.id)),
  evalLane("hybrid 1:.3", (i) => search.hybridSearch(queries[i]!.query, qv[i]!, 10, 1, 0.3).map((d) => d.id)),
];

const pad = (s: string, n: number) => s.padEnd(n);
console.log(pad("recall@10", 13) + lanes.map((l) => pad(l.name, 13)).join(""));
for (const c of cats) {
  console.log(pad(c, 13) + lanes.map((l) => pad(avg(l.perCat[c]!).toFixed(2), 13)).join(""));
}
console.log("─".repeat(13 * (lanes.length + 1)));
console.log(pad("overall", 13) + lanes.map((l) => pad(l.overall.toFixed(2), 13)).join(""));
