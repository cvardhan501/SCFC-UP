const mongoose = require('mongoose');
const dns = require('dns');

// Ensure environment variables are loaded before reading process.env
require('dotenv').config();

// Cache the connection to reuse across serverless function invocations
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

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
    try {
      if (typeof dns.setServers === 'function') {
        dns.setServers(['8.8.8.8', '1.1.1.1']);
      }
      return await dns.promises.resolveSrv(srvName);
    } catch (e2) {
      throw err;
    }
  }
}

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI environment variable is not configured.');
    throw new Error('MONGODB_URI environment variable is not configured.');
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = { bufferCommands: false };
    cached.promise = mongoose.connect(uri, opts)
      .then((m) => {
        console.log('✅ Connected to MongoDB Atlas');
        return m;
      })
      .catch(async (err) => {
        if (uri.startsWith('mongodb+srv://')) {
          try {
            const parsed = new URL(uri.replace('mongodb+srv://', 'mongodb://'));
            const host = parsed.hostname;
            const srvRecords = await resolveAtlasSrv(host);
            const standardUri = buildStandardAtlasUri(uri, srvRecords);
            console.warn('SRV connection failed. Retrying with non-SRV Atlas connection string...');
            return await mongoose.connect(standardUri, opts);
          } catch (fallbackErr) {
            console.error('Non-SRV Atlas fallback connection error:', fallbackErr);
          }
        }
        throw err;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    console.error('MongoDB connection error:', e);
    throw e;
  }

  return cached.conn;
}

module.exports = connectDB;
