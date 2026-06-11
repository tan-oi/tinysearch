import fs from "fs";
import readline from "readline";

// usage: npm run find -- "wireguard"  (case-insensitive title search, prints id + title)
async function main() {
  const needle = (process.argv[2] ?? "").toLowerCase();
  if (!needle) {
    console.log('usage: npm run find -- "search text"');
    return;
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(process.argv[3] ?? "data/hn-10k.jsonl"),
  });

  let hits = 0;
  for await (const line of rl) {
    const { id, title } = JSON.parse(line);
    if (title.toLowerCase().includes(needle)) {
      console.log(`${id}  ${title}`);
      hits++;
    }
  }
  console.log(`\n${hits} matches for "${needle}"`);
}

main();
