CREATE TYPE "CountdownMode" AS ENUM ('DURATION', 'TARGET_TIME');

CREATE TABLE "CountdownDefinition" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mode" "CountdownMode" NOT NULL,
  "durationSeconds" INTEGER,
  "targetAt" TIMESTAMP(3),
  "autoAdvance" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CountdownDefinition_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CountdownDefinition_organizationId_name_idx" ON "CountdownDefinition"("organizationId", "name");
ALTER TABLE "CountdownDefinition" ADD CONSTRAINT "CountdownDefinition_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LiveSession" ADD COLUMN "countdown" JSONB;
