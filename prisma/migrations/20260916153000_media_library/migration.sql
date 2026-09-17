CREATE TYPE "MediaAssetKind" AS ENUM (
  'IMAGE',
  'VIDEO',
  'AUDIO',
  'MOTION_BACKGROUND',
  'LOGO',
  'COUNTDOWN_VIDEO'
);

CREATE TABLE "MediaAsset" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" "MediaAssetKind" NOT NULL,
  "url" TEXT NOT NULL,
  "thumbnailUrl" TEXT,
  "durationMs" INTEGER,
  "width" INTEGER,
  "height" INTEGER,
  "category" TEXT,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MediaAsset_organizationId_kind_idx" ON "MediaAsset"("organizationId", "kind");
CREATE INDEX "MediaAsset_organizationId_name_idx" ON "MediaAsset"("organizationId", "name");

ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
