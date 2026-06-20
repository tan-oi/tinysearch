import { pipeline } from "@huggingface/transformers";

// local embedder — gte-small, 384-dim, normalized. no API, no key.
let extractor: any = null;

export async function getEmbedder() {
  if (!extractor) {
    extractor = await pipeline("feature-extraction", "Xenova/gte-small");
  }
  return extractor;
}

// embed a batch of texts → { data: flat Float32Array (n*dim), dim, n }
export async function embedBatch(texts: string[]) {
  const ex = await getEmbedder();
  const out = await ex(texts, { pooling: "mean", normalize: true });
  return { data: out.data as Float32Array, dim: out.dims[1] as number, n: out.dims[0] as number };
}
