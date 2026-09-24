const { google } = require('googleapis');
const crypto = require('crypto');

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const redirectUri = `${appUrl}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    return null;
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const setupSecret = process.env.GOOGLE_OAUTH_SETUP_SECRET;
    const providedSecret = req.query?.secret || req.headers['x-setup-secret'];
    if (setupSecret && providedSecret !== setupSecret) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized OAuth setup request. Valid secret required.'
      });
    }

    const oauth2Client = getOAuth2Client();
    if (!oauth2Client) {
      return res.status(400).json({
        success: false,
        message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables are required.'
      });
    }

    const rawState = crypto.randomBytes(24).toString('hex');
    const secret = process.env.GOOGLE_CLIENT_SECRET || 'scfc-setup-secret';
    const hmac = crypto.createHmac('sha256', secret).update(rawState).digest('hex');
    const signedState = `${rawState}.${hmac}`;

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/gmail.send'],
      state: signedState
    });

    return res.redirect(authUrl);
  } catch (error) {
    console.error('Google OAuth init Vercel API error:', error);
    return res.status(500).json({ success: false, message: 'Failed to initiate Google OAuth authorization.' });
  }
};
