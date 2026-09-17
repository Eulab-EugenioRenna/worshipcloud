CREATE TABLE "BibleTranslation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "abbreviation" TEXT NOT NULL,
  "copyright" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BibleTranslation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BibleVerse" (
  "id" TEXT NOT NULL,
  "translationId" TEXT NOT NULL,
  "book" TEXT NOT NULL,
  "bookOrder" INTEGER NOT NULL,
  "chapter" INTEGER NOT NULL,
  "verse" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  CONSTRAINT "BibleVerse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BiblePassage" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "translationId" TEXT NOT NULL,
  "book" TEXT NOT NULL,
  "chapter" INTEGER NOT NULL,
  "verseStart" INTEGER NOT NULL,
  "verseEnd" INTEGER NOT NULL,
  "reference" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BiblePassage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BibleTranslation_organizationId_abbreviation_key"
ON "BibleTranslation"("organizationId", "abbreviation");
CREATE INDEX "BibleTranslation_organizationId_name_idx" ON "BibleTranslation"("organizationId", "name");
CREATE UNIQUE INDEX "BibleVerse_translationId_book_chapter_verse_key"
ON "BibleVerse"("translationId", "book", "chapter", "verse");
CREATE INDEX "BibleVerse_translationId_bookOrder_chapter_verse_idx"
ON "BibleVerse"("translationId", "bookOrder", "chapter", "verse");
CREATE INDEX "BiblePassage_organizationId_translationId_idx"
ON "BiblePassage"("organizationId", "translationId");

ALTER TABLE "BibleTranslation" ADD CONSTRAINT "BibleTranslation_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BibleVerse" ADD CONSTRAINT "BibleVerse_translationId_fkey"
FOREIGN KEY ("translationId") REFERENCES "BibleTranslation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BiblePassage" ADD CONSTRAINT "BiblePassage_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BiblePassage" ADD CONSTRAINT "BiblePassage_translationId_fkey"
FOREIGN KEY ("translationId") REFERENCES "BibleTranslation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
