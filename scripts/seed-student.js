#!/usr/bin/env node
/**
 * Usage:
 *   node scripts/seed-student.js --url https://your-app.vercel.app --name "UMADEVI" --usn A866175125132
 * Or set env vars: TARGET_URL, STUDENT_NAME, STUDENT_USN
 */

const args = require('minimist')(process.argv.slice(2));

const target = args.url || process.env.TARGET_URL;
const name = args.name || process.env.STUDENT_NAME;
const usn = args.usn || process.env.STUDENT_USN;

if (!target || !name || !usn) {
  console.error('Missing required parameters. See usage in script header.');
  process.exit(2);
}

const payload = { name, usn };

(async () => {
  try {
    const endpoint = new URL('/api/auth/register', target).toString();
    console.log('Registering', usn, 'at', endpoint);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    console.log('Status:', res.status);
    console.log('Response:', body);
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(1);
  }
})();
