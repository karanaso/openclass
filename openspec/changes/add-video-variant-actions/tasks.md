# Tasks

## 1. Shared Media Streaming and Admin Preview Route

- [x] 1.1 Extract the byte-range streaming logic from `src/app/api/s/[token]/lessons/[lessonId]/media/[locale]/[kind]/route.ts` into a shared server helper that accepts the storage key, content type, and cache policy; refactor the student route to use it and verify `npm run test:integration -- media` still passes range, full-file, and 404 cases
- [x] 1.2 Add `GET /api/admin/lessons/[lessonId]/media/[locale]/[kind]` guarded by `withAdmin`, validating `locale` and `kind`, looking up the `VideoAsset`, and returning `404` unless it is `READY` with the requested key; verify with an integration test that an anonymous request is `401`, a non-ready or unknown variant is `404`, a full request is `200`, and a `Range` request is `206` with the expected bytes
- [x] 1.3 Verify the admin media route never accepts a student session or share token and never exposes storage keys; add an integration assertion using a student-session cookie and confirm the route denies it

## 2. Forced Re-render Through the Existing Pipeline

- [x] 2.1 Add an optional `runId` to `PipelineJob` and include it in `jobIdFor` only when present; propagate `runId` from the `tts` stage to the `render` stage; verify with a unit test that two requests with different `runId` values produce different job ids while requests without one keep the current id
- [x] 2.2 Update `POST /api/admin/lessons/[lessonId]/video` to read the current variant, return `409` for `PENDING` or `RENDERING`, generate a `runId` for accepted requests, and enqueue `tts`; verify with an integration test that a `READY` variant can be queued again, a pending variant is rejected, and the unauthenticated request queues nothing
- [x] 2.3 Keep the lesson `jobVersion` unchanged during recreate and verify with an integration test that a re-render reuses the existing `LessonVisual` and does not call the image provider again when the visual set is already ready
- [x] 2.4 Verify recreate failure isolation by forcing a render error for one locale and confirming that variant becomes `FAILED` with its reason while the other locale, cards, and questions remain usable

## 3. Admin Video Variant Controls and Preview

- [x] 3.1 Rework `src/components/admin/video-variant-controls.tsx` into per-locale rows that show the status badge plus Play and Recreate for `READY`, Recreate for `FAILED`/`SKIPPED`, Generate when no asset exists, and disabled actions while `PENDING`/`RENDERING`; verify with a component test covering each status and the request each action sends
- [x] 3.2 Add the inline preview player for `READY` variants using the admin media URLs, including poster and captions, a single-open-locale rule, and a visible unavailable message when media fails; verify with a component test asserting the video source, poster, caption track, and error state
- [x] 3.3 Preserve the existing `video-variant-${locale}` selector and add stable test ids for play, recreate, and preview; verify the component test queries the controls by role and test id and the lesson page typechecks with the updated props
- [x] 3.4 Add Play, Recreate, and preview-unavailable labels to `messages/en.json` and `messages/el.json`; verify `npm test -- messages` passes and both catalogs stay identical
- [x] 3.5 Extend the admin portion of `e2e/student.spec.ts` to assert that a ready variant exposes Play and Recreate and that Play opens the inline preview; verify with `npm run test:e2e -- student`

## 4. Integration Verification

- [x] 4.1 Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run test:integration`, confirming the existing video, media, student, and security suites still pass
- [x] 4.2 Run `openspec validate add-video-variant-actions --strict` and confirm the delta spec and task list are structurally valid

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result.
