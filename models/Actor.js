// models/Actor.js
const mongoose = require('mongoose');

const actorSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  original_name: String,
  gender: { type: Number, required: true }, // Use 1 for Female, 2 for Male
  known_for_department: String,
  popularity: Number,
  revenue: Number,
  file_path: { type: String }, // Path to actor's image
  updated: { type: Date, default: Date.now }, // Last time the data was updated
  cnt_last5: { type: Number, default: 0 }, // Count of movies in the last 5 years
  cnt_last10: { type: Number, default: 0 }, // Count of movies in the last 10 years
  cnt_last20: { type: Number, default: 0 }, // Count of movies in the last 20 years
  cnt_all: { type: Number, default: 0 }, // Count of movies all time
  movies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Movie' }], // Array of movie IDs
  list_last5: [{ type: String }], // Array of strings for last 5 years movies (title, director, year)
  list_last10: [{ type: String }], // Array of strings for last 10 years movies (title, director, year)
  list_last20: [{ type: String }], // Array of strings for last 20 years movies (title, director, year)
  list_all: [{ type: String }], // Array of strings for all time movies (title, director, year)
});

module.exports = mongoose.model('Actor', actorSchema);