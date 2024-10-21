const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config(); // Ensure this is included to load .env variables


const Actor = require('./models/Actor');
const Director = require('./models/Director');
const { fetchActorCredits, pollTMDB } = require('./fetchData')


const app = express();

// Connect to MongoDB
const mongoUri = process.env.MONGODB_URI;
mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('Connected to MongoDB');
})
.catch((err) => {
  console.error('Error connecting to MongoDB', err);
});

// Set EJS as the view engine
app.set('view engine', 'ejs');

// Set the views directory
app.set('views', path.join(__dirname, 'views'));

// Static files (CSS, images, etc.)
app.use(express.static(path.join(__dirname, 'public')));


// Define the main route
app.get('/', async (req, res) => {
  const { time = 'all', gender = 'all', market = 'world' } = req.query;

  try {
    // Build the query to fetch actors
    let actorQuery = {};

    // console.log(`time: ${time}`);
    // console.log(`gender: ${gender}`);
    // console.log(`market: ${market}`);

    // Filter by gender if provided
    if (gender !== 'all') {
      actorQuery.gender = parseInt(gender);
    }

    // Determine the count and list field based on the 'time' filter
    let countField = 'cnt_all';
    let listField = 'list_all';
    if (time === '5') {
      countField = 'cnt_last5';
      listField = 'list_last5';
    } else if (time === '10') {
      countField = 'cnt_last10';
      listField = 'list_last10';
    } else if (time === '20') {
      countField = 'cnt_last20';
      listField = 'list_last20';
    }

    // Fetch actors sorted by the number of movies directed by women, for the selected time period
    const actors = await Actor.find(actorQuery)
      .sort({ [countField]: -1 }) // Sort by the count of movies in descending order
      .limit(20); // Limit the result to the top 10 actors

    // Prepare the result to send to the view
    const actorsData = actors.map(actor => ({
      name: actor.name,
      file_path: actor.file_path,
      count: actor[countField],  // Get the count based on the time filter
      list: actor[listField]      // Get the list based on the time filter
    }));

    // Render the index page with the actors
    res.render('index', { actors: actorsData, time, gender, market });
  } catch (err) {
    console.error('Error fetching actors:', err);
    res.status(500).send('Internal server error');
  }
});



// Example actor route that renders the 'actor.ejs' view
app.get('/actor/:id', async (req, res) => {
  try {
    const actorId = req.params.id;
    const actor = await Actor.findOne({ id: actorId });

    if (!actor) {
      return res.status(404).send('Actor not found');
    }

    // Render the actor.ejs view and pass the actor data
    res.render('actor', { actor });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Error handling for unknown routes
app.use((req, res) => {
  res.status(404).send('404 - Page not found');
});

// Example to fetch actor credits (test it with an actual actor ID)
// fetchActorCredits(128748); // Replace 123 with a valid TMDB actor ID
// fetchActorCredits(1907997); // Replace 123 with a valid TMDB actor ID
pollTMDB();

// Call pollTMDB every 10 minutes (600,000 milliseconds)
setInterval(pollTMDB, 600000);


// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
//