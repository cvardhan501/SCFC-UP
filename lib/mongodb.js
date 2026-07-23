const mongoose = require('mongoose');

// Ensure environment variables are loaded before reading process.env
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable is not configured.');
  process.exit(1);
}

// Cache the connection to reuse across serverless function invocations
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      // Use unified topology and modern parser by default
      useNewUrlParser: true,
      useUnifiedTopology: true
    };
    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      console.log('✅ Connected to MongoDB Atlas');
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    console.error('MongoDB connection error:');
    console.error(e);
    process.exit(1);
  }

  return cached.conn;
}

module.exports = connectDB;
