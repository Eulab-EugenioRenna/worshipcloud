# Worship Cloud

Cloud application for planning services and running live worship presentations.

## Workspace

- `apps/web`: Angular frontend
- `apps/api`: NestJS API
- `packages/shared/ui`: shared Angular components
- `packages/shared/dto`: shared API contracts
- `prisma`: PostgreSQL schema and migrations

## Local setup

Use the Node version declared in `.nvmrc`.

```sh
nvm use
npm install
cp .env.example .env
npm run infra:up
npm run db:generate
npm run db:migrate
```

Start the applications in separate terminals:

```sh
npm run start:api
npm run start:web
```

- Web: `http://localhost:4200`
- API health: `http://localhost:3333/api/v1/health`

## Verification

```sh
npm run typecheck
npm run lint
npm run build
```
