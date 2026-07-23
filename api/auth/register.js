const connectDB = require('../../lib/mongodb');
const Student = require('../../models/Student');
const bcrypt = require('bcrypt');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await connectDB();

    const { name, usn, password, confirmPassword } = req.body;
    if (!name || !usn || !password || !confirmPassword) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    const cleanUsn = usn.trim().toUpperCase();
    const cleanName = name.trim();

    // Check if USN already exists
    const existingStudent = await Student.findOne({ usn: cleanUsn });
    if (existingStudent) {
      return res.status(400).json({ message: 'This USN is already registered. Please Login.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Password and Confirm Password must match.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    const initialSemesters = { "1": [], "2": [], "3": [], "4": [], "5": [], "6": [], "7": [], "8": [] };

    const hashed = await bcrypt.hash(password, 10);

    const newStudent = new Student({
      name: cleanName,
      usn: cleanUsn,
      password: hashed,
      currentSemester: 1,
      theme: 'light',
      semesters: initialSemesters,
      history: [
        { timestamp: new Date().toLocaleString(), text: `Registered account for ${cleanName} (${cleanUsn}).` }
      ],
      tasks: [
        { text: 'Add Semester 1 subjects', done: true, date: 'Completed' },
        { text: 'Confirm grades with registrar', done: false, date: 'Tue' },
        { text: 'Download SGPA report', done: false, date: 'Fri' }
      ]
    });

    await newStudent.save();

    const studentObj = newStudent.toObject();
    delete studentObj.password;

    return res.status(201).json({ success: true, message: 'Registration successful. Please login.', student: studentObj });

  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'This USN is already registered. Please Login.' });
    }
    return res.status(500).json({ message: 'Server error during registration. Please try again.' });
  }
};
