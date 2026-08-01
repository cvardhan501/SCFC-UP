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
    const { name, usn, password, confirmPassword } = body;

    if (!name || !usn) {
      return res.status(400).json({ success: false, message: 'Name and USN are required.' });
    }

    const cleanUsn = usn.trim().toUpperCase();
    const cleanName = name.trim();

    // Check if USN already exists
    const existingStudent = await Student.findOne({ usn: cleanUsn });
    if (existingStudent) {
      return res.status(400).json({ success: false, message: 'This USN is already registered. Please Login.' });
    }

    let hashed = undefined;
    if (password || confirmPassword) {
      if (password !== confirmPassword) {
        return res.status(400).json({ success: false, message: 'Password and Confirm Password must match.' });
      }

      if (password.length < 8) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
      }
      hashed = await bcrypt.hash(password, 10);
    }

    const initialSemesters = { "1": [], "2": [], "3": [], "4": [], "5": [], "6": [], "7": [], "8": [] };

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
      return res.status(400).json({ success: false, message: 'This USN is already registered. Please Login.' });
    }
    return res.status(500).json({ success: false, message: 'Server error during registration. Please try again.' });
  }
};
