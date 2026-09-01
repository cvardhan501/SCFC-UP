// Legacy code removed. Active server implementation follows below.
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendPasswordResetEmail, sendVerificationEmail, sendChangeEmailVerification } = require('./lib/email');

// In-memory rate limiting for forgot password requests (cooldown tracking)
const forgotPasswordCooldowns = new Map();

function isRateLimited(key, maxAttempts = 3, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const record = forgotPasswordCooldowns.get(key) || { attempts: 0, firstAttempt: now };

  if (now - record.firstAttempt > windowMs) {
    forgotPasswordCooldowns.set(key, { attempts: 1, firstAttempt: now });
    return false;
  }

  if (record.attempts >= maxAttempts) {
    return true;
  }

  record.attempts += 1;
  forgotPasswordCooldowns.set(key, record);
  return false;
}

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

app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'favicon.svg'));
});

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
// REGISTER ENDPOINT (NOW WITH EMAIL REQUIREMENT)
// ==========================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, usn, email, password, confirmPassword } = req.body;

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

    const initialSemesters = {
      "1": [], "2": [], "3": [], "4": [],
      "5": [], "6": [], "7": [], "8": []
    };

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
    console.log(`Registered new student: ${cleanUsn} (${cleanEmail})`);

    // Send verification email asynchronously via Resend
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

    // If password is not set, require migration
    if (!student.password) {
      return res.json({ success: false, migrationRequired: true, message: 'Your account needs to be secured. Please create a password.' });
    }

    const passwordMatch = await bcrypt.compare(password, student.password || '');
    if (!passwordMatch) {
      return res.status(400).json({ success: false, incorrectPassword: true, message: 'The password you entered is incorrect.' });
    }

    console.log(`User logged in: ${cleanUsn}`);
    const studentObj = student.toObject();
    delete studentObj.password;

    const responsePayload = {
      success: true,
      message: 'Login successful.',
      student: studentObj
    };

    // Flag if existing account lacks a recovery email
    if (!student.email) {
      responsePayload.emailRequired = true;
    }

    return res.json(responsePayload);
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

    if (student.password) {
      return res.status(400).json({ success: false, message: 'Password already set. Please login.' });
    }

    const hashed = await bcrypt.hash(password, 10);
    await Student.updateOne({ usn: cleanUsn }, { $set: { password: hashed } });

    return res.json({ success: true, message: 'Password created successfully.' });
  } catch (error) {
    console.error('Setup password error:', error);
    return res.status(500).json({ success: false, message: 'Server error during password setup.' });
  }
});

// ==========================================
// ADD RECOVERY EMAIL (FOR EXISTING USERS WITHOUT EMAIL)
// ==========================================
app.post('/api/auth/add-recovery-email', async (req, res) => {
  try {
    const { usn, email } = req.body;
    if (!usn || !email) {
      return res.status(400).json({ success: false, message: 'USN and Email Address are required.' });
    }

    const cleanUsn = usn.trim().toUpperCase();
    const cleanEmail = email.trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }

    const existingStudentWithEmail = await Student.findOne({ email: cleanEmail, usn: { $ne: cleanUsn } });
    if (existingStudentWithEmail) {
      return res.status(400).json({ success: false, message: 'This email is already linked to another account.' });
    }

    const student = await Student.findOne({ usn: cleanUsn });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student account not found.' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    student.email = cleanEmail;
    student.emailVerified = false;
    student.emailVerificationToken = verificationToken;
    await student.save();

    console.log(`Added recovery email for existing account ${cleanUsn}: ${cleanEmail}`);

    sendVerificationEmail({
      toEmail: cleanEmail,
      name: student.name,
      usn: student.usn,
      token: verificationToken
    }).catch(err => console.error('Verification email error:', err));

    const updatedObj = student.toObject();
    delete updatedObj.password;

    return res.json({
      success: true,
      message: 'Recovery email updated successfully. A verification email has been sent.',
      student: updatedObj
    });
  } catch (error) {
    console.error('Add recovery email error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update recovery email.' });
  }
});

// ==========================================
// FORGOT PASSWORD ENDPOINT (USN + EMAIL MATCHING)
// ==========================================
app.post('/api/auth/forgot-password', async (req, res) => {
  const genericSuccessMessage = 'If the enrollment number and registered email match an existing SCFC account, a password reset link will be sent.';

  try {
    const { usn, email } = req.body;
    if (!usn || !email) {
      return res.status(400).json({ success: false, message: 'Enrollment number and email address are required.' });
    }

    const cleanUsn = usn.trim().toUpperCase();
    const cleanEmail = email.trim().toLowerCase();

    // Server-side rate limiting per IP / USN
    const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const rateLimitKey = `${clientIp}_${cleanUsn}`;

    if (isRateLimited(rateLimitKey, 3, 15 * 60 * 1000)) {
      return res.status(429).json({
        success: false,
        message: 'Too many reset requests. Please wait 15 minutes before trying again.'
      });
    }

    // REQUIREMENT 6 & 7: Check that BOTH enrollment number AND registered email match the SAME account
    const student = await Student.findOne({ usn: cleanUsn, email: cleanEmail });

    if (student) {
      // Generate cryptographically secure short-lived token (15 mins expiry)
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      student.resetPasswordToken = resetToken;
      student.resetPasswordExpires = resetExpires;
      await student.save();

      console.log(`Generated reset token for ${cleanUsn} (${cleanEmail})`);

      // Send email via Resend to the registered email
      const emailResult = await sendPasswordResetEmail({
        toEmail: student.email,
        name: student.name,
        usn: student.usn,
        token: resetToken
      });

      if (!emailResult.success) {
        console.error(`❌ Failed to send password reset email to ${cleanUsn}:`, emailResult.error);
        return res.status(500).json({
          success: false,
          match: true,
          message: emailResult.error || 'Unable to send reset email right now. Please try again later.'
        });
      }

      return res.json({
        success: true,
        match: true,
        message: 'Password reset link sent successfully! Please check your email inbox.'
      });
    } else {
      console.log(`Forgot password mismatch attempt for USN: ${cleanUsn}, Email: ${cleanEmail}`);
      return res.status(400).json({
        success: false,
        match: false,
        message: 'Invalid details. The enrollment number and registered email do not match any registered account.'
      });
    }
  } catch (error) {
    console.error('Forgot password endpoint error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing reset request.'
    });
  }
});

// ==========================================
// RESET PASSWORD ENDPOINT
// ==========================================
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: 'Password reset token is missing.' });
    }

    if (!password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'New password and confirm password are required.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
    }

    // Retrieve student with matching, unexpired token
    const student = await Student.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() }
    }).select('+resetPasswordToken +resetPasswordExpires +password');

    if (!student) {
      return res.status(400).json({
        success: false,
        expiredOrInvalid: true,
        message: 'This password reset link is invalid or has expired.'
      });
    }

    // Update password hash
    const hashed = await bcrypt.hash(password, 10);
    student.password = hashed;

    // Invalidate reset token (single-use)
    student.resetPasswordToken = undefined;
    student.resetPasswordExpires = undefined;

    await student.save();
    console.log(`Password reset successfully for USN: ${student.usn}`);

    return res.json({
      success: true,
      message: 'Password reset successfully. You can now log in with your new password.'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ success: false, message: 'Server error during password reset.' });
  }
});

// ==========================================
// EMAIL VERIFICATION ENDPOINT
// ==========================================
app.get('/api/auth/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Verification token missing.' });
    }

    const student = await Student.findOne({ emailVerificationToken: token }).select('+emailVerificationToken');
    if (!student) {
      return res.status(400).json({ success: false, message: 'Verification link is invalid or has expired.' });
    }

    student.emailVerified = true;
    student.emailVerificationToken = undefined;
    await student.save();

    console.log(`Email verified for student USN: ${student.usn}`);
    return res.redirect('/?emailVerified=true');
  } catch (error) {
    console.error('Verify email error:', error);
    return res.status(500).json({ success: false, message: 'Failed to verify email.' });
  }
});

// ==========================================
// REQUEST CHANGE EMAIL ADDRESS ENDPOINT
// ==========================================
app.post('/api/auth/change-email-request', async (req, res) => {
  try {
    const { usn, newEmail, confirmNewEmail } = req.body;
    if (!usn || !newEmail || !confirmNewEmail) {
      return res.status(400).json({ success: false, message: 'USN, new email, and confirm new email are required.' });
    }

    const cleanUsn = usn.trim().toUpperCase();
    const cleanNewEmail = newEmail.trim().toLowerCase();
    const cleanConfirm = confirmNewEmail.trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanNewEmail)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }

    if (cleanNewEmail !== cleanConfirm) {
      return res.status(400).json({ success: false, message: 'New email and confirm email do not match.' });
    }

    const student = await Student.findOne({ usn: cleanUsn });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student account not found.' });
    }

    if (student.email && student.email.toLowerCase() === cleanNewEmail) {
      return res.status(400).json({ success: false, message: 'The new email address must be different from your current email.' });
    }

    // Check if new email is already registered to another account
    const existingOther = await Student.findOne({ email: cleanNewEmail, usn: { $ne: cleanUsn } });
    if (existingOther) {
      return res.status(400).json({ success: false, message: 'This email address is already associated with another SCFC account.' });
    }

    // Generate secure verification token (valid 24h)
    const token = crypto.randomBytes(32).toString('hex');
    student.pendingEmail = cleanNewEmail;
    student.pendingEmailToken = token;
    student.pendingEmailExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await student.save();

    await sendChangeEmailVerification({
      toEmail: cleanNewEmail,
      name: student.name,
      usn: student.usn,
      token
    });

    console.log(`Change email verification sent for USN: ${cleanUsn} to ${cleanNewEmail}`);
    return res.json({
      success: true,
      message: `A verification link has been sent to ${cleanNewEmail}. Please check your inbox to confirm the change.`
    });
  } catch (error) {
    console.error('Change email request error:', error);
    return res.status(500).json({ success: false, message: 'Failed to request email change. Please try again.' });
  }
});

// ==========================================
// VERIFY CHANGE EMAIL ADDRESS ENDPOINT
// ==========================================
app.get('/verify-email-change', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).send('<h2>Verification Token Missing</h2><p>Please use the link sent to your email.</p>');
    }

    const student = await Student.findOne({
      pendingEmailToken: token,
      pendingEmailExpires: { $gt: new Date() }
    }).select('+pendingEmailToken +pendingEmailExpires');

    if (!student || !student.pendingEmail) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Invalid or Expired Link</title></head>
        <body style="font-family:sans-serif; background:#0c1024; color:#fff; text-align:center; padding:50px;">
          <h2 style="color:#EF4444;">Verification Link Expired or Invalid</h2>
          <p style="color:#93a0c7;">This email change verification link is invalid or has expired.</p>
          <a href="/" style="color:#6C63FF; font-weight:bold;">Return to SCFC Grade Calculator</a>
        </body>
        </html>
      `);
    }

    student.email = student.pendingEmail;
    student.emailVerified = true;
    student.pendingEmail = undefined;
    student.pendingEmailToken = undefined;
    student.pendingEmailExpires = undefined;

    await student.save();
    console.log(`Successfully verified and updated email to ${student.email} for USN: ${student.usn}`);

    return res.redirect('/?emailChanged=true');
  } catch (error) {
    console.error('Verify email change error:', error);
    return res.status(500).send('<h2>Server Error</h2><p>Failed to verify email change.</p>');
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
    const { name, theme, currentSemester, semesters, history, tasks, examConfig, timetable, trackerConfig } = req.body;

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

const server = app.listen(PORT, () => {
  console.log(`SCFC Grade Calculator server listening on http://localhost:${PORT}`);
  console.log('Database: MongoDB Atlas');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use by another running process.`);
    console.error(`💡 Close the existing node process or run with: npx kill-port 3000`);
    process.exit(1);
  } else {
    throw err;
  }
});