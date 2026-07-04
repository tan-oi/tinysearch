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

test("minimum-should-match: a 2-word query returns only docs with both words", () => {
  const s = build([
    { id: 1, content: "machine learning is cool" }, // has both
    { id: 2, content: "machine repair manual" }, // only "machine"
    { id: 3, content: "learning to cook" }, // only "learning"
  ]);
  // need-most: a 2-word query requires both words → only doc 1 qualifies
  expect(s.query("machine learning").map((d) => d.id)).toEqual([1]);
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
