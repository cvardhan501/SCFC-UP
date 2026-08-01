const connectDB = require('../../lib/mongodb');
const Student = require('../../models/Student');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { usn } = req.query;

  if (!usn) {
    return res.status(400).json({ success: false, message: 'USN is required.' });
  }

  const cleanUsn = usn.trim().toUpperCase();

  try {
    await connectDB();

    // GET /api/student/:usn
    if (req.method === 'GET') {
      const student = await Student.findOne({ usn: cleanUsn });
      if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
      }
      return res.json({ success: true, student });
    }

    // PUT /api/student/:usn
    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? (req.body ? JSON.parse(req.body) : {}) : (req.body || {});
      const { name, theme, currentSemester, semesters, history, tasks, examConfig } = body;

      const student = await Student.findOne({ usn: cleanUsn });
      if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
      }

      if (name) student.name = name.trim();
      if (theme) student.theme = theme;
      if (currentSemester) student.currentSemester = currentSemester;
      if (semesters) {
        student.semesters = semesters;
        student.markModified('semesters');
      }
      if (history) student.history = history;
      if (tasks) student.tasks = tasks;
      if (examConfig) student.examConfig = examConfig;

      await student.save();
      return res.json({ success: true, message: 'Data auto-saved successfully.' });
    }

    return res.status(405).json({ success: false, message: 'Method Not Allowed' });

  } catch (error) {
    console.error('Student API error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error.' });
  }
};
