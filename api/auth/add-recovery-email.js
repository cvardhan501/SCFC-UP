const connectDB = require('../../lib/mongodb');
const Student = require('../../models/Student');
const crypto = require('crypto');
const { sendVerificationEmail } = require('../../lib/email');

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
      return res.status(400).json({ success: false, message: 'USN and email address are required.' });
    }

    const cleanUsn = usn.trim().toUpperCase();
    const cleanEmail = email.trim().toLowerCase();

    // Check if email is already linked to another account
    const existing = await Student.findOne({ email: cleanEmail, usn: { $ne: cleanUsn } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'This email address is already linked to another student account.' });
    }

    const student = await Student.findOne({ usn: cleanUsn });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student account not found.' });
    }

    const verifyToken = crypto.randomBytes(32).toString('hex');
    student.email = cleanEmail;
    student.emailVerified = false;
    student.emailVerificationToken = verifyToken;

    student.history.unshift({
      timestamp: new Date().toLocaleString('en-IN'),
      text: `Added recovery email: ${cleanEmail} (Verification pending)`
    });

    await student.save();

    const emailResult = await sendVerificationEmail({
      toEmail: cleanEmail,
      name: student.name,
      usn: student.usn,
      token: verifyToken
    });

    if (!emailResult.success) {
      console.error(`❌ Failed to send verification email to ${cleanUsn}:`, emailResult.error);
      return res.json({
        success: true,
        message: 'Recovery email updated, but we could not send a verification email right now. Please try verifying later.',
        emailResult
      });
    }

    return res.json({
      success: true,
      message: 'Recovery email saved successfully! A verification link has been sent to your email.'
    });
  } catch (error) {
    console.error('Add recovery email Vercel API error:', error);
    return res.status(500).json({ success: false, message: 'Server error while updating recovery email.' });
  }
};
