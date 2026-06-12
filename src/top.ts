import fs from "fs";
import readline from "readline";
import { TinySearch } from "./index.js";

// usage: npm run top -- "query text"            (defaults to data/hn.jsonl)
//        npm run top -- "query text" data/hn-10k.jsonl
async function main() {
  const q = process.argv[2];
  if (!q) {
    console.log('usage: npm run top -- "query"');
    return;
  }
  const file = process.argv[3] ?? "data/hn.jsonl";

  const search = new TinySearch();
  const rl = readline.createInterface({ input: fs.createReadStream(file) });
  for await (const line of rl) {
    const { id, title } = JSON.parse(line);
    search.addDoc({ id, content: title });
  }

  search
    .query(q)
    .slice(0, 15)
    .forEach((d, i) => console.log(`${String(i + 1).padStart(2)}. ${d.id}  ${d.content.slice(0, 90)}`));
}

main();
