import { test, expect } from "vitest";
import { TinySearch } from "./index.js";

// build a ready-to-query engine: add docs, finalize (idf/norm), freeze (flat postings)
function build(docs: { id: number; content: string }[]) {
  const s = new TinySearch();
  docs.forEach((d) => s.addDoc(d));
  s.finalize();
  s.freeze();
  return s;
}

test("BM25 ranks the doc matching all query terms first", () => {
  const s = build([
    { id: 1, content: "machine learning is cool" },
    { id: 2, content: "machine repair manual" },
    { id: 3, content: "learning to cook" },
  ]);
  const ids = s.query("machine learning").map((d) => d.id);
  expect(ids[0]).toBe(1); // doc 1 has both terms → highest score
  expect(ids).toContain(2); // doc 2 still matches "machine"
  expect(ids).toContain(3); // doc 3 still matches "learning"
});

test("single-word query returns all docs containing that word", () => {
  const s = build([
    { id: 1, content: "machine learning" },
    { id: 2, content: "machine repair" },
  ]);
  expect(s.query("machine").map((d) => d.id).sort()).toEqual([1, 2]);
});

test("query with no matching term returns empty array", () => {
  const s = build([{ id: 1, content: "hello world" }]);
  expect(s.query("javascript")).toEqual([]);
});

test("query is case-insensitive", () => {
  const s = build([{ id: 1, content: "Hello World" }]);
  expect(s.query("HELLO").map((d) => d.id)).toEqual([1]);
});
