import { test, expect } from "vitest";
import { tokenize } from "./analyzer.js";

test("tokenize returns an array of words", () => {
  const text = "Hello, world!";
  const words = tokenize(text);
  console.log(words);
  expect(words).toEqual(["hello", "world"]);
});

test("tokenize handles special characters", () => {
  const text = "Hello, world! 🌍";
  const words = tokenize(text);
  console.log(words);
  expect(words).toEqual(["hello", "world"]);
});

test("tokenize handles multiple spaces", () => {
  const text = "Hello,   world!";
  const words = tokenize(text);
  console.log(words);
  expect(words).toEqual(["hello", "world"]);
});

test("tokenize handles punctuation", () => {
  const text = "It's shoes";
  const words = tokenize(text);
  console.log(words);
  expect(words).toEqual(["it", "shoes"]);
});

test("tokenize handles numbers", () => {
  const text = "Hello, world! 123";
  const words = tokenize(text);
  console.log(words);
});

test("tokensize handldes accents", () => {
  const text = "Hello, world! àèéìòù";
  const words = tokenize(text);
  console.log(words);
  expect(words).toEqual(["hello", "world", "aeeiou"]);
});

test("tokensize handldes emojis", () => {
  const text = "Hello, world! 🌍";
  const words = tokenize(text);
  console.log(words);
  expect(words).toEqual(["hello", "world"]);
});
