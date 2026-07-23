const mongoose = require('mongoose');

const CourseSchema = new mongoose.Schema({
  code: { type: String, required: true },
  name: { type: String, required: true },
  credits: { type: Number, required: true },
  grade: { type: String, required: true, default: 'S' }
}, { _id: false });

const HistorySchema = new mongoose.Schema({
  timestamp: { type: String, required: true },
  text: { type: String, required: true }
}, { _id: false });

const TaskSchema = new mongoose.Schema({
  text: { type: String, required: true },
  done: { type: Boolean, default: false },
  date: { type: String, default: '' }
}, { _id: false });

const StudentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  usn: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  // Store hashed password; never return by default
  password: {
    type: String,
    required: false,
    select: false
  },
  theme: {
    type: String,
    default: 'light'
  },
  currentSemester: {
    type: Number,
    default: 1
  },
  // Use a flexible structure to preserve existing frontend expectations
  semesters: {
    type: mongoose.Schema.Types.Mixed,
    default: {
      "1": [], "2": [], "3": [], "4": [],
      "5": [], "6": [], "7": [], "8": []
    }
  },
  history: {
    type: [HistorySchema],
    default: []
  },
  tasks: {
    type: [TaskSchema],
    default: []
  }
}, {
  timestamps: true,
  minimize: false
});

module.exports = mongoose.models.Student || mongoose.model('Student', StudentSchema);
