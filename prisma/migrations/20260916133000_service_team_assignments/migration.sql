CREATE TYPE "TeamAssignmentStatus" AS ENUM (
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'UNAVAILABLE',
  'REPLACEMENT_REQUESTED'
);

CREATE TABLE "ServiceTeamAssignment" (
  "id" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "status" "TeamAssignmentStatus" NOT NULL DEFAULT 'PENDING',
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceTeamAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceTeamAssignment_serviceId_userId_role_key"
ON "ServiceTeamAssignment"("serviceId", "userId", "role");

CREATE INDEX "ServiceTeamAssignment_serviceId_status_idx"
ON "ServiceTeamAssignment"("serviceId", "status");

CREATE INDEX "ServiceTeamAssignment_userId_status_idx"
ON "ServiceTeamAssignment"("userId", "status");

ALTER TABLE "ServiceTeamAssignment"
ADD CONSTRAINT "ServiceTeamAssignment_serviceId_fkey"
FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServiceTeamAssignment"
ADD CONSTRAINT "ServiceTeamAssignment_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
