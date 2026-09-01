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

  try {
    await connectDB();

    const { token } = req.query || {};

    if (!token) {
      return res.redirect('/?emailVerified=false');
    }

    const student = await Student.findOne({ emailVerificationToken: token });

    if (!student) {
      return res.redirect('/?emailVerified=false');
    }

    student.emailVerified = true;
    student.emailVerificationToken = undefined;

    student.history.unshift({
      timestamp: new Date().toLocaleString('en-IN'),
      text: `Email address verified: ${student.email}`
    });

    await student.save();

    console.log(`Email verified for student: ${student.usn}`);

    return res.redirect('/?emailVerified=true');
  } catch (error) {
    console.error('Verify email Vercel API error:', error);
    return res.redirect('/?emailVerified=false');
  }
};
