DROP INDEX "LiveSession_serviceId_key";

CREATE INDEX "LiveSession_serviceId_createdAt_idx"
ON "LiveSession"("serviceId", "createdAt");
