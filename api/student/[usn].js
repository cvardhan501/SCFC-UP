const connectDB = require('../../lib/mongodb');
const Student = require('../../models/Student');

module.exports = async function handler(req, res) {
  const { usn } = req.query;

  if (!usn) {
    return res.status(400).json({ message: 'USN is required.' });
  }

  const cleanUsn = usn.trim().toUpperCase();

  try {
    await connectDB();

    // GET /api/student/:usn
    if (req.method === 'GET') {
      const student = await Student.findOne({ usn: cleanUsn });
      if (!student) {
        return res.status(404).json({ message: 'Student not found.' });
      }
      return res.json({ success: true, student });
    }

    // PUT /api/student/:usn
    if (req.method === 'PUT') {
      const { name, theme, currentSemester, semesters, history, tasks } = req.body;

      const student = await Student.findOne({ usn: cleanUsn });
      if (!student) {
        return res.status(404).json({ message: 'Student not found.' });
      }

      if (name) student.name = name.trim();
      if (theme) student.theme = theme;
      if (currentSemester) student.currentSemester = currentSemester;
      if (semesters) student.semesters = semesters;
      if (history) student.history = history;
      if (tasks) student.tasks = tasks;

      await student.save();
      return res.json({ success: true, message: 'Data auto-saved successfully.' });
    }

    return res.status(405).json({ message: 'Method Not Allowed' });

  } catch (error) {
    console.error('Student API error:', error);
    return res.status(500).json({ message: 'Internal Server Error.' });
  }
};
