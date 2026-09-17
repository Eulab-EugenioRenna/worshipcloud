CREATE TABLE "SongStep" (
  "id" TEXT NOT NULL,
  "sectionId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "lines" TEXT[] NOT NULL,
  "lineStart" INTEGER NOT NULL,
  "lineEnd" INTEGER NOT NULL,
  CONSTRAINT "SongStep_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SongStep_sectionId_position_key"
  ON "SongStep"("sectionId", "position");
CREATE INDEX "SongStep_sectionId_idx" ON "SongStep"("sectionId");

ALTER TABLE "SongStep"
  ADD CONSTRAINT "SongStep_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "SongSection"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

WITH raw_lines AS (
  SELECT
    section.id AS "sectionId",
    line.value,
    line.ordinality
  FROM "SongSection" section
  CROSS JOIN LATERAL regexp_split_to_table(section.content, E'\\r?\\n')
    WITH ORDINALITY AS line(value, ordinality)
  WHERE btrim(line.value) <> ''
), source_lines AS (
  SELECT
    "sectionId",
    value,
    row_number() OVER (
      PARTITION BY "sectionId" ORDER BY ordinality
    )::INTEGER AS line_number
  FROM raw_lines
), grouped_steps AS (
  SELECT
    "sectionId",
    ((line_number - 1) / 2)::INTEGER AS position,
    string_agg(btrim(value), E'\n' ORDER BY line_number) AS content,
    min(line_number)::INTEGER AS "lineStart",
    max(line_number)::INTEGER AS "lineEnd"
  FROM source_lines
  GROUP BY "sectionId", ((line_number - 1) / 2)
)
INSERT INTO "SongStep" (
  "id", "sectionId", "position", "content", "lines", "lineStart", "lineEnd"
)
SELECT
  gen_random_uuid()::TEXT,
  "sectionId",
  position,
  content,
  string_to_array(content, E'\n'),
  "lineStart",
  "lineEnd"
FROM grouped_steps;
