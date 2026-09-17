CREATE TABLE "LineupVisualSlide" (
    "id" TEXT NOT NULL,
    "lineupItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LineupVisualSlide_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LineupVisualSlideLayout" (
    "id" TEXT NOT NULL,
    "lineupVisualSlideId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "templateId" TEXT,
    "layout" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LineupVisualSlideLayout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LineupVisualSlide_lineupItemId_position_key" ON "LineupVisualSlide"("lineupItemId", "position");
CREATE INDEX "LineupVisualSlide_lineupItemId_idx" ON "LineupVisualSlide"("lineupItemId");
CREATE UNIQUE INDEX "LineupVisualSlideLayout_lineupVisualSlideId_target_key" ON "LineupVisualSlideLayout"("lineupVisualSlideId", "target");
CREATE INDEX "LineupVisualSlideLayout_templateId_idx" ON "LineupVisualSlideLayout"("templateId");

ALTER TABLE "LineupVisualSlide" ADD CONSTRAINT "LineupVisualSlide_lineupItemId_fkey" FOREIGN KEY ("lineupItemId") REFERENCES "LineupItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LineupVisualSlideLayout" ADD CONSTRAINT "LineupVisualSlideLayout_lineupVisualSlideId_fkey" FOREIGN KEY ("lineupVisualSlideId") REFERENCES "LineupVisualSlide"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LineupVisualSlideLayout" ADD CONSTRAINT "LineupVisualSlideLayout_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SlideTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
