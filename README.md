# Todo

An independent Expo + NestJS project for personal task lists. It is separate from HomeCare.

## Stack

- Expo / React Native app in `apps/mobile` (iOS and Android)
- NestJS API in `apps/api`, intended for Render
- Supabase Auth and PostgreSQL; Prisma migrations are in `apps/api/prisma/migrations`
- English-first typed localization and semantic theme tokens

## Local setup

1. Install Node.js 22 and pnpm 9.15.9.
2. Copy `.env.example` to `.env` and fill in values for a **new, separate Supabase project**.
3. Configure Google OAuth for that Supabase project. The mobile redirect scheme is `todo://auth/callback`; Supabase's callback URL must also be registered in Google Cloud.
4. Run `pnpm install`, `pnpm db:generate`, then `pnpm dev:api` and `pnpm dev:mobile` in separate terminals.
5. Apply the initial schema with `pnpm db:deploy` after setting `DIRECT_URL`.

For a native iOS build, run `pnpm ios` from the repository root on a Mac with Xcode selected in `xcode-select`. Expo generates the native `ios/` and `android/` projects; these generated folders are intentionally git-ignored.

## Supabase setup

- Enable Email/Password and Google under Authentication → Providers.
- Add `todo://auth/callback` to Authentication → URL Configuration → Redirect URLs.
- In Google Cloud, configure the OAuth consent screen and add the Supabase callback URL shown by Supabase as an authorized redirect URI.
- Apply the schema using `pnpm db:deploy`, or paste the equivalent SQL migration into Supabase SQL Editor.
- The API verifies Supabase access tokens with Supabase Auth and scopes every query to the authenticated user. Keep database credentials server-side; the Supabase URL and publishable key are safe to use in the app and API. Set `SUPABASE_PUBLISHABLE_KEY` to the same key as `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. For a physical phone on local Wi-Fi, set `EXPO_PUBLIC_API_URL` to your Mac's LAN address (not `localhost`); for simulator testing, localhost is fine.

## Render

`render.yaml` is a Blueprint template for the API. Connect this separate repository in Render, review the plan, and provide `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `DATABASE_URL`, and `DIRECT_URL` in Render's environment settings. The blueprint does not create or configure Supabase or Google OAuth by itself.

## API

All endpoints except `GET /v1/health` require `Authorization: Bearer <Supabase access token>`. The API currently provides `GET/PATCH /v1/me`, `GET/POST /v1/lists`, `PATCH/DELETE /v1/lists/:id`, `POST /v1/lists/:id/items`, and `PATCH/DELETE /v1/items/:id`. Each database query is scoped to the verified Supabase user.

## MVP behavior

Account sign-up/sign-in (email/password and Google), profile, lists and list comments, tasks with comments, completion state, swipe-to-delete, long-press selection, and bulk delete are the planned first slice. Sharing exports list text through the native share sheet; live collaboration is deferred.

## Project status

There are no seeded or demo user records. Lists, tasks, and the profile are read from and written to the Supabase-backed API; the app revalidates queries on screen entry and when it returns to the foreground. Cloud resources and provider credentials have not been provisioned; add them to `.env` locally and to Render/Supabase dashboards.
