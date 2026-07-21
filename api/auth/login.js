const connectDB = require('../../lib/mongodb');
const Student = require('../../models/Student');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await connectDB();

    const { name, usn } = req.body;
    if (!name || !usn) {
      return res.status(400).json({ message: 'Both Student Name and USN are required.' });
    }

    const cleanUsn = usn.trim().toUpperCase();
    const cleanName = name.trim();

    const student = await Student.findOne({ usn: cleanUsn });
    if (!student || student.name.toLowerCase() !== cleanName.toLowerCase()) {
      return res.status(404).json({ message: 'Student not found. Please Register.' });
    }

    return res.json({ success: true, message: 'Login successful.', student: student });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Server error during login. Please try again.' });
  }
};
