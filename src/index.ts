import { tokenize } from "./analyzer.js";

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

  query(q: string, k1 = 1.5, b = 0.75): Doc[] {
    const words = tokenize(q);
    const avgdl = this.avgDl;
    const scores = new Map<number, number>();

    words.forEach((word) => {
      const postings = this.index.get(word);
      if (!postings) return;

      const idf = this.idf.get(word)!;

      postings.forEach((tf, id) => {
        const dl = this.docLengths.get(id) ?? 0;
        const norm = tf + (this.norm.get(id) ?? 0);
        const score = idf * ((tf * (k1 + 1)) / norm);
        scores.set(id, (scores.get(id) ?? 0) + score);
      });
    });

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => this.docs.get(id)!);
  }
}
