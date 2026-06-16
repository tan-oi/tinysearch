import fs from "fs";
import readline from "readline";
import { TinySearch } from "./index.js";

// build + save + load demo: proves the serialize win (build once, load fast forever).
// in a real deploy this splits into two: save runs ONCE at deploy, load runs every startup.
const DIR = "freeze/bm25"; // one folder per lane; phonetic/vector get their own later
const CORPUS = "data/hn.jsonl";

async function buildAndSave() {
  const t0 = performance.now();
  const search = new TinySearch();
  const rl = readline.createInterface({ input: fs.createReadStream(CORPUS) });
  for await (const line of rl) {
    const { id, title } = JSON.parse(line);
    search.addDoc({ id, content: title });
  }
  search.finalize();
  search.freeze();
  console.log(`BUILD from scratch: ${(performance.now() - t0).toFixed(0)}ms`);

  search.save(DIR);
  const bytes = ["postingDocs.bin", "postingTfs.bin", "meta.json"].reduce(
    (s, f) => s + fs.statSync(`${DIR}/${f}`).size,
    0
  );
  console.log(
    `saved frozen index → ${DIR}/ (${(bytes / 1e6).toFixed(0)}MB on disk)`
  );
}

function loadAndQuery() {
  const t0 = performance.now();
  const search = TinySearch.load(DIR);
  console.log(`LOAD from disk:     ${(performance.now() - t0).toFixed(0)}ms`);

  for (const q of ["wireguard", "vision pro", "rust"]) {
    const top = search
      .query(q)
      .slice(0, 3)
      .map((d) => d.content);
    console.log(`  "${q}" →`, top);
  }
}

async function main() {
  await buildAndSave();
  console.log("---");
  loadAndQuery();
}

main();
