ALTER TABLE "SlideTemplate" ADD COLUMN "target" TEXT NOT NULL DEFAULT 'Main';

CREATE TABLE "SongVisualSlide" (
  "id" TEXT NOT NULL,
  "songId" TEXT NOT NULL,
  "sectionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SongVisualSlide_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SongVisualSlideLayout" (
  "id" TEXT NOT NULL,
  "songVisualSlideId" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "templateId" TEXT,
  "layout" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SongVisualSlideLayout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SongVisualSlide_songId_position_key" ON "SongVisualSlide"("songId", "position");
CREATE INDEX "SongVisualSlide_songId_sectionId_idx" ON "SongVisualSlide"("songId", "sectionId");
CREATE UNIQUE INDEX "SongVisualSlideLayout_songVisualSlideId_target_key" ON "SongVisualSlideLayout"("songVisualSlideId", "target");
CREATE INDEX "SongVisualSlideLayout_templateId_idx" ON "SongVisualSlideLayout"("templateId");

ALTER TABLE "SongVisualSlide" ADD CONSTRAINT "SongVisualSlide_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SongVisualSlide" ADD CONSTRAINT "SongVisualSlide_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "SongSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SongVisualSlideLayout" ADD CONSTRAINT "SongVisualSlideLayout_songVisualSlideId_fkey" FOREIGN KEY ("songVisualSlideId") REFERENCES "SongVisualSlide"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SongVisualSlideLayout" ADD CONSTRAINT "SongVisualSlideLayout_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SlideTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
