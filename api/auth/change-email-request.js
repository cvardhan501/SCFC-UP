const connectDB = require('../../lib/mongodb');
const Student = require('../../models/Student');
const crypto = require('crypto');
const { sendChangeEmailVerification } = require('../../lib/email');

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
    const { usn, newEmail } = body;

    if (!usn || !newEmail) {
      return res.status(400).json({ success: false, message: 'USN and new email address are required.' });
    }

    const cleanUsn = usn.trim().toUpperCase();
    const cleanNewEmail = newEmail.trim().toLowerCase();

    // Ensure new email is not already used by another account
    const existing = await Student.findOne({ email: cleanNewEmail, usn: { $ne: cleanUsn } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'This email address is already registered to another account.' });
    }

    const student = await Student.findOne({ usn: cleanUsn });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student account not found.' });
    }

    if (student.email === cleanNewEmail && student.emailVerified) {
      return res.status(400).json({ success: false, message: 'This email is already your active verified email address.' });
    }

    const changeToken = crypto.randomBytes(32).toString('hex');
    student.pendingEmail = cleanNewEmail;
    student.pendingEmailToken = changeToken;

    student.history.unshift({
      timestamp: new Date().toLocaleString('en-IN'),
      text: `Requested email change to ${cleanNewEmail} (Verification link sent)`
    });

    await student.save();

    const emailResult = await sendChangeEmailVerification({
      toEmail: cleanNewEmail,
      name: student.name,
      usn: student.usn,
      token: changeToken
    });

    if (!emailResult.success) {
      console.error(`❌ Failed to send change-email verification to ${cleanUsn}:`, emailResult.error);
      return res.status(500).json({
        success: false,
        message: emailResult.error || 'Failed to send verification email to your new address. Please try again.'
      });
    }

    return res.json({
      success: true,
      message: 'Verification link sent to your new email address. Please click the link in your inbox to confirm the change.'
    });
  } catch (error) {
    console.error('Change email request Vercel API error:', error);
    return res.status(500).json({ success: false, message: 'Server error while requesting email change.' });
  }
};
