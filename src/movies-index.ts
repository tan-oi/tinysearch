import fs from "fs";
import { TinySearch } from "./index.js";
import { embedBatch } from "./embed.js";

type Movie = {
  id: number;
  title: string;
  year: number;
  genre: string;
  votes: number;
  rating: number;
  overview: string;
  director: string;
  cast: string[];
};

const movies: Movie[] = fs
  .readFileSync("data/movies.jsonl", "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l));
console.log(`loaded ${movies.length} movies`);

// word-search lane (BM25F): weighted fields, not a flat blob.
// title hit > director/cast hit > plot/genre hit — so stray plot mentions can't
// outrank a real title match (the Battleship-beats-Alien³ problem).
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
console.log("word-search index built");

// semantic lane: embed title + plot only (meaning, not names)
// batched (64 at a time) so RAM stays flat and we get progress — not one 999-row monster tensor
const t0 = Date.now();
const texts = movies.map((m) => `${m.title}. ${m.overview}`);
const BATCH = 64;
let dim = 0;
const chunks: Float32Array[] = [];
for (let i = 0; i < texts.length; i += BATCH) {
  const slice = texts.slice(i, i + BATCH);
  const { data, dim: d, n } = await embedBatch(slice);
  dim = d;
  chunks.push(new Float32Array(data.subarray(0, n * d)));
  console.log(`  embedded ${Math.min(i + BATCH, texts.length)}/${texts.length}`);
}
const flat = new Float32Array(movies.length * dim);
let off = 0;
for (const c of chunks) { flat.set(c, off); off += c.length; }
search.setVectors(flat, Uint32Array.from(movies.map((m) => m.id)), dim);
search.saveVectors("freeze/movies-vector");
console.log(`embedded ${movies.length} movies in ${((Date.now() - t0) / 1000).toFixed(1)}s, saved vectors`);

// eyeball check
const byId = new Map(movies.map((m) => [m.id, m]));
const show = (docs: { id: number }[]) =>
  docs.map((d) => byId.get(d.id)!).map((m) => `${m.title} (${m.year})`).join(" · ") || "(nothing)";

const queries = [
  "a heist inside someone's dreams",
  "sad breakup drama",
  "Nolan",
  "DiCaprio",
  "scary movie in a haunted house",
];
for (const q of queries) {
  const { data: qd, dim: qdim } = await embedBatch([q]);
  const qv = new Float32Array(qd.subarray(0, qdim));
  console.log(`\nQUERY: "${q}"`);
  console.log(`  word    : ${show(search.query(q, 3))}`);
  console.log(`  semantic: ${show(search.vectorSearch(qv, 3))}`);
  console.log(`  hybrid  : ${show(search.hybridSearch(q, qv, 3))}`);
}
