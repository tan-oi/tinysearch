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

  constructor() {
    this.index = new Map();
    this.docs = new Map();
    this.docLengths = new Map();
    this.totalTokens = 0;
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

  query(q: string, k1 = 1.5, b = 0.75): Doc[] {
    const words = tokenize(q);
    const N = this.docs.size;
    const avgdl = N === 0 ? 0 : this.totalTokens / N;
    const scores = new Map<number, number>();

    words.forEach((word) => {
      const postings = this.index.get(word);
      if (!postings) return;

      const df = postings.size;
      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

      postings.forEach((tf, id) => {
        const dl = this.docLengths.get(id) ?? 0;
        const norm = tf + k1 * (1 - b + (b * dl) / avgdl);
        const score = idf * ((tf * (k1 + 1)) / norm);
        scores.set(id, (scores.get(id) ?? 0) + score);
      });
    });

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => this.docs.get(id)!);
  }
}
