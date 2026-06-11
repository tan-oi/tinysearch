import fs from "fs";

async function fetchHN(count: number) {
  const out = fs.createWriteStream("data/wikipedia.jsonl");
  let saved = 0;
  let page = 0;
  const startTime = Date.now();

  while (saved < count) {
    const url = `https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=1000&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.log(`HTTP ${res.status} on page ${page}`);
      break;
    }

    const data = (await res.json()) as any;
    const hits = data.hits as any[];
    if (!hits || hits.length === 0) break;

    for (const hit of hits) {
      const title = hit.title ?? "";
      const body = hit.story_text ?? "";
      const text = body.length > 0 ? body : title;
      if (text.length < 20) continue;

      out.write(
        JSON.stringify({
          id: saved + 1,
          title,
          text,
        }) + "\n"
      );

      saved++;
      if (saved >= count) break;
    }

    console.log(`Page ${page}: ${saved}/${count} saved`);
    page++;
  }

  out.end();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Done in ${elapsed}s. Saved ${saved} docs.`);
}

fetchHN(10000);
