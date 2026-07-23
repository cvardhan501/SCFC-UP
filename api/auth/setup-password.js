const connectDB = require('../../lib/mongodb');
const Student = require('../../models/Student');
const bcrypt = require('bcrypt');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await connectDB();

    const { usn, password, confirmPassword } = req.body;
    if (!usn || !password || !confirmPassword) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Password and Confirm Password must match.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    const cleanUsn = usn.trim().toUpperCase();
    const student = await Student.findOne({ usn: cleanUsn }).select('+password');
    if (!student) {
      return res.status(400).json({ message: 'Invalid request.' });
    }

    if (student.password) {
      return res.status(400).json({ message: 'Password already set. Please login.' });
    }

    const hashed = await bcrypt.hash(password, 10);
    await Student.updateOne({ usn: cleanUsn }, { $set: { password: hashed } });

    return res.json({ success: true, message: 'Password created successfully.' });
  } catch (error) {
    console.error('Setup password error:', error);
    return res.status(500).json({ message: 'Server error during password setup.' });
  }
};
