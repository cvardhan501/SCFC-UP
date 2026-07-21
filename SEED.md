Seeding a student into the deployed app

Use the included script to register a student on the deployed site (useful when the deployment DB is empty).

Requirements:
- Node.js 18+ (for global fetch)
- `minimist` (install with `npm i minimist` or run via `node` with env args)

Example:

```bash
# install dependency (if not already)
npm install minimist

# run the script
node scripts/seed-student.js --url https://your-vercel-domain.vercel.app --name "UMADEVI" --usn A866175125132
```

Or set environment variables:

```bash
TARGET_URL=https://your-vercel-domain.vercel.app STUDENT_NAME="UMADEVI" STUDENT_USN=A866175125132 node scripts/seed-student.js
```

This will POST to `/api/auth/register` on the provided domain and create the student record.
