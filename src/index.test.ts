import { test, expect } from "vitest";
import { TinySearch } from "./index.js";

test("AND query returns only docs containing all words", () => {
  const s = new TinySearch();
  s.addDoc({ id: 1, content: "machine learning is cool" });
  s.addDoc({ id: 2, content: "machine repair manual" });
  s.addDoc({ id: 3, content: "learning to cook" });

  const results = s.query("machine learning");
  expect(results.map((d) => d.id)).toEqual([1]);
});

test("single-word query returns all matching docs", () => {
  const s = new TinySearch();
  s.addDoc({ id: 1, content: "machine learning" });
  s.addDoc({ id: 2, content: "machine repair" });

  const results = s.query("machine");
  expect(results.map((d) => d.id).sort()).toEqual([1, 2]);
});

test("query with no matches returns empty array", () => {
  const s = new TinySearch();
  s.addDoc({ id: 1, content: "hello world" });

  expect(s.query("javascript")).toEqual([]);
});

test("query is case-insensitive", () => {
  const s = new TinySearch();
  s.addDoc({ id: 1, content: "Hello World" });

  expect(s.query("HELLO").map((d) => d.id)).toEqual([1]);
});
