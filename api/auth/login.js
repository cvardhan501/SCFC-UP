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
    const { usn, password } = body;

    if (!usn || !password) {
      return res.status(400).json({ success: false, message: 'Please enter both USN and Password.' });
    }

    const cleanUsn = usn.trim().toUpperCase();

    // Retrieve hashed password explicitly
    const student = await Student.findOne({ usn: cleanUsn }).select('+password');
    if (!student) {
      return res.status(400).json({ success: false, message: 'Invalid USN or Password.' });
    }

    // If password is not set, prompt migration
    if (!student.password) {
      return res.json({ success: false, migrationRequired: true, message: 'Your account needs to be secured. Please create a password.' });
    }

    const match = await bcrypt.compare(password, student.password || '');
    if (!match) {
      return res.status(400).json({ success: false, incorrectPassword: true, message: 'The password you entered is incorrect.' });
    }

    const studentObj = student.toObject();
    delete studentObj.password;

    const responsePayload = {
      success: true,
      message: 'Login successful.',
      student: studentObj
    };

    if (!student.email) {
      responsePayload.emailRequired = true;
    }

    return res.json(responsePayload);

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Server error during login. Please try again.' });
  }
};
