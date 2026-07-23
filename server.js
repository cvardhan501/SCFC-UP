// Legacy code removed. Active server implementation follows below.
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;

// Use MongoDB Atlas only. Ensure dotenv is loaded above before reading env.
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable is not configured.');
  process.exit(1);
}
console.log('Using MongoDB Atlas');

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// Use centralized Student model to keep schema in one place (models/Student.js)
const Student = require('./models/Student');
const dns = require('dns');

function buildStandardAtlasUri(srvUri, srvRecords) {
  const parsed = new URL(srvUri);
  if (parsed.protocol !== 'mongodb+srv:') {
    throw new Error('Only mongodb+srv:// URIs can be converted to standard Atlas URIs.');
  }

  const auth = parsed.username
    ? `${encodeURIComponent(parsed.username)}${parsed.password ? `:${encodeURIComponent(parsed.password)}` : ''}@`
    : '';

  const database = parsed.pathname ? parsed.pathname.slice(1) : '';
  const queryParams = new URLSearchParams(parsed.searchParams);
  if (!queryParams.has('tls') && !queryParams.has('ssl')) {
    queryParams.set('tls', 'true');
  }
  if (!queryParams.has('retryWrites')) {
    queryParams.set('retryWrites', 'true');
  }
  if (!queryParams.has('w')) {
    queryParams.set('w', 'majority');
  }
  const query = queryParams.toString();
  const hosts = srvRecords.map(record => `${record.name}:${record.port}`).join(',');

  let standardUri = `mongodb://${auth}${hosts}`;
  if (database) standardUri += `/${database}`;
  if (query) standardUri += `?${query}`;
  return standardUri;
}

async function resolveAtlasSrv(srvHost) {
  const srvName = `_mongodb._tcp.${srvHost}`;
  try {
    return await dns.promises.resolveSrv(srvName);
  } catch (err) {
    if (err && err.code === 'ECONNREFUSED') {
      dns.setServers(['8.8.8.8', '1.1.1.1']);
      return await dns.promises.resolveSrv(srvName);
    }
    throw err;
  }
}

// ==========================================
// DATABASE CONNECTION (with automatic non-SRV retry)
// ==========================================
(async function connectToAtlas() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB Atlas');
  } catch (err) {
    if (MONGODB_URI.startsWith('mongodb+srv://')) {
      try {
        const parsed = new URL(MONGODB_URI.replace('mongodb+srv://', 'mongodb://'));
        const host = parsed.hostname;
        const srvRecords = await resolveAtlasSrv(host);
        const standardUri = buildStandardAtlasUri(MONGODB_URI, srvRecords);
        console.warn('Original SRV connection failed. Retrying using a non-SRV Atlas connection string...');
        await mongoose.connect(standardUri);
        console.log('✅ Connected to MongoDB Atlas using non-SRV connection string');
        return;
      } catch (fallbackErr) {
        console.error('Non-SRV Atlas fallback connection error:');
        console.error(fallbackErr);
      }
    }

    console.error('MongoDB connection error:');
    console.error(err);
    process.exit(1);
  }
})();

// ==========================================
// REGISTER ENDPOINT
// ==========================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, usn, password, confirmPassword } = req.body;

    if (!name || !usn || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    const cleanUsn = usn.trim().toUpperCase();
    const cleanName = name.trim();

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Password and Confirm Password must match.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    // Check existing USN in the selected database
    const existingStudent = await Student.findOne({ usn: cleanUsn });
    if (existingStudent) {
      return res.status(400).json({ success: false, message: 'This USN is already registered. Please Login.' });
    }

    const initialSemesters = {
      "1": [], "2": [], "3": [], "4": [],
      "5": [], "6": [], "7": [], "8": []
    };

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
    console.log(`Registered new student: ${cleanUsn}`);

    const studentObj = newStudent.toObject();
    delete studentObj.password;

    return res.status(201).json({
      success: true,
      message: 'Registration successful. Please login.',
      student: studentObj
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
    const { usn, password } = req.body;
    if (!usn || !password) {
      return res.status(400).json({ success: false, message: 'Invalid USN or Password.' });
    }

    const cleanUsn = usn.trim().toUpperCase();

    // Retrieve hashed password explicitly
    const student = await Student.findOne({ usn: cleanUsn }).select('+password');

    if (!student) {
      return res.status(400).json({ success: false, message: 'Invalid USN or Password.' });
    }

    // If password is not set, require migration (do not reject)
    if (!student.password) {
      return res.json({ success: false, migrationRequired: true, message: 'Your account needs to be secured. Please create a password.' });
    }

    const passwordMatch = await bcrypt.compare(password, student.password || '');
    if (!passwordMatch) {
      return res.status(400).json({ success: false, message: 'Invalid USN or Password.' });
    }

    console.log(`User logged in: ${cleanUsn}`);
    const studentObj = student.toObject();
    delete studentObj.password;

    return res.json({ success: true, message: 'Login successful.', student: studentObj });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

// ==========================================
// PASSWORD SETUP / MIGRATION ENDPOINT
// ==========================================
app.post('/api/auth/setup-password', async (req, res) => {
  try {
    const { usn, password, confirmPassword } = req.body;
    if (!usn || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Password and Confirm Password must match.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    const cleanUsn = usn.trim().toUpperCase();
    const student = await Student.findOne({ usn: cleanUsn }).select('+password');
    if (!student) {
      return res.status(400).json({ success: false, message: 'Invalid request.' });
    }

    // If password already set, do not overwrite here
    if (student.password) {
      return res.status(400).json({ success: false, message: 'Password already set. Please login.' });
    }

    const hashed = await bcrypt.hash(password, 10);
    // Update only the password field
    await Student.updateOne({ usn: cleanUsn }, { $set: { password: hashed } });

    return res.json({ success: true, message: 'Password created successfully.' });
  } catch (error) {
    console.error('Setup password error:', error);
    return res.status(500).json({ success: false, message: 'Server error during password setup.' });
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
  console.log('Database: MongoDB Atlas');
});