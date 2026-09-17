CREATE TABLE "SlideTemplate" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "layout" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SlideTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SlideDocument" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "templateId" TEXT,
  "name" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SlideDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SlideTemplate_organizationId_name_key" ON "SlideTemplate"("organizationId", "name");
CREATE INDEX "SlideTemplate_organizationId_kind_idx" ON "SlideTemplate"("organizationId", "kind");
CREATE INDEX "SlideDocument_organizationId_name_idx" ON "SlideDocument"("organizationId", "name");
CREATE INDEX "SlideDocument_templateId_idx" ON "SlideDocument"("templateId");

ALTER TABLE "SlideTemplate" ADD CONSTRAINT "SlideTemplate_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SlideDocument" ADD CONSTRAINT "SlideDocument_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SlideDocument" ADD CONSTRAINT "SlideDocument_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "SlideTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
