# MiniLedger

A small app to track money you've lent to friends.

- **Backend:** Node.js + TypeScript + Express + PostgreSQL (`/backend`)
- **App:** React Native (Expo) + TypeScript (`/mobile`)

## Features
- Phone-number login with a **mock OTP** (printed in the server log)
- Add a loan entry (friend, amount, due date), mark as repaid
- Summary: total lent, total repaid, outstanding, **overdue amount**
- List with overdue entries highlighted (red) and sorted first
- **Bonus:** receipt photo upload, input validation (zod), automated tests

## Run it

### 1. Database
```bash
cd backend
docker compose up -d        # or use any local Postgres and edit DATABASE_URL
```

### 2. Backend
```bash
cp .env.example .env
npm install
npm run dev                 # tables are created automatically on start
```
API runs on `http://localhost:4000`. When you request an OTP, look in this terminal for:
`[MOCK OTP] +919876543210 -> 123456`

### 3. Mobile app
```bash
cd mobile
npm install
npx expo start              # press a (Android emulator) / i (iOS simulator) / scan QR with Expo Go
```
- Android emulator and iOS simulator work with no config.
- On a **physical phone**, use your computer's LAN IP: `EXPO_PUBLIC_API_URL=http://192.168.x.x:4000 npx expo start`

### Tests
```bash
cd backend && npm test      # runs against an in-memory Postgres (pg-mem), no DB needed
```

## API
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/request-otp` | no | `{phone}` -> logs a 6-digit OTP (5 min expiry) |
| POST | `/auth/verify-otp` | no | `{phone, otp}` -> `{token}` (JWT, 7 days) |
| GET | `/loans` | yes | Your entries (overdue first, repaid last) |
| POST | `/loans` | yes | `friendName, amount, dueDate (YYYY-MM-DD)`, optional `receipt` image (multipart) |
| PATCH | `/loans/:id/repay` | yes | Mark repaid (409 if already repaid) |
| GET | `/summary` | yes | `{totalLent, totalRepaid, totalOutstanding, overdueAmount}` |

## Design notes
- **Overdue** = not repaid AND `due_date < today` (server date, UTC), applied in SQL for the summary and in code for the list.
- **Money** is `NUMERIC(12,2)` in Postgres (no float drift), converted to numbers at the API boundary.
- **OTP** is stored in Postgres with expiry and a 5-attempt limit; verifying deletes it (single use).
- **Isolation:** every loan query filters by the JWT user id.
- **Repay** is a single atomic `UPDATE ... WHERE repaid_at IS NULL`, so double taps can't double-repay.
- **Receipts:** images only, max 5 MB, random filenames, stored on local disk. Production: S3 + signed URLs.
- **Not done / next steps:** real SMS provider, OTP rate limiting, `expo-secure-store` for the token, pagination.
