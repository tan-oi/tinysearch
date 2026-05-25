import { tokenize } from "./analyzer.js";

type Doc = {
  id: number;
  content: string;
};
export class TinySearch {
  private index: Map<string, Set<number>>;
  private docs: Map<number, Doc>;

  constructor() {
    this.index = new Map();
    this.docs = new Map();
  }

  addDoc(doc: Doc) {
    const { id } = doc;
    this.docs.set(id, doc);

    const words = tokenize(doc.content);
    words.forEach((word) => {
      if (!this.index.has(word)) {
        this.index.set(word, new Set([id]));
      } else {
        this.index.get(word)?.add(id);
      }
    });
  }

  query(q: string): Doc[] {
    const words = tokenize(q);
    let candidates: Set<number> | null = null;

    words.forEach((word) => {
      const postings = this.index.get(word) ?? new Set<number>();
      if (candidates === null) {
        candidates = new Set(postings);
      } else {
        candidates = new Set([...candidates].filter((id) => postings.has(id)));
      }
    });

    return Array.from(candidates ?? []).map((id) => this.docs.get(id)!);
  }
}
