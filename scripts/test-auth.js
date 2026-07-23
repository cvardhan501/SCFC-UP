const url = 'http://localhost:3000/api/auth/register';
const body = {
  name: 'Check User',
  usn: 'TS100',
  password: 'TestPass123',
  confirmPassword: 'TestPass123'
};
(async () => {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    console.log('STATUS', res.status);
    console.log(text);
  } catch (err) {
    console.error(err);
  }
})();
