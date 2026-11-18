# Lesson access codes

Every lesson has a unique 9-digit number, assigned automatically when the lesson is created and backfilled for lessons that existed before the feature. The number is a shortcut for students; existing class and lesson share links keep working exactly as before.

## Student entry

Students can reach a lesson in two equivalent ways:

1. Enter the number in the **Have a lesson number?** box on the home page (`/el` or `/en`). A valid number redirects to that lesson's student entry screen.
2. Open the numeric URL directly: `/el/s/123456789` (replace the locale and number). The URL accepts any locale the app supports.

Either path shows the usual name and school form. After entry, the student gets the lesson's PDF, Cards, Resources, Game, and Questionnaire tabs. A student session is scoped to the number that was used, so opening a different number asks for the name and school again.

Numbers use the range `100000000`–`999999999`, so they are always exactly nine digits and never start with zero. An unused number is reported as not found and no lesson data is exposed.

## Failed-lookup lockout

Failed number lookups are counted per client IP and shared by the home-page form and direct numeric URLs:

- After **5** unsuccessful lookups, further lookups are blocked for **30** seconds, even if the next number is valid.
- A successful lookup clears the failure count.
- The home-page form shows the remaining seconds and re-enables itself when the lockout ends.
- Direct numeric URLs show the same wait message while the lockout is active.

Both limits are configurable through environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `LESSON_CODE_MAX_FAILURES` | `5` | Failed lookups allowed before a lockout |
| `LESSON_CODE_LOCKOUT_SECONDS` | `30` | Length of the lockout and the failure window, in seconds |

The lockout is a deterrent against guessing, not an account-level security boundary: the number is a convenience credential that is intentionally shared with students.

## Teacher display and regeneration

The lesson admin page shows the lesson's number next to its title. The round refresh button next to it creates a new number:

1. The teacher presses the refresh button.
2. A confirmation warns that the current number will stop working for students.
3. On confirmation the number is replaced immediately, the page shows the new value, and the old number no longer resolves.

Regeneration affects only the selected lesson. Other lessons keep their numbers. A student already inside the lesson with the old numeric URL keeps their current page until they reload or navigate; after that the old number is reported as invalid, and they can enter the new one.

The number is stored and displayed as plain text because the teacher must be able to read and re-share it. It is not meant to be a secret token; existing share links remain the revocable/expiring option.

