# SCFC Grade Calculator

This repository contains the SCFC Grade Calculator web app (Express + MongoDB).

## Setup

1. Copy `.env.example` to `.env` and set your MongoDB Atlas connection string:

```
MONGODB_URI=your_mongodb_atlas_connection_string
```

2. Install dependencies:

```bash
npm install
```

3. Run locally:

```bash
npm run dev
```

The server listens on `http://localhost:3000` by default.

## Authentication & Migration

- The app uses password-based authentication (`USN` + `password`).
- Existing accounts (created using Name+USN) that lack a `password` field are detected on login and the UI prompts the user to create a password. Only the `password` field is updated during migration.
- All password hashing uses `bcrypt`.

## Environment

- The app requires `MONGODB_URI` (MongoDB Atlas). The server will exit if it is missing.

## CI

A basic GitHub Actions workflow is included at `.github/workflows/nodejs.yml`.

## Notes

- Ensure `.env` is in `.gitignore` (already configured).
- Update `package.json` repository field to point to your GitHub repository URL.

If you want, I can create a remote repo and commit these changes for you (requires Git credentials/access).