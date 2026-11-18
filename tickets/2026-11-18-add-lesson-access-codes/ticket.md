# Add 9-digit lesson access codes

- Change: `add-lesson-access-codes`
- Created: `2026-11-18`
- Status: implemented
- Implemented: 2026-11-18

## Request

each lesson newly created or old should automatically get a 9 digit number. with that number the student can get into the quiz/pdf/etc like having a link.

## Clarifications

- The 9-digit number is an additional shortcut; existing class and lesson share links keep working unchanged.
- Numbers are random and unique (100000000–999999999), not sequential.
- The teacher gets a round refresh button to regenerate a lesson's number; regenerating invalidates the previous number.
- Students can type the number on the main (home) screen and are redirected to the lesson, and the number also works directly in the student URL.
- After 5 unsuccessful number lookups, the client is locked out for 30 seconds.

## Implementation

- Completed: 2026-11-18
- Tasks: 17/17
- Verification: `npm run typecheck`; `npm run lint`; `npm test` (185 passed); `npm run test:integration` (151 passed); `npm run test:e2e` (15 passed)
