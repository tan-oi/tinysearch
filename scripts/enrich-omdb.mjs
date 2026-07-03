import fs from "fs";

// Fills IMDb top-N with plot/director/cast/genre from OMDb.
// SAFE BY DESIGN: caches every hit to disk, resumes on re-run, hard-caps calls/run.
const KEY = process.env.OMDB_KEY;
if (!KEY) { console.error("set OMDB_KEY env var"); process.exit(1); }

const N = +(process.env.N || 1000);            // how many top movies to target
const BUDGET = +(process.env.BUDGET || 950);   // max NEW api calls this run (stay under 1000/day)

const CACHE = "data/omdb-cache";
fs.mkdirSync(CACHE, { recursive: true });

const top = JSON.parse(fs.readFileSync("data/movies-imdb.json", "utf8")).slice(0, N);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fetched = 0, cached = 0, spent = 0;
for (const m of top) {
  const path = `${CACHE}/${m.imdbId}.json`;
  if (fs.existsSync(path)) { cached++; continue; }          // already have it — no call
  if (spent >= BUDGET) { console.log(`\nhit budget (${BUDGET}) — stopping. re-run tomorrow to continue.`); break; }

  try {
    const r = await fetch(`https://www.omdbapi.com/?apikey=${KEY}&i=${m.imdbId}&plot=full`).then((x) => x.json());
    spent++;
    if (r.Response === "False") { console.log(`  miss ${m.imdbId}: ${r.Error}`); continue; }
    fs.writeFileSync(path, JSON.stringify(r));
    fetched++;
  } catch (e) {
    spent++;
    console.log(`  err ${m.imdbId}: ${e.message}`);
  }
  if (spent % 50 === 0) { console.log(`  spent ${spent}/${BUDGET} calls (fetched ${fetched})`); await sleep(100); }
}
console.log(`\nrun done: ${fetched} new, ${cached} from cache, ${spent} api calls spent.`);

// assemble whatever we have cached into movies.jsonl
const out = fs.createWriteStream("data/movies.jsonl");
let written = 0;
top.forEach((m, i) => {
  const path = `${CACHE}/${m.imdbId}.json`;
  if (!fs.existsSync(path)) return;
  const o = JSON.parse(fs.readFileSync(path, "utf8"));
  out.write(JSON.stringify({
    id: i + 1,
    imdbId: m.imdbId,
    title: m.title,
    year: m.year,
    genre: (o.Genre || "").replace(/,/g, " "),
    votes: m.votes,
    rating: m.rating,
    overview: o.Plot && o.Plot !== "N/A" ? o.Plot : "",
    director: o.Director && o.Director !== "N/A" ? o.Director : "",
    cast: o.Actors && o.Actors !== "N/A" ? o.Actors.split(",").map((s) => s.trim()) : [],
  }) + "\n");
  written++;
});
out.end();
console.log(`assembled ${written} movies → data/movies.jsonl`);
