import fs from "fs";
import readline from "readline";
import { TinySearch } from "./index.js";

async function main() {
  const search = new TinySearch();

  const file = process.argv[2] ?? "data/hn-10k.jsonl";
  const rl = readline.createInterface({
    input: fs.createReadStream(file),
  });

  console.time("ingest");
  let count = 0;
  for await (const line of rl) {
    const { id, title } = JSON.parse(line);
    search.addDoc({ id, content: title });
    count++;
  }
  console.timeEnd("ingest");
  console.log(`Indexed ${count} docs`);

  console.time("query");
  const results = search.query("database internals");
  console.timeEnd("query");
  console.log(`Found ${results.length} results`);
  console.log("Top 5:");
  results.forEach((d) =>
    console.log(`  ${d.id}: ${d.content.slice(0, 80)}...`)
  );
}

main();
