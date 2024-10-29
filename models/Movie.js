// models/Movie.js
const mongoose = require('mongoose');

const movieSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  title: { type: String, required: true },
  original_title: String,
  release_date: { type: Date },
  original_language: String,
  runtime: Number,
  budget: Number,
  revenue: Number,
  status: String,
  imdb_id: String,
  isDocumentary: Boolean,
  updated: { type: Date, default: Date.now }, // Last time the data was updated
  director_gender: { type: Number }, // Use 1 for Female, 2 for Male
  director: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Director' }], // Array of director IDs
  lead_top5: [ Number ],
});

module.exports = mongoose.model('Movie', movieSchema);