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
