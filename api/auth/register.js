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

    const existingStudent = await Student.findOne({ usn: cleanUsn });
    if (existingStudent) {
      return res.status(400).json({ message: 'This USN is already registered. Please Login.' });
    }

    const initialSemesters = { "1": [], "2": [], "3": [], "4": [], "5": [], "6": [], "7": [], "8": [] };

    const newStudent = new Student({
      name: cleanName,
      usn: cleanUsn,
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
    return res.status(201).json({ success: true, message: 'Registration successful. Please login.', student: newStudent });

  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'This USN is already registered. Please Login.' });
    }
    return res.status(500).json({ message: 'Server error during registration. Please try again.' });
  }
};
