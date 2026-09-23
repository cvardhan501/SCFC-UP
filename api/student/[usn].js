const connectDB = require('../../lib/mongodb');
const Student = require('../../models/Student');
const { authorizeStudentAccess, sanitizeStudent } = require('../../lib/auth-session');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-Session-Token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { usn } = req.query;

  if (!usn) {
    return res.status(400).json({ success: false, message: 'USN is required.' });
  }

  const cleanUsn = usn.trim().toUpperCase();

  // Enforce session authorization for both GET and PUT
  const authResult = authorizeStudentAccess(req, cleanUsn);
  if (!authResult.authenticated) {
    return res.status(401).json({ success: false, message: authResult.message });
  }
  if (!authResult.authorized) {
    return res.status(403).json({ success: false, message: authResult.message });
  }

  try {
    await connectDB();

    // GET /api/student/:usn
    if (req.method === 'GET') {
      const student = await Student.findOne({ usn: cleanUsn });
      if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
      }
      return res.status(200).json({ success: true, student: sanitizeStudent(student) });
    }

    // PUT /api/student/:usn
    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? (req.body ? JSON.parse(req.body) : {}) : (req.body || {});

      if (!body || Object.keys(body).length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid request data.' });
      }

      const { name, theme, themePreferenceSet, currentSemester, semesterPreferenceSet, semesters, history, tasks, examConfig, timetable, trackerConfig } = body;

      const student = await Student.findOne({ usn: cleanUsn });
      if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
      }

      if (name !== undefined) student.name = name.trim();
      if (theme !== undefined) student.theme = theme;
      if (themePreferenceSet !== undefined) student.themePreferenceSet = Boolean(themePreferenceSet);
      if (currentSemester !== undefined) student.currentSemester = currentSemester;
      if (semesterPreferenceSet !== undefined) student.semesterPreferenceSet = Boolean(semesterPreferenceSet);
      if (history !== undefined) student.history = history;
      if (tasks !== undefined) student.tasks = tasks;

      if (semesters !== undefined) {
        student.semesters = semesters;
        student.markModified('semesters');
      }

      if (examConfig !== undefined) {
        student.examConfig = examConfig;
        student.markModified('examConfig');
      }

      if (timetable !== undefined) {
        student.timetable = timetable;
        student.markModified('timetable');
      }

      if (trackerConfig !== undefined) {
        student.trackerConfig = trackerConfig;
        student.markModified('trackerConfig');
      }

      await student.save();
      return res.status(200).json({ success: true, message: 'Data auto-saved successfully.', student: sanitizeStudent(student) });
    }

    return res.status(405).json({ success: false, message: 'Method Not Allowed' });

  } catch (error) {
    console.error('Student API error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error.' });
  }
};
