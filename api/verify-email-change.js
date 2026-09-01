const connectDB = require('../lib/mongodb');
const Student = require('../models/Student');

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
      return res.redirect('/?emailChanged=false');
    }

    const student = await Student.findOne({ pendingEmailToken: token });

    if (!student || !student.pendingEmail) {
      return res.redirect('/?emailChanged=false');
    }

    const oldEmail = student.email;
    const newEmail = student.pendingEmail;

    student.email = newEmail;
    student.emailVerified = true;
    student.pendingEmail = undefined;
    student.pendingEmailToken = undefined;

    student.history.unshift({
      timestamp: new Date().toLocaleString('en-IN'),
      text: `Email address changed from ${oldEmail || 'N/A'} to ${newEmail} (Verified)`
    });

    await student.save();

    console.log(`Email changed successfully for ${student.usn}: ${newEmail}`);

    return res.redirect('/?emailChanged=true');
  } catch (error) {
    console.error('Verify email change Vercel API error:', error);
    return res.redirect('/?emailChanged=false');
  }
};
