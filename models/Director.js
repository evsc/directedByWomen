// models/Director.js
const mongoose = require('mongoose');

const directorSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  name: String,
  original_name: String,
  gender: Number,
  known_for_department: String,
  updated: { type: Date, default: Date.now }, // Last time the data was updated
});

module.exports = mongoose.model('Director', directorSchema);