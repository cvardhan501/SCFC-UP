// const express = require('express');
// const mongoose = require('mongoose');
// const cors = require('cors');
// const path = require('path');
// require('dotenv').config();

// const Student = require('./models/Student');

// const app = express();
// const PORT = process.env.PORT || 3000;
// const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/scfc_grade_calc';

// app.use(cors());
// app.use(express.json({ limit: '10mb' }));
// app.use(express.static(path.join(__dirname)));

// // MongoDB Connection Setup
// mongoose.connect(MONGODB_URI)
//   .then(() => console.log('Successfully connected to MongoDB database.'))
//   .catch(err => {
//     console.error('MongoDB connection error:', err.message);
//     console.log('Ensure MongoDB server is running locally on port 27017 or MONGODB_URI environment variable is set.');
//   });


// // ==========================================
// // REGISTER ENDPOINT
// // ==========================================
// app.post('/api/auth/register', async (req, res) => {
//   try {
//     const { name, usn } = req.body;
//     if (!name || !usn) {
//       return res.status(400).json({ message: 'Both Student Name and USN are required.' });
//     }

//     const cleanUsn = usn.trim().toUpperCase();
//     const cleanName = name.trim();

//     // Check if USN already exists
//     const existingStudent = await Student.findOne({ usn: cleanUsn });
//     if (existingStudent) {
//       return res.status(400).json({ message: 'This USN is already registered. Please Login.' });
//     }

//     // Prepare default semester 1 structure
//     const initialSemesters = {
//       "1": [],
//       "2": [],
//       "3": [],
//       "4": [],
//       "5": [],
//       "6": [],
//       "7": [],
//       "8": []
//     };

//     const newStudent = new Student({
//       name: cleanName,
//       usn: cleanUsn,
//       currentSemester: 1,
//       theme: 'light',
//       semesters: initialSemesters,
//       history: [
//         { timestamp: new Date().toLocaleString(), text: `Registered account for ${cleanName} (${cleanUsn}).` }
//       ],
//       tasks: [
//         { text: 'Add Semester 1 subjects', done: true, date: 'Completed' },
//         { text: 'Confirm grades with registrar', done: false, date: 'Tue' },
//         { text: 'Download SGPA report', done: false, date: 'Fri' }
//       ]
//     });

//     await newStudent.save();
//     return res.status(201).json({
//       success: true,
//       message: 'Registration successful. Please login.',
//       student: newStudent
//     });
//   } catch (error) {
//     console.error('Registration error:', error);
//     if (error.code === 11000) {
//       return res.status(400).json({ message: 'This USN is already registered. Please Login.' });
//     }
//     return res.status(500).json({ message: 'Server error during registration. Please try again.' });
//   }
// });

// // ==========================================
// // LOGIN ENDPOINT
// // ==========================================
// app.post('/api/auth/login', async (req, res) => {
//   try {
//     const { name, usn } = req.body;
//     if (!name || !usn) {
//       return res.status(400).json({ message: 'Both Student Name and USN are required.' });
//     }

//     const cleanUsn = usn.trim().toUpperCase();
//     const cleanName = name.trim();

//     const student = await Student.findOne({ usn: cleanUsn });
//     if (!student || student.name.toLowerCase() !== cleanName.toLowerCase()) {
//       return res.status(404).json({ message: 'Student not found. Please Register.' });
//     }

//     return res.json({
//       success: true,
//       message: 'Login successful.',
//       student: student
//     });
//   } catch (error) {
//     console.error('Login error:', error);
//     return res.status(500).json({ message: 'Server error during login. Please try again.' });
//   }
// });

// // ==========================================
// // GET STUDENT DATA ENDPOINT
// // ==========================================
// app.get('/api/student/:usn', async (req, res) => {
//   try {
//     const cleanUsn = req.params.usn.trim().toUpperCase();
//     const student = await Student.findOne({ usn: cleanUsn });

//     if (!student) {
//       return res.status(404).json({ message: 'Student not found.' });
//     }

//     return res.json({ success: true, student });
//   } catch (error) {
//     console.error('Fetch student error:', error);
//     return res.status(500).json({ message: 'Failed to retrieve student data.' });
//   }
// });

// // ==========================================
// // AUTO-SAVE / UPDATE STUDENT DATA ENDPOINT
// // ==========================================
// app.put('/api/student/:usn', async (req, res) => {
//   try {
//     const cleanUsn = req.params.usn.trim().toUpperCase();
//     const { name, theme, currentSemester, semesters, history, tasks } = req.body;

//     const student = await Student.findOne({ usn: cleanUsn });
//     if (!student) {
//       return res.status(404).json({ message: 'Student not found.' });
//     }

//     if (name) student.name = name.trim();
//     if (theme) student.theme = theme;
//     if (currentSemester) student.currentSemester = currentSemester;
//     if (semesters) student.semesters = semesters;
//     if (history) student.history = history;
//     if (tasks) student.tasks = tasks;

//     await student.save();
//     return res.json({ success: true, message: 'Data auto-saved successfully.' });
//   } catch (error) {
//     console.error('Auto-save error:', error);
//     return res.status(500).json({ message: 'Failed to auto-save student data.' });
//   }
// });

// // Catch-all route to serve SPA
// app.get('*', (req, res) => {
//   res.sendFile(path.join(__dirname, 'index.html'));
// });

// app.listen(PORT, () => {
//   console.log(`SCFC Grade Calculator server listening on http://localhost:${PORT}`);
// });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/scfc_grade_calc';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// ==========================================
// MONGOOSE SCHEMA & MODEL
// ==========================================
const studentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    usn: { type: String, required: true, unique: true, uppercase: true, trim: true },
    currentSemester: { type: Number, default: 1 },
    theme: { type: String, default: 'light' },

    // Schema.Types.Mixed ensures dynamic keys ("1", "2", etc.) and nested subject arrays persist
    semesters: {
      type: mongoose.Schema.Types.Mixed,
      default: {
        "1": [], "2": [], "3": [], "4": [],
        "5": [], "6": [], "7": [], "8": []
      }
    },
    history: { type: Array, default: [] },
    tasks: { type: Array, default: [] }
  },
  { timestamps: true, minimize: false } // minimize: false keeps empty semester arrays intact
);

const Student = mongoose.models.Student || mongoose.model('Student', studentSchema);

// ==========================================
// DATABASE CONNECTION
// ==========================================
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Successfully connected to MongoDB database.'))
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    console.log('Ensure MongoDB Atlas URI is set in environment variables or local Mongo is running.');
  });

// ==========================================
// REGISTER ENDPOINT
// ==========================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, usn } = req.body;
    if (!name || !usn) {
      return res.status(400).json({ success: false, message: 'Both Student Name and USN are required.' });
    }

    const cleanUsn = usn.trim().toUpperCase();
    const cleanName = name.trim();

    // Check existing
    const existingStudent = await Student.findOne({ usn: cleanUsn });
    if (existingStudent) {
      return res.status(400).json({ success: false, message: 'This USN is already registered. Please Login.' });
    }

    const initialSemesters = {
      "1": [], "2": [], "3": [], "4": [],
      "5": [], "6": [], "7": [], "8": []
    };

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
    console.log(`Registered new student: ${cleanUsn}`);

    return res.status(201).json({
      success: true,
      message: 'Registration successful. Please login.',
      student: newStudent
    });
  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'This USN is already registered. Please Login.' });
    }
    return res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
});

// ==========================================
// LOGIN ENDPOINT
// ==========================================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { name, usn } = req.body;
    if (!usn || !usn.trim()) {
      return res.status(400).json({ success: false, message: 'USN is required.' });
    }

    const cleanUsn = usn.trim().toUpperCase();
    const cleanName = name ? name.trim() : '';

    // Check if USN exists in the database
    const student = await Student.findOne({ usn: cleanUsn });

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found. Please Register.' });
    }

    // If USN exists but name is blank or doesn't match
    if (!cleanName || student.name.toLowerCase() !== cleanName.toLowerCase()) {
      return res.status(400).json({ success: false, message: 'Please enter your full name.' });
    }

    console.log(`User logged in: ${cleanUsn}`);
    return res.json({
      success: true,
      message: 'Login successful.',
      student: student
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

// ==========================================
// GET STUDENT DATA ENDPOINT
// ==========================================
app.get('/api/student/:usn', async (req, res) => {
  try {
    const cleanUsn = req.params.usn.trim().toUpperCase();
    const student = await Student.findOne({ usn: cleanUsn });

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student profile not found.' });
    }

    return res.json({ success: true, student });
  } catch (error) {
    console.error('Fetch student error:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve student data.' });
  }
});

// ==========================================
// AUTO-SAVE / UPDATE STUDENT DATA ENDPOINT
// ==========================================
app.put('/api/student/:usn', async (req, res) => {
  try {
    const cleanUsn = req.params.usn.trim().toUpperCase();
    const { name, theme, currentSemester, semesters, history, tasks } = req.body;

    const student = await Student.findOne({ usn: cleanUsn });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student record not found.' });
    }

    // Apply updates
    if (name !== undefined) student.name = name.trim();
    if (theme !== undefined) student.theme = theme;
    if (currentSemester !== undefined) student.currentSemester = currentSemester;
    if (history !== undefined) student.history = history;
    if (tasks !== undefined) student.tasks = tasks;

    if (semesters !== undefined) {
      student.semesters = semesters;
      student.markModified('semesters');
    }

    await student.save();
    console.log(`Auto-saved data for USN: ${cleanUsn}`);

    return res.json({
      success: true,
      message: 'Data auto-saved successfully.',
      student
    });
  } catch (error) {
    console.error('Auto-save error:', error);
    return res.status(500).json({ success: false, message: 'Failed to auto-save student data.' });
  }
});

// Catch-all route to serve SPA frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`SCFC Grade Calculator server listening on http://localhost:${PORT}`);
});