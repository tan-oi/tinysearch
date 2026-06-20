import fs from "fs";
import { tokenize } from "./analyzer.js";
import { getTopK } from "./helper.js";

type Doc = {
  id: number;
  content: string;
};
export class TinySearch {
  private index: Map<string, Map<number, number>>;
  private docs: Map<number, Doc>;
  private docLengths: Map<number, number>;
  private totalTokens: number;
  private idf: Map<string, number>;
  private norm: Map<number, number>;
  private avgDl: number;
  private postingDocs: Uint32Array = new Uint32Array(0);
  private postingTfs: Uint16Array = new Uint16Array(0);
  private offsets: Map<string, { start: number; len: number }> = new Map();

  // vector lane: every doc vector laid flat (row i ↔ vectorIds[i]), normalized so dot == cosine
  private vectors: Float32Array = new Float32Array(0);
  private vectorIds: Uint32Array = new Uint32Array(0);
  private dim = 0;

  k1: number;
  b: number;
  constructor() {
    this.index = new Map();
    this.docs = new Map();
    this.docLengths = new Map();
    this.totalTokens = 0;
    this.idf = new Map();
    this.norm = new Map();
    this.avgDl = 0;
    this.k1 = 1.5;
    this.b = 0.75;
  }

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

  query(q: string): Doc[] {
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

    return getTopK(scores, 10).map(([, id]) => this.docs.get(id)!);
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

  hasVectors() {
    return this.vectorIds.length > 0;
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

  save(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      `${dir}/postingDocs.bin`,
      Buffer.from(this.postingDocs.buffer)
    );
    fs.writeFileSync(
      `${dir}/postingTfs.bin`,
      Buffer.from(this.postingTfs.buffer)
    );
    const meta = {
      avgDl: this.avgDl,
      offsets: [...this.offsets],
      idf: [...this.idf],
      norm: [...this.norm],
      docs: [...this.docs].map(([id, d]) => [id, d.content]),
    };
    fs.writeFileSync(`${dir}/meta.json`, JSON.stringify(meta));
  }

  // load a frozen index from disk — no ingest, no Map-of-Maps ever built
  static load(dir: string): TinySearch {
    const s = new TinySearch();

    const pd = fs.readFileSync(`${dir}/postingDocs.bin`);
    s.postingDocs = new Uint32Array(
      pd.buffer.slice(pd.byteOffset, pd.byteOffset + pd.byteLength)
    );
    const pt = fs.readFileSync(`${dir}/postingTfs.bin`);
    s.postingTfs = new Uint16Array(
      pt.buffer.slice(pt.byteOffset, pt.byteOffset + pt.byteLength)
    );

    const meta = JSON.parse(fs.readFileSync(`${dir}/meta.json`, "utf8"));
    s.avgDl = meta.avgDl;
    s.offsets = new Map(meta.offsets);
    s.idf = new Map(meta.idf);
    s.norm = new Map(meta.norm);
    s.docs = new Map(
      meta.docs.map(([id, content]: [number, string]) => [id, { id, content }])
    );
    return s;
  }
}
