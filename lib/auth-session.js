/* =========================================================
   SCFC StudentOS - Session & Token Security Engine
   ========================================================= */

const crypto = require('crypto');

// Fallback secret for session token signing if env variable is not provided
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET || 'scfc_studentos_secure_session_secret_2026_key';

/**
 * Create a cryptographically signed session token for a student USN.
 * Valid for 30 days.
 */
function createSessionToken(usn) {
  if (!usn) return null;
  const cleanUsn = String(usn).trim().toUpperCase();
  const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
  const payload = `${cleanUsn}:${expiresAt}`;
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  const token = Buffer.from(`${payload}:${signature}`).toString('base64url');
  return token;
}

/**
 * Verify session token and return the authenticated USN if signature and expiration are valid.
 */
function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 3) return null;

    const [usn, expiresAtStr, signature] = parts;
    const expiresAt = parseInt(expiresAtStr, 10);

    if (isNaN(expiresAt) || Date.now() > expiresAt) {
      return null;
    }

    const payload = `${usn}:${expiresAtStr}`;
    const expectedSignature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');

    const signatureBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    if (signatureBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return usn.toUpperCase();
    }
  } catch (err) {
    return null;
  }
  return null;
}

/**
 * Validate HTTP authorization header against target USN parameter.
 * Returns authorization status payload.
 */
function authorizeStudentAccess(req, targetUsn) {
  const authHeader = req.headers['authorization'] || req.headers['x-session-token'] || req.headers['x-access-token'];
  let token = null;

  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else {
      token = authHeader.trim();
    }
  }

  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return {
      authenticated: false,
      authorized: false,
      authenticatedUsn: null,
      status: 401,
      message: 'Authentication token required.'
    };
  }

  const authenticatedUsn = verifySessionToken(token);
  if (!authenticatedUsn) {
    return {
      authenticated: false,
      authorized: false,
      authenticatedUsn: null,
      status: 401,
      message: 'Invalid or expired authentication session.'
    };
  }

  const cleanTargetUsn = String(targetUsn || '').trim().toUpperCase();
  if (authenticatedUsn !== cleanTargetUsn) {
    return {
      authenticated: true,
      authorized: false,
      authenticatedUsn: authenticatedUsn,
      status: 403,
      message: 'Access denied: You are not authorized to view or modify this student account.'
    };
  }

  return {
    authenticated: true,
    authorized: true,
    authenticatedUsn: authenticatedUsn,
    status: 200,
    message: 'Authorized'
  };
}

/**
 * Sanitize student object to remove sensitive fields before returning to client.
 */
function sanitizeStudent(studentDoc) {
  if (!studentDoc) return null;
  const obj = typeof studentDoc.toObject === 'function' ? studentDoc.toObject() : { ...studentDoc };
  delete obj.password;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpires;
  delete obj.emailVerificationToken;
  delete obj.pendingEmailToken;
  return obj;
}

module.exports = {
  createSessionToken,
  verifySessionToken,
  authorizeStudentAccess,
  sanitizeStudent
};
