import { doubleMetaphone } from "double-metaphone";

export function tokenize(text: string): string[] {
  const words = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);

  const sounds = words.flatMap((w) => {
    const [primary, secondary] = doubleMetaphone(w);
    const codes = primary === secondary ? [primary] : [primary, secondary];

    return codes.map((c) => "ph:" + c);
  });
  return [...words, ...sounds];
}
