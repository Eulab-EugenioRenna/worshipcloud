ALTER TABLE "Song" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'und';
ALTER TABLE "LineupItem" ADD COLUMN "contentLocale" TEXT;

CREATE TABLE "SongTranslation" (
  "id" TEXT NOT NULL,
  "songId" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "generatedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SongTranslation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SongTranslationSection" (
  "id" TEXT NOT NULL,
  "translationId" TEXT NOT NULL,
  "type" "SongSectionType" NOT NULL,
  "label" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  CONSTRAINT "SongTranslationSection_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BibleTranslation" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'und';

CREATE TABLE "BiblePassageTranslation" (
  "id" TEXT NOT NULL,
  "passageId" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "verses" JSONB NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  CONSTRAINT "BiblePassageTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SongTranslation_songId_locale_key" ON "SongTranslation"("songId", "locale");
CREATE INDEX "SongTranslation_songId_idx" ON "SongTranslation"("songId");
CREATE UNIQUE INDEX "SongTranslationSection_translationId_position_key" ON "SongTranslationSection"("translationId", "position");
CREATE UNIQUE INDEX "BiblePassageTranslation_passageId_locale_key" ON "BiblePassageTranslation"("passageId", "locale");
CREATE INDEX "BiblePassageTranslation_passageId_idx" ON "BiblePassageTranslation"("passageId");

ALTER TABLE "SongTranslation" ADD CONSTRAINT "SongTranslation_songId_fkey"
  FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SongTranslationSection" ADD CONSTRAINT "SongTranslationSection_translationId_fkey"
  FOREIGN KEY ("translationId") REFERENCES "SongTranslation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BiblePassageTranslation" ADD CONSTRAINT "BiblePassageTranslation_passageId_fkey"
  FOREIGN KEY ("passageId") REFERENCES "BiblePassage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
