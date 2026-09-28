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
3. Configure Google OAuth for that Supabase project. The mobile redirect scheme is `todo://auth/callback`; Supabase's callback URL must also be registered in Google Cloud. For Apple sign-in, enable the Apple provider with the native Client ID `com.deniskoba.todo` and enable Sign in with Apple for that App ID in Apple Developer.
4. Run `pnpm install`, `pnpm db:generate`, then `pnpm dev:api` and `pnpm dev:mobile` in separate terminals.
5. Apply the initial schema with `pnpm db:deploy` after setting `DIRECT_URL`.

For a native iOS build, run `pnpm ios` from the repository root on a Mac with Xcode selected in `xcode-select`. Expo generates the native `ios/` and `android/` projects; these generated folders are intentionally git-ignored. After adding native packages or changing `app.json` capabilities (including Apple sign-in), synchronize the generated iOS project and rebuild; a Metro reload alone cannot add those native modules or entitlements.

## Supabase setup

- Enable Email/Password and Google under Authentication → Providers. For native Apple sign-in, enable Apple there too and add `com.deniskoba.todo` to Client IDs. The iOS App ID must have the Sign in with Apple capability. The app sends the Apple identity token directly to Supabase; it does not use an Apple OAuth web callback or embed an Apple client secret.
- Keep **Confirm Email** enabled unless you have deliberately accepted the risk of unverified email ownership when Google identities can be linked to the same account. Guests can use the app while waiting for verification.
- Add `todo://auth/callback` to Authentication → URL Configuration → Redirect URLs.
- In Google Cloud, configure the OAuth consent screen and add the Supabase callback URL shown by Supabase as an authorized redirect URI.
- Apply the schema using `pnpm db:deploy`, or paste the equivalent SQL migration into Supabase SQL Editor.
- The API verifies Supabase access tokens with Supabase Auth and scopes every query to the authenticated user. Keep database credentials server-side; the Supabase URL and publishable key are safe to use in the app and API. Set `SUPABASE_PUBLISHABLE_KEY` to the same key as `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. For a physical phone on local Wi-Fi, set `EXPO_PUBLIC_API_URL` to your Mac's LAN address (not `localhost`); for simulator testing, localhost is fine.

## Render

`render.yaml` is a Blueprint template for the API. Connect this separate repository in Render, review the plan, and provide `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`, and `DIRECT_URL` in Render's environment settings. The secret key is used only by the server to delete an account; never put it in `EXPO_PUBLIC_*`, the mobile app, Git, or API responses. The blueprint does not create or configure Supabase or Google OAuth by itself.

## API

All endpoints except `GET /v1/health` require `Authorization: Bearer <Supabase access token>`. The API provides `GET/PATCH/DELETE /v1/me`, `GET/POST /v1/lists`, `POST /v1/lists/import`, `PATCH/DELETE /v1/lists/:id`, `POST /v1/lists/:id/items`, and `PATCH/DELETE /v1/items/:id`. Each database query is scoped to the verified Supabase user. `DELETE /v1/me` hard-deletes the current Supabase Auth user; database foreign keys cascade to their profile, lists, and tasks. The import endpoint uses a stable client ID per local list, so retrying after a lost response does not duplicate data. The Render start command applies Prisma migrations before starting the API.

## MVP behavior

The home screen is available without an account. Guest lists, comments, tasks, and completion state are stored only on the device in SQLite and work without the API. Sign-in/sign-up (email/password, Google, and Apple on supported iOS devices) is optional in Profile. After authentication, pending guest lists are uploaded one at a time, appended to any existing account lists, and marked imported locally only after the server confirms each one. If import fails, the local data remains on the device and the home screen offers a retry. Signing out hides the cloud account data; already imported local lists remain on disk but are not shown to another guest. Sharing exports list text through the native share sheet; live collaboration is deferred.

## Project status

There are no seeded or demo user records. Signed-in lists, tasks, and profiles use the Supabase-backed API; guest data is device-local. The app revalidates queries on screen entry and when it returns to the foreground. The guest-import migration must be deployed before a signed-in user can import local lists.

Before App Store submission with Sign in with Apple, implement server-side revocation of the user's Apple tokens when deleting their account. The current Apple identity-token-only sign-in does not retain a revocable Apple token; the app gives Apple users the manual Settings path after deletion in the meantime.
