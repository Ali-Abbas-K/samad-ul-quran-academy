# Samad-ul-Qur'an Academy Server

Real Node.js + SQLite backend. No npm packages are required.

## Requirements
- Node.js 22.5+ (uses the built-in `node:sqlite` module)

## Windows
```bat
cd server
set JWT_SECRET=put-a-long-random-secret-here
set ADMIN_KEY=put-a-long-random-admin-key-here
npm start
```
Then open `http://localhost:8080`.

## Linux/macOS
```bash
cd server
JWT_SECRET='put-a-long-random-secret-here' ADMIN_KEY='put-a-long-random-admin-key-here' npm start
```

The SQLite database is created automatically at `data/samad-ul-quran.db`. Existing tables are migrated with `ALTER TABLE` statements; existing records are not intentionally deleted.

## API security
- Student/teacher APIs use signed bearer tokens.
- Admin APIs require `X-Admin-Key`.
- Passwords use `scrypt` with per-password random salts.
- Payment verification is server-side only.
- Payment submissions are initially `pending`.
- Payment verification/rejection is audited and not deletable through the API.

For production deployment, use HTTPS, a strong secret/key stored outside source control, a reverse proxy/firewall, and scheduled health/billing execution.
