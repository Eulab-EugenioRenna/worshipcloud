# Worship Cloud

Cloud application for planning services and running live worship presentations.

## Workspace

- `apps/web`: Angular frontend
- `apps/api`: NestJS API
- `packages/shared/ui`: shared Angular components
- `packages/shared/dto`: shared API contracts
- `prisma`: PostgreSQL schema and migrations

## Docker setup

The complete application runs in Docker. No application image is built: the
official Node image mounts the workspace and a persistent `node_modules` volume,
while Nginx serves the Angular output mounted from `dist/apps/web/browser`.

```sh
cp .env.example .env
npm run infra:up
```

`infra:up` installs dependencies inside the volume only when `package-lock.json`
changes, applies database migrations, starts the NestJS API, and keeps the
Angular build in watch mode. Source changes are rebuilt into the mounted `dist`
directory, so they never require a Docker image rebuild.

- Application: `http://localhost:8080`
- API health through Nginx: `http://localhost:8080/api/v1/health`

Set `RESEND_API_KEY` in `.env`; the file is ignored by Git. To stop the stack,
run `npm run infra:down`. Named volumes preserve dependencies, PostgreSQL data,
and Redis data. Nx runtime state is isolated per container start so API and web
watch processes cannot reuse interrupted task state.

## Host development

Use the Node version declared in `.nvmrc` only if you want to run Nx directly on
the host.

## Verification

```sh
npm run typecheck
npm run lint
npm run build
```
