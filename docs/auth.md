# Teacher authentication

The platform has one operator account: the teacher. Credentials come from the environment; there are no teacher rows in the database.

## Configuration

Set either `TEACHER_PASSWORD` or `TEACHER_PASSWORD_HASH`. A hash takes precedence.

```bash
# Generate an Argon2id hash
npm run hash-password -- "your long password"
# Copy the output into .env as TEACHER_PASSWORD_HASH=...
```

Required:

- `TEACHER_PASSWORD` or `TEACHER_PASSWORD_HASH`
- `AUTH_SECRET` with at least 32 characters (`openssl rand -base64 48`)

If configuration is missing, login returns HTTP 503 and no session is issued.

## Sessions

- Signed JWT in the `teacher_session` cookie, HS256 with `AUTH_SECRET`.
- `HttpOnly`, `SameSite=Lax`, `Secure` in production, 7-day absolute expiry.
- Logout clears the cookie. Tampered and expired tokens are rejected.
- Admin pages redirect to `/[locale]/login`; admin APIs return HTTP 401.

## Throttling and CSRF

- Failed logins are counted per client IP in Redis (`login:fail:<ip>`), with a sliding window configured by `LOGIN_MAX_FAILURES` and `LOGIN_WINDOW_SECONDS`. Exceeding the limit returns HTTP 429 with `Retry-After`.
- Successful login clears the counter.
- Admin mutations verify the `Origin` header against the request origin and `APP_BASE_URL`. Cross-origin mutations are rejected.
- Security headers (CSP, frame denial, nosniff, referrer policy) are set globally in `next.config.ts`.

## Rotating secrets

1. Generate a new password hash with `npm run hash-password`.
2. Update `TEACHER_PASSWORD_HASH` in `.env` and restart the `web` service.
3. To invalidate every existing session, rotate `AUTH_SECRET` and restart `web`. All teachers must log in again.
4. Never bake `.env` into an image; inject it with the deployment environment.
