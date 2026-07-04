import { test, expect } from "vitest";
import { tokenize } from "./analyzer.js";

// tokenize also appends phonetic ("ph:") codes for fuzzy matching —
// these tests check the plain word output, so we drop the phonetic ones.
const words = (text: string) => tokenize(text).filter((t) => !t.startsWith("ph:"));

test("lowercases and splits on punctuation", () => {
  expect(words("Hello, world!")).toEqual(["hello", "world"]);
});

test("strips emojis and symbols", () => {
  expect(words("Hello, world! 🌍")).toEqual(["hello", "world"]);
});

test("collapses multiple spaces", () => {
  expect(words("Hello,   world!")).toEqual(["hello", "world"]);
});

test("splits contractions and drops stopwords + single chars", () => {
  // "it" is a stopword, "s" is a single char → both dropped
  expect(words("It's shoes")).toEqual(["shoes"]);
});

test("keeps numbers", () => {
  expect(words("Hello world 123")).toEqual(["hello", "world", "123"]);
});

test("strips accents", () => {
  expect(words("Hello world àèéìòù")).toEqual(["hello", "world", "aeeiou"]);
});
