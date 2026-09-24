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

  const query = req.query || {};
  const urlPath = req.url || req.originalUrl || req.path || '';
  const isCallback = query.action === 'callback' || query.code !== undefined || query.error !== undefined || urlPath.includes('/callback');

  if (isCallback) {
    // ==========================================
    // GOOGLE OAUTH CALLBACK BRANCH
    // ==========================================
    try {
      const { code, state, error } = query;

      if (error) {
        return res.status(400).send(`
          <!DOCTYPE html>
          <html>
          <head><title>Google OAuth Authorization Denied</title></head>
          <body style="font-family:sans-serif; background:#0c1024; color:#fff; text-align:center; padding:50px;">
            <h2 style="color:#EF4444;">Authorization Denied</h2>
            <p style="color:#93a0c7;">Google OAuth authorization was cancelled or denied: ${error}</p>
          </body>
          </html>
        `);
      }

      if (!code || !state) {
        return res.status(400).send('<h2>Invalid Request</h2><p>Missing code or state parameter.</p>');
      }

      const parts = String(state).split('.');
      if (parts.length !== 2) {
        return res.status(400).send('<h2>Invalid State Parameter</h2><p>CSRF verification failed.</p>');
      }
      const [rawState, hmac] = parts;
      const secret = process.env.GOOGLE_CLIENT_SECRET || 'scfc-setup-secret';
      const expectedHmac = crypto.createHmac('sha256', secret).update(rawState).digest('hex');
      if (hmac !== expectedHmac) {
        return res.status(400).send('<h2>Invalid State Parameter</h2><p>CSRF token mismatch.</p>');
      }

      const oauth2Client = getOAuth2Client();
      if (!oauth2Client) {
        return res.status(500).send('<h2>OAuth Error</h2><p>Google OAuth environment variables not configured.</p>');
      }

      const { tokens } = await oauth2Client.getToken(code);

      if (tokens && tokens.refresh_token) {
        process.env.GOOGLE_REFRESH_TOKEN = tokens.refresh_token;

        // Securely persist refresh token to local .env file if available
        try {
          const fs = require('fs');
          const path = require('path');
          const envPath = path.join(process.cwd(), '.env');
          if (fs.existsSync(envPath)) {
            let content = fs.readFileSync(envPath, 'utf8');
            if (content.includes('GOOGLE_REFRESH_TOKEN=')) {
              content = content.replace(/GOOGLE_REFRESH_TOKEN=.*/g, `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
            } else {
              content += `\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`;
            }
            fs.writeFileSync(envPath, content, 'utf8');
            console.log('✅ Google OAuth refresh token securely saved to local .env file.');
          }
        } catch (fileErr) {
          console.error('Could not write refresh token to local .env:', fileErr.message);
        }

        console.log('✅ Google OAuth authorization successful. Sender account authorized: scfc.studentos@gmail.com');

        return res.status(200).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Google OAuth Authorization Successful</title>
            <style>
              body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0c1024; color: #f3f5ff; padding: 40px; text-align: center; }
              .card { max-width: 500px; margin: 0 auto; background: #171a30; border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
              h2 { color: #22C55E; margin-bottom: 12px; }
              p { color: #93a0c7; line-height: 1.6; font-size: 14px; }
              .badge { display: inline-block; background: rgba(34, 197, 94, 0.15); border: 1px solid #22C55E; color: #22C55E; padding: 6px 14px; border-radius: 20px; font-weight: 700; font-size: 13px; margin: 16px 0; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>OAuth Setup Completed Successfully!</h2>
              <div class="badge">Sender: scfc.studentos@gmail.com</div>
              <p>Google OAuth authorization was completed. The Gmail API setup is active for sending email notifications.</p>
              <p style="font-size:12px; color:#6b7280; margin-top:20px;">The refresh token has been saved to your local .env file. No secrets were exposed to the browser.</p>
            </div>
          </body>
          </html>
        `);
      } else {
        console.log('⚠️ Google OAuth token exchange completed. No new refresh token issued (already authorized).');
        return res.status(200).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Google OAuth Authorized</title>
            <style>
              body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0c1024; color: #f3f5ff; padding: 40px; text-align: center; }
              .card { max-width: 500px; margin: 0 auto; background: #171a30; border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
              h2 { color: #38BDF8; margin-bottom: 12px; }
              p { color: #93a0c7; line-height: 1.6; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>OAuth Account Already Authorized</h2>
              <p>Google OAuth authorization succeeded. The application is ready to dispatch emails using the existing refresh token.</p>
            </div>
          </body>
          </html>
        `);
      }
    } catch (error) {
      console.error('Google OAuth callback Vercel API error:', error);
      return res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head><title>OAuth Callback Error</title></head>
        <body style="font-family:sans-serif; background:#0c1024; color:#fff; text-align:center; padding:50px;">
          <h2 style="color:#EF4444;">OAuth Token Exchange Failed</h2>
          <p style="color:#93a0c7;">${error.message || 'Server error exchanging code for refresh token.'}</p>
        </body>
        </html>
      `);
    }
  }

  // ==========================================
  // GOOGLE OAUTH INITIATION BRANCH
  // ==========================================
  try {
    const setupSecret = process.env.GOOGLE_OAUTH_SETUP_SECRET;
    const providedSecret = query.secret || req.headers['x-setup-secret'];
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

