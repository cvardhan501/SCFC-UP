const connectDB = require('../../lib/mongodb');
const Student = require('../../models/Student');
const bcrypt = require('bcrypt');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await connectDB();

    const { usn, password } = req.body;
    if (!usn || !password) {
      return res.status(400).json({ message: 'Invalid USN or Password.' });
    }

    const cleanUsn = usn.trim().toUpperCase();

    // Retrieve hashed password explicitly
    const student = await Student.findOne({ usn: cleanUsn }).select('+password');
    if (!student) {
      return res.status(400).json({ message: 'Invalid USN or Password.' });
    }

    // If password is not set, prompt migration
    if (!student.password) {
      return res.json({ success: false, migrationRequired: true, message: 'Your account needs to be secured. Please create a password.' });
    }

    const match = await bcrypt.compare(password, student.password || '');
    if (!match) {
      return res.status(400).json({ message: 'Invalid USN or Password.' });
    }

    const studentObj = student.toObject();
    delete studentObj.password;

    return res.json({ success: true, message: 'Login successful.', student: studentObj });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Server error during login. Please try again.' });
  }
};
