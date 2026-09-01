const connectDB = require('../../lib/mongodb');
const Student = require('../../models/Student');
const bcrypt = require('bcryptjs');

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
    const { token, password, confirmPassword } = body;

    if (!token) {
      return res.status(400).json({ success: false, message: 'Password reset token is missing.' });
    }
    if (!password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'Please enter and confirm your new password.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    const student = await Student.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!student) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired password reset link. Please request a new one.'
      });
    }

    const salt = await bcrypt.genSalt(10);
    student.password = await bcrypt.hash(password, salt);
    student.resetPasswordToken = undefined;
    student.resetPasswordExpires = undefined;

    student.history.unshift({
      timestamp: new Date().toLocaleString('en-IN'),
      text: 'Account password reset via email link.'
    });

    await student.save();

    console.log(`Password reset completed for USN: ${student.usn}`);

    return res.json({
      success: true,
      message: 'Password reset successfully! Please login with your new password.',
      usn: student.usn
    });
  } catch (error) {
    console.error('Reset password Vercel API error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while resetting password. Please try again.'
    });
  }
};
