import fs from "fs";
import { tokenize } from "./analyzer.js";
import { getTopK } from "./helper.js";

type Doc = {
  id: number;
  content: string;
};
export class TinySearch {
  // lexical (BM25) state
  private index = new Map<string, Map<number, number>>();
  private docs = new Map<number, Doc>();
  private docLengths = new Map<number, number>();
  private totalTokens = 0;
  private idf = new Map<string, number>();
  private norm = new Map<number, number>();
  private avgDl = 0;

  // frozen index: flat postings + token → slice offsets
  private postingDocs = new Uint32Array(0);
  private postingTfs = new Uint16Array(0);
  private offsets = new Map<string, { start: number; len: number }>();

  // vector lane: every doc vector laid flat (row i ↔ vectorIds[i]), normalized so dot == cosine
  private vectors = new Float32Array(0);
  private vectorIds = new Uint32Array(0);
  private dim = 0;

  // BM25 tuning knobs
  k1 = 1.5;
  b = 0.75;

  addDoc(doc: Doc) {
    const { id } = doc;
    this.docs.set(id, doc);

    const tokens = tokenize(doc.content);
    this.docLengths.set(id, tokens.length);
    this.totalTokens += tokens.length;

    tokens.forEach((word) => {
      if (!this.index.has(word)) {
        this.index.set(word, new Map([[id, 1]]));
      } else {
        const inner = this.index.get(word);
        inner?.set(id, (inner.get(id) ?? 0) + 1);
      }
    });
  }

  // BM25F: index several fields with per-field weights instead of one flat blob.
  // each field's words are counted `weight` times → weighted tf → a title hit
  // outweighs a plot hit. weighted length feeds avgDl consistently.
  // finalize/freeze/query are untouched — they just read the (now weighted) tf.
  addFieldedDoc(id: number, fields: { text: string; weight: number }[]) {
    this.docs.set(id, { id, content: fields.map((f) => f.text).join(" ") });

    const counts = new Map<string, number>();
    let weightedLen = 0;
    for (const { text, weight } of fields) {
      const tokens = tokenize(text);
      weightedLen += weight * tokens.length;
      tokens.forEach((word) => counts.set(word, (counts.get(word) ?? 0) + weight));
    }

    this.docLengths.set(id, weightedLen);
    this.totalTokens += weightedLen;
    counts.forEach((tf, word) => {
      if (!this.index.has(word)) this.index.set(word, new Map([[id, tf]]));
      else this.index.get(word)!.set(id, tf);
    });
  }

  finalize() {
    const size = this.docs.size;
    this.avgDl = size === 0 ? 0 : this.totalTokens / size;

    this.index.forEach((val, token) => {
      const df = val.size;
      const idf = Math.log((size - df + 0.5) / (df + 0.5) + 1);
      this.idf.set(token, idf);
    });

    this.docs.forEach((doc, id) => {
      const dl = this.docLengths.get(id) ?? 0;
      const norm = this.k1 * (1 - this.b + (this.b * dl) / this.avgDl);
      this.norm.set(id, norm);
    });
  }

  query(q: string, k = 10): Doc[] {
    const words = tokenize(q);
    const scores = new Map<number, number>();

    words.forEach((word) => {
      const pos = this.offsets.get(word);
      if (!pos) return;

      const idf = this.idf.get(word)!;

      for (let i = pos.start; i < pos.start + pos.len; i++) {
        const id = this.postingDocs[i]!;
        const tf = this.postingTfs[i]!;
        const norm = tf + (this.norm.get(id) ?? 0); // norm already baked k1/b in finalize()
        const score = idf * ((tf * (this.k1 + 1)) / norm);
        scores.set(id, (scores.get(id) ?? 0) + score);
      }
    });

    return getTopK(scores, k).map(([, id]) => this.docs.get(id)!);
  }

  freeze() {
    let total = 0;
    this.index.forEach((posting) => (total += posting.size));

    this.postingDocs = new Uint32Array(total);
    this.postingTfs = new Uint16Array(total);

    let cursor = 0;
    this.index.forEach((posting, token) => {
      let start = cursor;
      posting.forEach((tf, docId) => {
        this.postingDocs[cursor] = docId;
        this.postingTfs[cursor] = tf;

        cursor++;
      });

      this.offsets.set(token, { start, len: posting.size });
    });

    this.index = new Map();
    this.docLengths = new Map();
  }

  // hand the engine its embeddings: one flat Float32Array + the docId for each row
  setVectors(vectors: Float32Array, ids: Uint32Array, dim: number) {
    this.vectors = vectors;
    this.vectorIds = ids;
    this.dim = dim;
  }

  // persist the vector lane to disk (same idea as save(), for embeddings)
  saveVectors(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${dir}/vectors.bin`, Buffer.from(this.vectors.buffer));
    fs.writeFileSync(
      `${dir}/vectorIds.bin`,
      Buffer.from(this.vectorIds.buffer)
    );
    fs.writeFileSync(`${dir}/vmeta.json`, JSON.stringify({ dim: this.dim }));
  }

  loadVectors(dir: string) {
    const v = fs.readFileSync(`${dir}/vectors.bin`);
    this.vectors = new Float32Array(
      v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength)
    );
    const ids = fs.readFileSync(`${dir}/vectorIds.bin`);
    this.vectorIds = new Uint32Array(
      ids.buffer.slice(ids.byteOffset, ids.byteOffset + ids.byteLength)
    );
    this.dim = JSON.parse(fs.readFileSync(`${dir}/vmeta.json`, "utf8")).dim;
  }

  // brute-force semantic search: dot-product the query against every doc vector, heap the top-k.
  vectorSearch(queryVec: Float32Array, k = 10): Doc[] {
    const scores = new Map<number, number>();
    const dim = this.dim;

    for (let i = 0; i < this.vectorIds.length; i++) {
      const offset = i * dim;
      let dot = 0;
      for (let d = 0; d < dim; d++) {
        dot += this.vectors[offset + d]! * queryVec[d]!;
      }
      scores.set(this.vectorIds[i]!, dot);
    }

    return getTopK(scores, k).map(([, id]) => this.docs.get(id)!);
  }

  // hybrid search via WEIGHTED RRF: fuse lexical + semantic lanes by rank, weighted per lane.
  // pull each lane deep (100), score doc by Σ weight/(K+rank), cut to k.
  // weights let you lean on the stronger lane so a noisy lane can't drag results to the middle.
  hybridSearch(
    q: string,
    queryVec: Float32Array,
    k = 10,
    wLex = 1,
    wVec = 1
  ): Doc[] {
    const K = 60;
    const lexical = this.query(q, 100); // Doc[] ranked: index 0 = rank 1
    const semantic = this.vectorSearch(queryVec, 100);

    const fused = new Map<number, number>(); // docId → fused RRF score
    const add = (list: Doc[], w: number) =>
      list.forEach((doc, i) =>
        fused.set(doc.id, (fused.get(doc.id) ?? 0) + w / (K + i + 1))
      );
    add(lexical, wLex);
    add(semantic, wVec);

    return [...fused.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([id]) => this.docs.get(id)!);
  }

}
