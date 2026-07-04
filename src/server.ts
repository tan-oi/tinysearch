import fs from "fs";
import http from "http";
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
const byId = new Map(movies.map((m) => [m.id, m]));

// build BM25F word index (instant) + load saved vectors (instant)
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
await embedBatch(["warmup"]); // load model once
console.log(`engine ready — ${movies.length} movies, both lanes live`);

const toResult = (docs: { id: number }[]) =>
  docs.map((d) => {
    const m = byId.get(d.id)!;
    return {
      title: m.title,
      year: m.year,
      director: m.director,
      genre: m.genre,
      rating: m.rating,
      overview: m.overview,
    };
  });

const html = fs.readFileSync("public/index.html", "utf8");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");

  if (url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(html);
  }

  if (url.pathname === "/search") {
    const q = (url.searchParams.get("q") || "").trim();
    const mode = url.searchParams.get("mode") || "hybrid"; // lexical | semantic | hybrid
    if (!q) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end("[]");
    }

    let docs;
    if (mode === "lexical") {
      docs = search.query(q, 20);
    } else {
      const { data, dim } = await embedBatch([q]);
      const qv = new Float32Array(data.subarray(0, dim));
      docs =
        mode === "semantic"
          ? search.vectorSearch(qv, 20)
          : search.hybridSearch(q, qv, 20);
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(toResult(docs)));
  }

  res.writeHead(404);
  res.end("not found");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`http://localhost:${PORT}`));
