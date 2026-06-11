-- story.parquet (~4M HN stories) -> data/hn.jsonl (best 500K, newest first)
-- run: duckdb -c ".read scripts/convert.sql" from the tinysearch root
COPY (
  SELECT
    id,
    title,
    coalesce(url, '')   AS url,
    coalesce(score, 0)  AS score,
    "time"              AS time
  FROM 'data/story.parquet'
  WHERE title IS NOT NULL
    AND length(title) >= 3
  ORDER BY "time" DESC
  LIMIT 500000
) TO 'data/hn.jsonl' (FORMAT JSON);
