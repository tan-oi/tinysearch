import fs from "fs";
import zlib from "zlib";
import readline from "readline";

// 1) load ratings: tconst -> { rating, votes }
const ratings = new Map();
await new Promise((resolve) => {
  const rl = readline.createInterface({
    input: fs.createReadStream("data/imdb/ratings.tsv.gz").pipe(zlib.createGunzip()),
  });
  let first = true;
  rl.on("line", (line) => {
    if (first) { first = false; return; } // header
    const [tconst, avg, votes] = line.split("\t");
    ratings.set(tconst, { rating: +avg, votes: +votes });
  });
  rl.on("close", resolve);
});
console.log(`ratings loaded: ${ratings.size.toLocaleString()}`);

// 2) stream basics: keep movies, attach votes, drop the rest
const movies = [];
await new Promise((resolve) => {
  const rl = readline.createInterface({
    input: fs.createReadStream("data/imdb/basics.tsv.gz").pipe(zlib.createGunzip()),
  });
  let first = true;
  rl.on("line", (line) => {
    if (first) { first = false; return; }
    const c = line.split("\t");
    // tconst titleType primaryTitle originalTitle isAdult startYear endYear runtime genres
    const [tconst, titleType, primaryTitle, , isAdult, startYear, , , genres] = c;
    if (titleType !== "movie") return;
    if (isAdult === "1") return;
    const year = +startYear;
    if (!year || year < 1980) return; // soft floor
    const r = ratings.get(tconst);
    if (!r) return;
    movies.push({ imdbId: tconst, title: primaryTitle, year, genres, votes: r.votes, rating: r.rating });
  });
  rl.on("close", resolve);
});
console.log(`movies with ratings (>=1980): ${movies.length.toLocaleString()}`);

// 3) rank by IMDb vote count, take top 5000
movies.sort((a, b) => b.votes - a.votes);
const top = movies.slice(0, 5000);

fs.writeFileSync("data/movies-imdb.json", JSON.stringify(top));
console.log(`\nwrote top ${top.length} → data/movies-imdb.json\n`);
console.log("top 15 by IMDb votes:");
for (const m of top.slice(0, 15)) {
  console.log(`  ${m.votes.toLocaleString().padStart(10)}  ${m.rating}  ${m.title} (${m.year})`);
}
console.log(`\ncutoff (rank 5000): ${top[4999].votes.toLocaleString()} votes — "${top[4999].title}"`);
