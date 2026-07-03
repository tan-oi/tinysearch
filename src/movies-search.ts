import fs from "fs";
import readline from "readline";
import { TinySearch } from "./index.js";
import { embedBatch } from "./embed.js";

type Movie = {
  id: number; title: string; year: number; genre: string;
  votes: number; rating: number; overview: string; director: string; cast: string[];
};

const movies: Movie[] = fs
  .readFileSync("data/movies.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));

// rebuild word-search index (instant for 999) + load saved vectors (instant)
const search = new TinySearch();
for (const m of movies) {
  search.addFieldedDoc(m.id, [
    { text: m.title, weight: 4 },
    { text: m.director, weight: 3 },
    { text: m.cast.join(" "), weight: 2 },
    { text: m.genre, weight: 2 },
    { text: m.overview, weight: 1 },
  ]);
}
search.finalize();
search.freeze();
search.loadVectors("freeze/movies-vector");

const byId = new Map(movies.map((m) => [m.id, m]));
const line = (docs: { id: number }[]) =>
  docs.map((d) => byId.get(d.id)!).map((m) => `${m.title} (${m.year})`).join("  ·  ") || "(nothing)";

const runQuery = async (q: string) => {
  const { data, dim } = await embedBatch([q]);
  const qv = new Float32Array(data.subarray(0, dim));
  console.log(`\nQUERY: "${q}"`);
  console.log(`  word    : ${line(search.query(q, 5))}`);
  console.log(`  semantic: ${line(search.vectorSearch(qv, 5))}`);
  console.log(`  hybrid  : ${line(search.hybridSearch(q, qv, 5))}\n`);
};

// one-shot mode: `tsx src/movies-search.ts "your query"` → run once and exit
const argQuery = process.argv.slice(2).join(" ").trim();
if (argQuery) {
  await runQuery(argQuery);
  process.exit(0);
}

console.log(`\nloaded ${movies.length} movies. warming up model...`);
await embedBatch(["warmup"]); // load model once so first real query is fast
console.log(`ready. type a query (or "quit").\n`);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "search> " });
rl.prompt();
rl.on("line", async (input) => {
  const q = input.trim();
  if (!q) return rl.prompt();
  if (q === "quit" || q === "exit") return rl.close();

  const { data, dim } = await embedBatch([q]);
  const qv = new Float32Array(data.subarray(0, dim));
  console.log(`\n  word    : ${line(search.query(q, 5))}`);
  console.log(`  semantic: ${line(search.vectorSearch(qv, 5))}`);
  console.log(`  hybrid  : ${line(search.hybridSearch(q, qv, 5))}\n`);
  rl.prompt();
});
rl.on("close", () => { console.log("bye."); process.exit(0); });
