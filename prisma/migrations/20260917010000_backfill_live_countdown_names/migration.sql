-- Live countdown JSON created before the name became part of the shared
-- contract must remain readable by active sessions and historical SSE events.
UPDATE "LiveSession" AS session
SET "countdown" = jsonb_set(
  session."countdown",
  '{name}',
  to_jsonb(definition."name"),
  true
)
FROM "CountdownDefinition" AS definition
WHERE session."countdown" IS NOT NULL
  AND session."countdown" ->> 'countdownId' = definition."id"
  AND NOT (session."countdown" ? 'name');

UPDATE "DomainEvent" AS event
SET "payload" = jsonb_set(
  event."payload",
  '{liveState,countdown,name}',
  to_jsonb(definition."name"),
  true
)
FROM "CountdownDefinition" AS definition
WHERE event."payload" #>> '{liveState,countdown,countdownId}' = definition."id"
  AND event."payload" #>> '{liveState,countdown,name}' IS NULL;
