# Support GPT-6 Luna as the generation model

- Change: `support-gpt-6-luna-model`
- Created: `2026-11-19`
- Status: implemented
- Implemented: `2026-11-19`

## Request

I would like to make this app work with gpt-6 luna. I have updated the env. but when trying to execute the app it breaks.

## Clarifications

- The failing configuration uses `AI_PROVIDER=openai` and `OPENAI_TEXT_MODEL=gpt-6-luna`.
- Generation requests fail with HTTP 400: `Unsupported parameter: 'temperature' is not supported with this model.` The request currently sends `temperature: 0.2` to the Responses API.
- GPT-6 Luna is a reasoning model: sampling parameters such as `temperature` are rejected whenever reasoning effort is not `none`, and the model defaults to `medium` reasoning effort.

## Implementation

- Completed: 2026-11-19
- Tasks: 8/8
- Verification: `npm run typecheck`; `npm run lint`; `npm test` (43 files, 253 tests passed); real `gpt-6-luna` generation of a 2-page lesson produced topics, 10 cards, 13 questionnaire items, 12 game questions, and a 5-criterion rubric; the generation job completed in 1 attempt with model `gpt-6-luna` and estimated cost `$0.0056424`.
