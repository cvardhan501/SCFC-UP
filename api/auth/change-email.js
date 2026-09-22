const connectDB = require('../../lib/mongodb');
const Student = require('../../models/Student');

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
    const { usn, newEmail, confirmNewEmail } = body;

    if (!usn || !newEmail) {
      return res.status(400).json({ success: false, message: 'USN and new email address are required.' });
    }

    const cleanUsn = usn.trim().toUpperCase();
    const cleanNewEmail = newEmail.trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanNewEmail)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }

    if (confirmNewEmail && cleanNewEmail !== confirmNewEmail.trim().toLowerCase()) {
      return res.status(400).json({ success: false, message: 'New email and confirm email do not match.' });
    }

    const student = await Student.findOne({ usn: cleanUsn });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student account not found.' });
    }

    if (student.email && student.email.toLowerCase() === cleanNewEmail) {
      return res.status(400).json({ success: false, message: 'The new email address must be different from your current email.' });
    }

    // Ensure email is not registered to another account
    const existingOther = await Student.findOne({ email: cleanNewEmail, usn: { $ne: cleanUsn } });
    if (existingOther) {
      return res.status(400).json({ success: false, message: 'This email address is already registered to another account.' });
    }

    // Update account email in MongoDB
    student.email = cleanNewEmail;
    if (!student.recoveryEmail) {
      student.recoveryEmail = cleanNewEmail;
    }
    student.emailVerified = true;
    student.pendingEmail = undefined;
    student.pendingEmailToken = undefined;
    student.pendingEmailExpires = undefined;

    student.history.unshift({
      timestamp: new Date().toLocaleString('en-IN'),
      text: `Updated account email to: ${cleanNewEmail}`
    });

    await student.save();

    const studentObj = student.toObject();
    delete studentObj.password;

    return res.json({
      success: true,
      message: 'Account email updated successfully!',
      student: studentObj
    });
  } catch (error) {
    console.error('Change email API error:', error);
    return res.status(500).json({ success: false, message: 'Server error while updating email.' });
  }
};
