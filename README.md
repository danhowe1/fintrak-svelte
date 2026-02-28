# Authenticated SvelteKit Starter

This project is a SvelteKit starter with:

- Auth.js via `@auth/sveltekit`
- Auth0 as the configured provider
- a shared authenticated layout
- a protected route group
- login/logout endpoints
- minimal auth smoke tests

## Setup

Install dependencies:

```sh
npm install
```

Create a `.env` file with these required variables:

```env
AUTH_SECRET=your-long-random-secret
AUTH0_ID=your-auth0-client-id
AUTH0_SECRET=your-auth0-client-secret
AUTH0_ISSUER=https://your-tenant-region.auth0.com
```

The app also accepts these equivalent names:

```env
AUTH_AUTH0_ID=your-auth0-client-id
AUTH_AUTH0_SECRET=your-auth0-client-secret
AUTH_AUTH0_ISSUER=https://your-tenant-region.auth0.com
```

`AUTH_SECRET` is required by Auth.js. The Auth0 values are read in [src/lib/server/auth-config.ts](/c:/Users/d-how/Github%20Projects/fintrak-svelte/src/lib/server/auth-config.ts).

For Auth0, configure the application with callback and logout URLs matching your local app origin. For local development that typically means:

- callback URL: `http://localhost:5173/auth/callback/auth0`
- logout return URL: `http://localhost:5173/`

Start the dev server:

```sh
npm run dev
```

## Database Smoke Test

The repo includes a Supabase/Postgres smoke test in [tests/supabase.smoke.ts](/c:/Users/d-how/Github%20Projects/fintrak-svelte/tests/supabase.smoke.ts).

Set one of these environment variables before running it:

```env
SUPABASE_DEV_DATABASE_URL=postgres://...
```

Supported names:

- `SUPABASE_DEV_DATABASE_URL`
- `SUPABASE_DB_URL`
- `DATABASE_URL`

Run the test with:

```sh
npm run test:db
```

For local development, prefer the Supabase session pooler connection string from the Supabase dashboard rather than the direct `db.<project-ref>.supabase.co` host. The direct host is commonly IPv6-only and can fail locally with `getaddrinfo ENOENT`.

If your connection should not use SSL, you can also set:

```env
SUPABASE_DB_SSL=false
```

## Scripts

```sh
npm run dev
npm run check
npm run test
npm run test:db
npm run build
```

## Route Structure

Authentication is set up in [src/auth.ts](/c:/Users/d-how/Github%20Projects/fintrak-svelte/src/auth.ts) and enforced in two places:

- [src/hooks.server.ts](/c:/Users/d-how/Github%20Projects/fintrak-svelte/src/hooks.server.ts) applies a default-deny policy for non-public routes
- [src/routes/(protected)/+layout.server.ts](/c:/Users/d-how/Github%20Projects/fintrak-svelte/src/routes/%28protected%29/+layout.server.ts) protects the protected route group at the layout level

### Public routes

Put public pages directly under `src/routes`, for example:

```text
src/routes/+page.svelte
src/routes/about/+page.svelte
```

If you add a new route that should stay public, make sure it is explicitly allowed by the policy in [src/hooks.server.ts](/c:/Users/d-how/Github%20Projects/fintrak-svelte/src/hooks.server.ts).

### Protected routes

Put protected pages under the `(protected)` route group:

```text
src/routes/(protected)/dashboard/+page.svelte
src/routes/(protected)/settings/+page.svelte
```

The `(protected)` folder name is not part of the URL. For example:

- `src/routes/(protected)/dashboard/+page.svelte` maps to `/dashboard`
- `src/routes/(protected)/settings/+page.svelte` maps to `/settings`

Because the group has its own protected server layout, every page inside it requires a session by default.

## Login and Logout Flow

- `GET /login` starts provider login and defaults successful direct logins to `/dashboard`
- `POST /logout` clears the local Auth.js session
- `GET /logout` redirects to the provider logout URL

Relevant files:

- [src/routes/login/+server.ts](/c:/Users/d-how/Github%20Projects/fintrak-svelte/src/routes/login/+server.ts)
- [src/routes/logout/+server.ts](/c:/Users/d-how/Github%20Projects/fintrak-svelte/src/routes/logout/+server.ts)
- [src/routes/+layout.svelte](/c:/Users/d-how/Github%20Projects/fintrak-svelte/src/routes/+layout.svelte)

## Tests

The minimal auth smoke tests live in [tests/auth.smoke.test.ts](/c:/Users/d-how/Github%20Projects/fintrak-svelte/tests/auth.smoke.test.ts).

They cover:

- unauthenticated redirect to login
- login callback URL handling
- logout redirect behavior
- local signout behavior
