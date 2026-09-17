CREATE TYPE "LiveSessionStatus" AS ENUM ('PREPARING', 'READY', 'LIVE', 'ENDED');

CREATE TABLE "LiveSession" (
  "id" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "programOwnerId" TEXT,
  "outputAccessKey" TEXT NOT NULL,
  "status" "LiveSessionStatus" NOT NULL DEFAULT 'PREPARING',
  "preview" JSONB,
  "program" JSONB,
  "blackout" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LiveSession_serviceId_key" ON "LiveSession"("serviceId");
CREATE UNIQUE INDEX "LiveSession_outputAccessKey_key" ON "LiveSession"("outputAccessKey");
CREATE INDEX "LiveSession_programOwnerId_idx" ON "LiveSession"("programOwnerId");
CREATE INDEX "LiveSession_status_idx" ON "LiveSession"("status");

ALTER TABLE "LiveSession"
ADD CONSTRAINT "LiveSession_serviceId_fkey"
FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LiveSession"
ADD CONSTRAINT "LiveSession_programOwnerId_fkey"
FOREIGN KEY ("programOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
