const { Resend } = require('resend');

const getResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ RESEND_API_KEY is not configured in environment variables.');
    return null;
  }
  return new Resend(apiKey);
};

const getFromEmail = () => {
  return process.env.RESEND_FROM_EMAIL || 'SCFC Grade Calculator <onboarding@resend.dev>';
};

const getAppUrl = () => {
  return process.env.APP_URL || 'http://localhost:3000';
};

function formatResendError(error) {
  if (!error) return 'Failed to dispatch email.';
  const msg = typeof error === 'string' ? error : (error.message || '');
  const statusCode = error.statusCode || error.status;

  if (statusCode === 422 || msg.toLowerCase().includes('invalid `to`') || msg.toLowerCase().includes('invalid email')) {
    return 'Invalid email recipient address provided.';
  }
  if (statusCode === 429 || msg.toLowerCase().includes('rate limit')) {
    return 'Email dispatch rate limit reached. Please try again in a few minutes.';
  }
  if (statusCode === 401 || statusCode === 403) {
    return 'Email service configuration issue. Please contact administrator.';
  }
  return msg || 'Unable to send email right now. Please try again later.';
}

/**
 * Send Password Reset Email via Resend
 */
async function sendPasswordResetEmail({ toEmail, name, usn, token }) {
  const resend = getResendClient();
  const appUrl = getAppUrl();
  const resetLink = `${appUrl}/reset-password?token=${token}`;

  const subject = 'SCFC – Reset Your Password';
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Reset Your SCFC Password</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0c1024; color: #f3f5ff; margin: 0; padding: 24px; }
        .container { max-width: 540px; margin: 0 auto; background: #171a30; border: 1px solid rgba(255,255,255,0.12); border-radius: 20px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .logo { font-size: 24px; font-weight: 800; color: #6C63FF; text-align: center; margin-bottom: 24px; font-family: 'Outfit', sans-serif; }
        h2 { font-size: 20px; font-weight: 700; color: #ffffff; margin-bottom: 12px; }
        p { font-size: 14px; line-height: 1.6; color: #93a0c7; margin-bottom: 20px; }
        .btn-wrap { text-align: center; margin: 30px 0; }
        .btn { background: linear-gradient(135deg, #6C63FF, #8B5CF6); color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 6px 20px rgba(108,99,255,0.4); }
        .footer { border-top: 1px solid rgba(255,255,255,0.08); padding-top: 18px; margin-top: 24px; font-size: 12px; color: #6b7280; text-align: center; }
        .link-text { font-size: 11px; word-break: break-all; color: #8B5CF6; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">SCFC Grade Calculator</div>
        <h2>Reset Your Password</h2>
        <p>Hello <b>${name || usn}</b>,</p>
        <p>We received a request to reset your SCFC account password for Enrollment Number (USN) <b>${usn}</b>.</p>
        <p>Click the button below to create a new password:</p>
        <div class="btn-wrap">
          <a href="${resetLink}" class="btn" target="_blank">RESET PASSWORD</a>
        </div>
        <p>This password-reset link is temporary and can only be used once. It will automatically expire in 15 minutes.</p>
        <p>If you did not request this password reset, you can safely ignore this email.</p>
        <div class="footer">
          <p>Or copy and paste this link into your browser:<br><span class="link-text">${resetLink}</span></p>
          <p>Regards,<br><b>SCFC Team</b></p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `
SCFC Grade Calculator
Reset Your Password

Hello ${name || usn},

We received a request to reset your SCFC account password for USN: ${usn}.

Please use the following link to reset your password:
${resetLink}

This password-reset link is temporary and can only be used once.

If you did not request this password reset, please ignore this email.

Regards,
SCFC Team
  `;

  if (!resend) {
    console.warn(`⚠️ RESEND_API_KEY is not configured. Email dispatch to ${toEmail} skipped.`);
    return { success: false, error: 'Email service is not configured. Please set RESEND_API_KEY.' };
  }

  try {
    const resendResponse = await resend.emails.send({
      from: getFromEmail(),
      to: [toEmail],
      subject: subject,
      html: htmlContent,
      text: textContent
    });

    const { data, error } = resendResponse || {};

    if (error) {
      console.error('[Resend API Error]:', error);
      return {
        success: false,
        error: formatResendError(error)
      };
    }

    if (!data || !data.id) {
      console.error('[Resend Error] No email ID returned');
      return {
        success: false,
        error: 'Email service did not confirm delivery'
      };
    }

    console.log(`✅ Password reset email sent via Resend to ${toEmail} (ID: ${data.id})`);
    return { success: true, id: data.id };
  } catch (error) {
    console.error('❌ Resend API network error sending password reset email:', error);
    return { success: false, error: error.message || 'Failed to send password reset email' };
  }
}

/**
 * Send Email Verification Link via Resend
 */
async function sendVerificationEmail({ toEmail, name, usn, token }) {
  const resend = getResendClient();
  const appUrl = getAppUrl();
  const verifyLink = `${appUrl}/verify-email?token=${token}`;

  const subject = 'SCFC – Verify Your Email';
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Verify Your SCFC Email</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0c1024; color: #f3f5ff; margin: 0; padding: 24px; }
        .container { max-width: 540px; margin: 0 auto; background: #171a30; border: 1px solid rgba(255,255,255,0.12); border-radius: 20px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .logo { font-size: 24px; font-weight: 800; color: #6C63FF; text-align: center; margin-bottom: 24px; }
        h2 { font-size: 20px; font-weight: 700; color: #ffffff; margin-bottom: 12px; }
        p { font-size: 14px; line-height: 1.6; color: #93a0c7; margin-bottom: 20px; }
        .btn-wrap { text-align: center; margin: 30px 0; }
        .btn { background: linear-gradient(135deg, #22D3EE, #6C63FF); color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 6px 20px rgba(34,211,238,0.4); }
        .footer { border-top: 1px solid rgba(255,255,255,0.08); padding-top: 18px; margin-top: 24px; font-size: 12px; color: #6b7280; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">SCFC Grade Calculator</div>
        <h2>Verify Your Email Address</h2>
        <p>Hello <b>${name || usn}</b>,</p>
        <p>Thank you for linking your email address to your SCFC account (USN: <b>${usn}</b>).</p>
        <p>Please click the button below to verify your recovery email address:</p>
        <div class="btn-wrap">
          <a href="${verifyLink}" class="btn" target="_blank">VERIFY EMAIL</a>
        </div>
        <div class="footer">
          <p>Regards,<br><b>SCFC Team</b></p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `
SCFC Grade Calculator
Verify Your Email Address

Hello ${name || usn},

Please verify your recovery email for USN ${usn} using the link below:
${verifyLink}

Regards,
SCFC Team
  `;

  if (!resend) {
    console.warn(`⚠️ RESEND_API_KEY is not configured. Email verification to ${toEmail} skipped.`);
    return { success: false, error: 'Email service is not configured. Please set RESEND_API_KEY.' };
  }

  try {
    const resendResponse = await resend.emails.send({
      from: getFromEmail(),
      to: [toEmail],
      subject: subject,
      html: htmlContent,
      text: textContent
    });

    const { data, error } = resendResponse || {};

    if (error) {
      console.error('[Resend API Error]:', error);
      return {
        success: false,
        error: formatResendError(error)
      };
    }

    if (!data || !data.id) {
      console.error('[Resend Error] No email ID returned');
      return {
        success: false,
        error: 'Email service did not confirm delivery'
      };
    }

    console.log(`✅ Verification email sent via Resend to ${toEmail} (ID: ${data.id})`);
    return { success: true, id: data.id };
  } catch (error) {
    console.error('❌ Resend API network error sending verification email:', error);
    return { success: false, error: error.message || 'Failed to send verification email' };
  }
}

/**
 * Send Change Email Address Verification via Resend
 */
async function sendChangeEmailVerification({ toEmail, name, usn, token }) {
  const resend = getResendClient();
  const appUrl = getAppUrl();
  const verifyLink = `${appUrl}/verify-email-change?token=${token}`;

  const subject = 'SCFC – Verify Your New Email Address';
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Verify Your New SCFC Email</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0c1024; color: #f3f5ff; margin: 0; padding: 24px; }
        .container { max-width: 540px; margin: 0 auto; background: #171a30; border: 1px solid rgba(255,255,255,0.12); border-radius: 20px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .logo { font-size: 24px; font-weight: 800; color: #6C63FF; text-align: center; margin-bottom: 24px; font-family: 'Outfit', sans-serif; }
        h2 { font-size: 20px; font-weight: 700; color: #ffffff; margin-bottom: 12px; }
        p { font-size: 14px; line-height: 1.6; color: #93a0c7; margin-bottom: 20px; }
        .btn-wrap { text-align: center; margin: 30px 0; }
        .btn { background: linear-gradient(135deg, #6C63FF, #8B5CF6); color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 6px 20px rgba(108,99,255,0.4); }
        .footer { border-top: 1px solid rgba(255,255,255,0.08); padding-top: 18px; margin-top: 24px; font-size: 12px; color: #6b7280; text-align: center; }
        .link-text { font-size: 11px; word-break: break-all; color: #8B5CF6; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">SCFC Grade Calculator</div>
        <h2>Verify Your New Email Address</h2>
        <p>Hello <b>${name || usn}</b>,</p>
        <p>A request was made to change the email address associated with your SCFC account (USN: <b>${usn}</b>) to <b>${toEmail}</b>.</p>
        <p>Please click the button below to verify and confirm your new email address:</p>
        <div class="btn-wrap">
          <a href="${verifyLink}" class="btn" target="_blank">VERIFY NEW EMAIL</a>
        </div>
        <p>If you did not request this change, you can safely ignore this email and your existing email address will remain unchanged.</p>
        <div class="footer">
          <p>Or copy and paste this link into your browser:<br><span class="link-text">${verifyLink}</span></p>
          <p>Regards,<br><b>SCFC Team</b></p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `
SCFC Grade Calculator
Verify Your New Email Address

Hello ${name || usn},

A request was made to update your SCFC account email (USN: ${usn}) to ${toEmail}.

Please confirm your new email address using the link below:
${verifyLink}

If you did not request this email change, please ignore this message.

Regards,
SCFC Team
  `;

  if (!resend) {
    console.warn(`⚠️ RESEND_API_KEY is not configured. Change email verification to ${toEmail} skipped.`);
    return { success: false, error: 'Email service is not configured. Please set RESEND_API_KEY.' };
  }

  try {
    const resendResponse = await resend.emails.send({
      from: getFromEmail(),
      to: [toEmail],
      subject: subject,
      html: htmlContent,
      text: textContent
    });

    const { data, error } = resendResponse || {};

    if (error) {
      console.error('[Resend API Error]:', error);
      return {
        success: false,
        error: formatResendError(error)
      };
    }

    if (!data || !data.id) {
      console.error('[Resend Error] No email ID returned');
      return {
        success: false,
        error: 'Email service did not confirm delivery'
      };
    }

    console.log(`✅ Change email verification sent via Resend to ${toEmail} (ID: ${data.id})`);
    return { success: true, id: data.id };
  } catch (error) {
    console.error('❌ Resend API network error sending change email verification:', error);
    return { success: false, error: error.message || 'Failed to send change email verification' };
  }
}

module.exports = {
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendChangeEmailVerification
};
