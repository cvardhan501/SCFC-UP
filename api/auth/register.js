const connectDB = require('../../lib/mongodb');
const Student = require('../../models/Student');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendVerificationEmail } = require('../../lib/email');

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
    const { name, usn, email, password, confirmPassword } = body;

    if (!name || !usn || !email || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All fields (Name, USN, Email, Password) are required.' });
    }

    const cleanUsn = usn.trim().toUpperCase();
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    // Validate Email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Password and Confirm Password must match.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    // Check existing USN or Email
    const existingUSN = await Student.findOne({ usn: cleanUsn });
    if (existingUSN) {
      return res.status(400).json({ success: false, message: 'This Enrollment Number (USN) is already registered. Please Login.' });
    }

    const existingEmail = await Student.findOne({ email: cleanEmail });
    if (existingEmail) {
      return res.status(400).json({ success: false, message: 'This email address is already registered to another account.' });
    }

    const initialSemesters = { "1": [], "2": [], "3": [], "4": [], "5": [], "6": [], "7": [], "8": [] };
    const hashed = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const newStudent = new Student({
      name: cleanName,
      usn: cleanUsn,
      email: cleanEmail,
      emailVerified: false,
      emailVerificationToken: verificationToken,
      password: hashed,
      currentSemester: 1,
      theme: 'light',
      semesters: initialSemesters,
      history: [],
      tasks: []
    });

    await newStudent.save();

    // Send verification email asynchronously via Resend if configured
    sendVerificationEmail({
      toEmail: cleanEmail,
      name: cleanName,
      usn: cleanUsn,
      token: verificationToken
    }).catch(err => console.error('Verification email error:', err));

    const studentObj = newStudent.toObject();
    delete studentObj.password;

    return res.status(201).json({
      success: true,
      message: 'Registration successful. A verification email has been sent to your inbox.',
      student: studentObj
    });

  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'This USN or Email is already registered.' });
    }
    return res.status(500).json({ success: false, message: 'Server error during registration. Please try again.' });
  }
};

