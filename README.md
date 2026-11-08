# LessonLab

Turn class PDFs into interactive lessons: study cards, a bilingual quiz bank, a Millionaire-style game, a narrated video, and per-student assessment — from one teacher upload and one student share link.

## Features

- Teacher-only admin with environment-configured credentials
- Classes, bulk PDF upload, private storage, durable background processing
- OpenAI-generated, source-grounded content in Greek and English
- Automatic narrated video (TTS + ffmpeg) with WebVTT captions
- Student share links, name-only entry, no accounts
- Cards, video, game, and questionnaire in one tabbed lesson
- Server-authoritative scoring, attempts, per-question analytics, CSV export
- Self-hosted Docker Compose stack with PostgreSQL and Redis

## Stack

Next.js 15 · TypeScript · PostgreSQL 16 · Prisma · Redis · BullMQ · OpenAI · ffmpeg · Poppler · Tailwind CSS

## Local development

```bash
cp .env.example .env
# Set AUTH_SECRET, TEACHER_PASSWORD, and either OPENAI_API_KEY or AI_PROVIDER=mock

docker run -d --name lessonlab-postgres -e POSTGRES_USER=lessonlab \
  -e POSTGRES_PASSWORD=lessonlab -e POSTGRES_DB=lessonlab -p 5432:5432 postgres:16-alpine
docker run -d --name lessonlab-redis -p 6379:6379 redis:7-alpine

npm install
npx prisma migrate deploy
npm run db:seed
npm run dev          # web on http://localhost:3000
npm run worker       # background pipeline, in another terminal
```

Set `AI_PROVIDER=mock` and `TTS_PROVIDER=mock` to develop without an OpenAI key. Mock mode still runs the full pipeline, including real ffmpeg video rendering.

## Production

```bash
cp .env.example .env
# Set AUTH_SECRET, TEACHER_PASSWORD, OPENAI_API_KEY, APP_BASE_URL
docker compose build
docker compose up -d
```

See `docs/deployment.md` and `docs/operations.md`.

## Single container

The `all-in-one` target bundles the web app, worker, PostgreSQL 16, and Redis into one image for demos, evaluation, and small single-node deployments. It needs no PostgreSQL, Redis, or Compose on the host.

```bash
docker build --target all-in-one -t lessonlab:all-in-one .

docker run -d --name lessonlab \
  -p 3000:3000 \
  -e AUTH_SECRET="$(openssl rand -base64 48)" \
  -e TEACHER_PASSWORD='change-me' \
  -e OPENAI_API_KEY='sk-...' \
  -e APP_BASE_URL='http://localhost:3000' \
  -v lessonlab-data:/data \
  lessonlab:all-in-one

curl -fsS http://localhost:3000/api/health
docker logs -f lessonlab
```

To run without an OpenAI key, add `-e AI_PROVIDER=mock -e TTS_PROVIDER=mock`.

Everything persistent (PostgreSQL, Redis, uploads, and rendered media) lives under `/data`, so keep the `lessonlab-data` volume. The first start initializes the database and applies migrations; later starts reuse it. Stop with `docker stop lessonlab`.

This mode is not a replacement for the Compose stack: it does not scale horizontally and has no built-in replication or backup. See `docs/deployment.md#single-container-mode` for configuration, upgrades, backups, and limitations, and run `./scripts/docker-push.sh` to publish the image to Docker Hub.

## Tests

```bash
npm test                 # unit
npm run test:integration # PostgreSQL + Redis via Testcontainers
npx playwright test      # end-to-end against localhost:3000
npx playwright test --config playwright.compose.config.ts  # against Compose
```

## Documentation

- `docs/auth.md` — credentials, sessions, throttling
- `docs/i18n.md` — Greek/English workflow
- `docs/generation.md` — prompts, models, validation, cost
- `docs/media.md` — TTS, ffmpeg, limits
- `docs/deployment.md` — Docker, sizing, secrets
- `docs/operations.md` — backup, restore, incident checklist

## License

MIT — see `LICENSE`. The software is provided “as is”, without warranty, and the authors are not liable for damages arising from its use. This is a standard license disclaimer, not legal advice.
