import { doubleMetaphone } from "double-metaphone";

// common words that carry no meaning \u2014 dropped so they don't add noise
// (fixes "a movie about time travel" matching on "about"/"time"/"movie").
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "for",
  "with", "by", "from", "as", "is", "are", "was", "were", "be", "been", "being",
  "he", "she", "it", "they", "them", "his", "her", "its", "their", "who", "whom",
  "this", "that", "these", "those", "there", "here", "about", "into", "over",
  "after", "before", "up", "down", "out", "off", "then", "than", "so", "if",
  "movie", "film", "story",
]);

export function tokenize(text: string): string[] {
  const words = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));

  const sounds = words.flatMap((w) => {
    const [primary, secondary] = doubleMetaphone(w);
    const codes = primary === secondary ? [primary] : [primary, secondary];

    return codes.map((c) => "ph:" + c);
  });
  return [...words, ...sounds];
}
