# Realjoy Attendance

A staff attendance app for Realjoy School, built with Expo (SDK 57) and Supabase.

Staff log attendance by taking a photo of where they are standing and then scanning
the QR code posted at reception. The server checks the QR code, checks that the phone
is inside the site's geofence, and writes one immutable record. Administrators get a
daily roster, full history with photos, staff management, and CSV export.

---

## Table of contents

- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
  - [1. Install dependencies](#1-install-dependencies)
  - [2. Create a Supabase project](#2-create-a-supabase-project)
  - [3. Configure environment variables](#3-configure-environment-variables)
  - [4. Create the database tables](#4-create-the-database-tables)
  - [5. Apply security, geofencing, and the write path](#5-apply-security-geofencing-and-the-write-path)
  - [6. Deploy the admin Edge Function](#6-deploy-the-admin-edge-function)
  - [7. Seed a location and the first administrator](#7-seed-a-location-and-the-first-administrator)
- [Missing database objects](#missing-database-objects)
- [Running the app](#running-the-app)
- [Testing the app](#testing-the-app)
- [Project structure](#project-structure)
- [Building with EAS](#building-with-eas)
- [Security notes](#security-notes)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## How it works

**Logging attendance (staff)**

1. Choose *Check in* or *Check out*.
2. Grant camera and location permission (both are required to continue).
3. Take a photo of the surroundings, then confirm or retake it.
4. Scan the attendance QR code.
5. The app compresses the photo to roughly 1024px wide at 50% JPEG quality,
   uploads it to the private `attendance-photos` bucket under a folder named after
   the employee's id, then calls the `record_attendance` database function.

**What the server enforces** (`supabase/setup.sql`)

- The caller must be an active employee linked to a Supabase Auth user.
- The scanned string must match the `qr_secret` of an active row in `locations`.
  Staff cannot read the `locations` table at all, so the secret never leaves the server.
- If both the location and the reading have coordinates, the distance is computed with
  a haversine function and rejected beyond the location's `radius_meters` (default 150).
  Location is best-effort: if the device cannot get a fix, the punch is still recorded
  with null coordinates and the geofence is skipped.
- Check-ins after 08:00 Africa/Lagos are marked `LATE`, otherwise `PRESENT`.
- A unique constraint on `(employee_id, work_date, type)` allows exactly one check-in
  and one check-out per employee per day.
- Staff have **no** insert policy on `attendance_records`. `record_attendance` is the
  only write path, and if it fails the client deletes the orphaned photo it just uploaded.

**Administration**

Admin screens are shown only when the signed-in employee has `role = 'ADMIN'`.
Creating staff, resetting passwords, deactivating, and deleting all go through the
`manage-employee` Edge Function, which re-verifies the caller is an admin using their
own JWT before switching to the service-role key. Generated passwords are shown once
in a modal so the admin can copy and hand them over.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| App | Expo SDK 57, React Native 0.86, React 19, TypeScript (strict) |
| Navigation | expo-router (file-based, typed routes enabled) |
| Backend | Supabase — Postgres, Auth, Storage, Edge Functions |
| Schema source of truth | Prisma 7 (`prisma/schema.prisma`) |
| Session storage | expo-secure-store, chunked to work around its 2048-byte cap |
| Builds | EAS Build |

Prisma is used **only** to define and migrate the schema. The app itself never imports
Prisma Client — it talks to Postgres exclusively through `@supabase/supabase-js`.

---

## Prerequisites

- **Node.js 20 or newer** and npm
- A **Supabase account** and project (the free tier is enough)
- **Supabase CLI** — needed to deploy the Edge Function
  (`npm install -g supabase`, or see the Supabase CLI install docs)
- A **physical iOS or Android device**. The core flow needs a real camera and real GPS,
  so simulators and the web target will not get you through a full punch.
- For your own builds: an **Expo account** and `npm install -g eas-cli`

---

## Setup

### 1. Install dependencies

```bash
git clone https://github.com/codexdotcom/employee-attendance.git
cd employee-attendance
npm install
```

### 2. Create a Supabase project

Create a project at [supabase.com](https://supabase.com), then collect:

- **Project URL** and **publishable/anon key** — Project Settings → API
- **Database connection strings** — Project Settings → Database
  (take both the pooled connection string and the direct one)

### 3. Configure environment variables

Two separate sets of variables are involved.

**For the app**, create `.env.local` in the project root:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-publishable-anon-key>
```

Expo only exposes variables prefixed with `EXPO_PUBLIC_` to your JavaScript, and it
inlines them into the bundle at build time — so never put a service-role key or any
other secret behind that prefix. `.env.local` is gitignored; `.env` is not.

**For Prisma**, set these in `.env` (used only by the CLI on your machine, never by the app):

```bash
DATABASE_URL=<pooled Postgres connection string>
DIRECT_URL=<direct Postgres connection string>
```

After changing any environment variable, restart the dev server with
`npx expo start --clear` so Metro picks up the new values.

### 4. Create the database tables

The schema lives in `prisma/schema.prisma` and defines `employees`, `locations`,
`attendance_records`, and the `Role` / `PunchType` / `AttendanceStatus` enums.
There is no committed migration yet, so generate the first one:

```bash
npx prisma migrate dev --name init
```

The SQL in the next step depends on the enum type names Prisma creates
(`"PunchType"`, `"AttendanceStatus"`), so run this before it.

### 5. Apply security, geofencing, and the write path

Open the Supabase SQL Editor, paste the contents of `supabase/setup.sql`, and run it.
The script is re-runnable. It creates:

- the foreign key from `employees.auth_user_id` to `auth.users`
- the private `attendance-photos` storage bucket
- helper functions `current_employee_id()`, `is_admin()`, `meters_between()`
- row level security policies on all three tables, plus storage policies scoping each
  employee to their own photo folder
- the `record_attendance()` function described above

### 6. Deploy the admin Edge Function

```bash
supabase link --project-ref <your-project-ref>
supabase functions deploy manage-employee
```

`supabase/config.toml` sets `verify_jwt = false` for this function because it performs
its own authorization: it rejects requests without an `Authorization` header and calls
`is_admin()` with the caller's own token before using the service-role key.
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected by
the platform, so there is nothing extra to configure.

### 7. Seed a location and the first administrator

**Create a location.** There is no admin UI for locations, so insert one via SQL.
Pick a long, unguessable `qr_secret` — anyone holding it can punch in from anywhere
the geofence allows:

```sql
insert into public.locations (name, qr_secret, latitude, longitude, radius_meters)
values ('Realjoy School — Reception', gen_random_uuid()::text, 6.5244, 3.3792, 150)
returning qr_secret;
```

Encode the returned `qr_secret` as a QR code with any QR generator and print it — that
printed code is what staff scan. Leave `latitude`/`longitude` null to disable the
geofence entirely while testing.

**Create the first admin.** `manage-employee` requires an existing admin, so the first
one has to be made by hand:

1. Authentication → Users → **Add user**. Set an email and password, and tick
   *Auto Confirm User*.
2. Copy the new user's UUID, then insert the matching employee row:

```sql
insert into public.employees (auth_user_id, full_name, email, staff_code, role, is_active)
values ('<auth-user-uuid>', 'Your Name', 'you@example.com', 'ADMIN001', 'ADMIN', true);
```

The email must match the auth user's email. Every later account can be created from
the app's **Manage staff → Add Staff** screen.

---

## Missing database objects

Three database objects are referenced by the code but are **not** defined anywhere in
this repository. Until you create them, sign-in and the punch flow work, but the
screens below will come up empty or fail:

| Object | Used by | Effect if missing |
| --- | --- | --- |
| `attendance_view` (view) | `src/app/(app)/admin/history.tsx`, `src/lib/export.ts` | Records list and CSV export return no rows |
| `daily_roster(p_date date)` (function) | `src/app/(app)/admin/today.tsx` | Today's roster is empty |
| `on_auth_user_created` (trigger on `auth.users`) | `supabase/functions/manage-employee/index.ts` | Staff created from the app never get `auth_user_id` set, so they can sign in but cannot punch |

The shapes they need to return are pinned by the TypeScript types in `src/lib/types.ts`:
`AttendanceView` for the view, and `RosterRow` (`PRESENT` / `LATE` / `ABSENT` per active
employee, with `check_in` and `check_out` times) for the function. The trigger must link
a new `auth.users` row to the pre-inserted `employees` row by email.

Creating the first admin manually (step 7) sets `auth_user_id` explicitly, so you can
test the full punch flow with that account before writing the trigger.

---

## Running the app

The app uses config plugins (camera and location permission strings, secure-store,
sharing) and `expo-updates`, so a **development build** is the reliable way to run it:

```bash
npx expo start
```

and open the project in a development build on a physical device. To produce one:

```bash
eas build --profile preview --platform android   # installable APK
eas build --profile preview --platform ios       # device build, needs a provisioning profile
```

Other entry points:

```bash
npm run android   # expo start --android
npm run ios       # expo start --ios
npm run web       # expo start --web
```

Expo Go works for browsing the UI and signing in, but expect gaps: location services
are limited in Expo Go on Android, and on iOS SDK 57 Expo Go is distributed through
`eas go`. The web target is not a supported platform for this app — file writes,
sharing, and the camera flow will not behave as they do on a device.

> `package.json` also lists `reset-project`. That script was part of the
> `create-expo-app` template and its file is not in this repository, so the command
> will fail — ignore it.

---

## Testing the app

You will need the printed QR code from step 7 and a device physically near the
location coordinates you inserted (or a location row with null coordinates).

**Staff flow**

1. Sign in with a staff account.
2. Tap **Log attendance → Check in**. Accept the camera and location prompts.
3. Take a photo, confirm it, then scan the QR code. You should land on a
   *Checked in* screen with the current time.
4. Tap **My attendance history** — the record should be listed, and tapping it opens
   the photo through a 10-minute signed URL.
5. Repeat with **Check out**.

**Cases worth exercising**

| Case | How | Expected |
| --- | --- | --- |
| Duplicate punch | Check in twice in one day | "You have already recorded this today." |
| Wrong QR | Scan any other QR code | "That QR code is not recognised..." |
| Outside the geofence | Punch from far away, or shrink `radius_meters` to 1 | "You appear to be about *N*m from the school." |
| Late arrival | Punch after 08:00 Africa/Lagos, or temporarily edit the threshold in `setup.sql` | Record shows `LATE`; roster pill turns amber |
| Deactivated staff | Admin → **Manage staff** → deactivate, then punch | Session is terminated globally; punching fails |
| Permissions denied | Refuse camera or location | Alert explaining what to enable, flow stops |

**Admin flow**

1. Sign in as the admin — the Administration group appears on the home screen.
2. **Today's attendance** — present/late/absent counts and per-staff rows.
3. **Manage staff → Add Staff** — creates the login and shows the generated password
   once. Copy it, sign in as that user on a second device, then reset the password and
   confirm the old one stops working.
4. **Export CSV** — pick a date range and export. The share sheet opens with a
   `attendance-<from>-to-<to>.csv` file. An empty range raises "No records in that range."

**Type checking**

```bash
npx tsc --noEmit
```

There is no test suite and no ESLint configuration in the repository yet
(`npm run lint` will prompt you to set one up).

---

## Project structure

```
src/
  app/                      expo-router routes
    _layout.tsx             auth gate + session auto-refresh on app foreground
    index.tsx               redirect into (app)
    (auth)/sign-in.tsx      email + password sign-in
    (app)/
      index.tsx             home; admin rows shown only to admins
      scan.tsx              choose → photo → review → QR → done
      admin/
        today.tsx           daily roster via daily_roster()
        history.tsx         records with signed photo URLs
        employees.tsx       staff list, reset, activate, delete
        new-employee.tsx    create staff, shows generated credentials
        export.tsx          CSV export over a date range
  components/CredentialsModal.tsx   one-time password display with copy buttons
  hooks/usePunchPermissions.ts      camera + location permission handling
  lib/
    supabase.ts             client + chunked SecureStore session adapter
    punch.ts                compress, upload, call record_attendance, error mapping
    location.ts             GPS fix with 12s timeout and cached fallback
    photos.ts               10-minute signed URLs for stored photos
    export.ts               CSV generation and share sheet
    adminApi.ts             typed wrapper over the manage-employee function
    types.ts                shared row types
    theme.ts                colours, spacing, radii, text styles
  providers/AuthProvider.tsx        session + employee record + isAdmin
prisma/schema.prisma        schema source of truth
supabase/
  setup.sql                 RLS, helpers, record_attendance
  functions/manage-employee/index.ts   admin-only account management
```

Imports use the `@/*` alias for `src/*` and `@/assets/*` for `assets/*`.

---

## Building with EAS

`eas.json` defines two profiles, both producing Android APKs:

- **preview** — internal distribution, `preview` update channel
- **production** — `production` update channel

Both profiles currently carry `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY` inline. Point these at your own project before
building, or move them to EAS environment variables.

```bash
eas build --profile production --platform android
```

`app.json` pins the bundle identifier and package to `com.realjoy.attendance`, the EAS
project id, and the owner account — change all three for your own builds. Over-the-air
updates use a `runtimeVersion` policy of `appVersion`, so bump `version` whenever you
ship a change that touches native code.

---

## Security notes

Worth knowing before you push this anywhere:

- **`.env` and `credentials.json` are committed to the repository.** `.env` holds
  Postgres connection strings and `credentials.json` holds Android keystore passwords.
  `.gitignore` only excludes `.env*.local`, so both are tracked. Rotate those
  credentials, add them to `.gitignore`, and purge them from history before the
  repository goes anywhere public.
- `eas.json` also hardcodes a Supabase project URL and anon key. The anon key is meant
  to be public, but the project reference identifies a live project.
- The anon key is safe to embed only because row level security is doing the work —
  do not weaken the policies in `setup.sql` without thinking it through.
- `qr_secret` is the one credential that must stay off staff devices. The
  `locations_admin_only` policy is what keeps it there.

---

## Troubleshooting

**"Missing Supabase env vars. Check .env.local and restart Expo with --clear."**
The app could not read `EXPO_PUBLIC_SUPABASE_URL` or `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
Confirm `.env.local` sits in the project root, the names carry the `EXPO_PUBLIC_`
prefix, then restart with `npx expo start --clear`.

**Sign-in succeeds but the app bounces back to the sign-in screen.**
The auth gate requires both a session *and* a matching `employees` row. Check that a
row exists with `auth_user_id` equal to the auth user's UUID and `is_active = true`.
For accounts created from the app, this is the missing `on_auth_user_created` trigger.

**"That QR code is not recognised."**
The scanned text does not match any active `locations.qr_secret`. Confirm the QR encodes
the secret exactly, with no trailing whitespace, and that `is_active = true`.

**"You appear to be about *N*m from the school."**
You are outside `radius_meters`. Raise the radius, correct the stored coordinates, or
null them out to disable the geofence while testing.

**"Photo upload failed" / storage permission errors.**
The storage policy requires the upload path's first folder segment to equal
`current_employee_id()`. This fails when `auth_user_id` is not linked, or when
`supabase/setup.sql` has not been run against the project.

**"Admins only." when managing staff.**
The Edge Function called `is_admin()` with your token and got false. Confirm your
employee row has `role = 'ADMIN'` and `is_active = true`, then sign out and back in.

**Today's attendance, Records, or Export come up empty.**
`daily_roster()` and `attendance_view` are almost certainly missing —
see [Missing database objects](#missing-database-objects).

---

## License

The `LICENSE` file is the MIT license as it shipped with the `create-expo-app`
template, still carrying Expo's copyright line. Update it to reflect the actual owner
of this project.
