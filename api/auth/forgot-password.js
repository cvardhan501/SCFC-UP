const connectDB = require('../../lib/mongodb');
const Student = require('../../models/Student');
const crypto = require('crypto');
const { sendPasswordResetEmail } = require('../../lib/email');

const rateLimitMap = new Map();

function isRateLimited(key, maxRequests = 3, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const record = rateLimitMap.get(key);
  if (!record) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  if (now > record.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  if (record.count >= maxRequests) {
    return true;
  }
  record.count += 1;
  return false;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    await connectDB();

    const body = typeof req.body === 'string' ? (req.body ? JSON.parse(req.body) : {}) : (req.body || {});
    const { usn, email } = body;

    if (!usn || !email) {
      return res.status(400).json({ success: false, message: 'Enrollment number and email address are required.' });
    }

    const cleanUsn = usn.trim().toUpperCase();
    const cleanEmail = email.trim().toLowerCase();

    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const rateLimitKey = `${clientIp}_${cleanUsn}`;

    if (isRateLimited(rateLimitKey, 3, 15 * 60 * 1000)) {
      return res.status(429).json({
        success: false,
        message: 'Too many reset requests. Please wait 15 minutes before trying again.'
      });
    }

    // Require both enrollment number AND registered email to match the exact same account
    const student = await Student.findOne({ usn: cleanUsn, email: cleanEmail });

    if (student) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      student.resetPasswordToken = resetToken;
      student.resetPasswordExpires = resetExpires;
      await student.save();

      console.log(`[Vercel Serverless] Generated reset token for ${cleanUsn} (${cleanEmail})`);

      const emailResult = await sendPasswordResetEmail({
        toEmail: student.email,
        name: student.name,
        usn: student.usn,
        token: resetToken
      });

      if (!emailResult.success) {
        console.error(`❌ Failed to send password reset email to ${cleanUsn}:`, emailResult.error);
        return res.status(500).json({
          success: false,
          match: true,
          message: emailResult.error || 'Unable to send reset email right now. Please try again later.'
        });
      }

      return res.json({
        success: true,
        match: true,
        message: 'Password reset link sent successfully! Please check your email inbox.'
      });
    } else {
      console.log(`Forgot password mismatch attempt for USN: ${cleanUsn}, Email: ${cleanEmail}`);
      return res.status(400).json({
        success: false,
        match: false,
        message: 'Invalid details. The enrollment number and registered email do not match any registered account.'
      });
    }
  } catch (error) {
    console.error('Forgot password Vercel API error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing reset request.'
    });
  }
};
