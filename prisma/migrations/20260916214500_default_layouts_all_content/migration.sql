UPDATE "SlideTemplate"
SET "kind" = 'Default'
WHERE "name" IN (
  'Default',
  'Default · Stage',
  'Default · Prompter',
  'Default · Alpha'
);
