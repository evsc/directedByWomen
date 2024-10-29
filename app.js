const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config(); // Ensure this is included to load .env variables

const Movie = require('./models/Movie');
const Actor = require('./models/Actor');
const Director = require('./models/Director');
const { updateActor, loopPopularityPage, loopActorUpdates } = require('./fetchData')

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // Add this line for JSON parsing

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
  const { time = '10', gender = 'all', revenue = '1000000', popularity = 'all', movies = '10', top5billing = '5' } = req.query;

  try {
    // Build the query to fetch actors
    let filterCriteria = { known_for_department: 'Acting' };

    // Filter by gender if provided
    if (gender !== 'all') {
      filterCriteria.gender = parseInt(gender);
    }

    if (revenue !== 'all') {
      filterCriteria.revenue = { $gte: parseInt(revenue) };
    }

    if (popularity !== 'all') {
      filterCriteria.popularity = { $gte: parseInt(popularity) };
    }

    if (movies !== 'all') {
      filterCriteria.movies_total = { $gte: parseInt(movies) };
    }

    if (top5billing !== 'all') {
      filterCriteria.top5billing = { $gte: parseInt(top5billing) };
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
    const actors = await Actor.find(filterCriteria)
      .sort({ [countField]: -1, name: 1 }) // Sort by the count of movies in descending order
      .limit(50); // Limit the result to the top 10 actors

    // Prepare the result to send to the view
    const actorsData = actors.map(actor => ({
      name: actor.name,
      file_path: actor.file_path,
      count: actor[countField],  // Get the count based on the time filter
      list: actor[listField]      // Get the list based on the time filter
    }));

    // Render the index page with the actors
    res.render('index', { actors: actorsData, time, gender, revenue, popularity, movies, top5billing });
  } catch (err) {
    console.error('Error fetching actors:', err);
    res.status(500).send('Internal server error');
  }
});


// Define the main route
app.get('/shame', async (req, res) => {
  const { time = 'all', gender = 'all', revenue = '1000000000', popularity = 'all', movies = '25', top5billing = '20' } = req.query;

  try {
    // Build the query to fetch actors
    let filterCriteria = { known_for_department: 'Acting' };

    // Filter by gender if provided
    if (gender !== 'all') {
      filterCriteria.gender = parseInt(gender);
    }

    if (revenue !== 'all') {
      filterCriteria.revenue = { $gte: parseInt(revenue) };
    }

    if (popularity !== 'all') {
      filterCriteria.popularity = { $gte: parseInt(popularity) };
    }

    if (movies !== 'all') {
      filterCriteria.movies_total = { $gte: parseInt(movies) };
    }

    if (top5billing !== 'all') {
      filterCriteria.top5billing = { $gte: parseInt(top5billing) };
    }

    // Determine the count and list field based on the 'time' filter
    let countField = 'cnt_all';
    let listField = 'list_all';

    // Fetch actors sorted by the number of movies directed by women, for the selected time period
    const actors = await Actor.find(filterCriteria)
      .sort({ [countField]: 1, revenue: -1 }) // Sort by the count of movies in descending order
      .limit(50); // Limit the result to the top 10 actors

    // Prepare the result to send to the view
    const actorsData = actors.map(actor => ({
      name: actor.name,
      file_path: actor.file_path,
      count: actor[countField],  // Get the count based on the time filter
      list: actor[listField]      // Get the list based on the time filter
    }));

    // Render the index page with the actors
    res.render('shame', { actors: actorsData });
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



// Route to fetch all actors with pagination and sorting
app.get('/all', async (req, res) => {
  try {
    // Extract pagination, sorting, and filtering parameters
    const page = parseInt(req.query.page) || 1; // Default to the first page
    const limit = 100; // Number of results per page
    const sortField = req.query.sortField || 'name'; // Default sorting field
    const sortOrder = req.query.sortOrder === 'desc' ? 'desc' : 'asc'; // Ascending or descending
    const genderFilter = req.query.gender || '0'; // Gender filter, defaults to 'all'
    const revenueFilter = req.query.revenue || 'all'; // Revenue filter, defaults to 'all'
    const popularityFilter = req.query.popularity || 'all';
    const moviesTotalFilter = req.query.moviesTotal || 'all';
    const top5billingFilter = req.query.top5billing || 'all';
    const topLanguageFilter = req.query.topLanguage || "all";

    // Calculate the skip value for pagination
    const skip = (page - 1) * limit;

    // Build the filter criteria based on gender
    const filterCriteria = { known_for_department: 'Acting' };

    if (genderFilter !== '0') {
      filterCriteria.gender = genderFilter === '1' ? 1 : genderFilter === '2' ? 2 : 3;
    }

    if (popularityFilter !== 'all') {
      const popularityThreshold = parseInt(popularityFilter);
      filterCriteria.popularity = { $gte: popularityThreshold };
    }

    if (moviesTotalFilter !== 'all') {
      const moviesTotalThreshold = parseInt(moviesTotalFilter);
      filterCriteria.movies_total = { $gte: moviesTotalThreshold };
    }

    if (top5billingFilter !== 'all') {
      const minimumTop5billing = parseInt(top5billingFilter);
      filterCriteria.top5billing = { $gte: minimumTop5billing };
    }

    if (revenueFilter !== 'all') {
      filterCriteria.revenue = { $gte: parseInt(revenueFilter) };
    }
    if (topLanguageFilter !== 'all') {
      filterCriteria.topLanguage = topLanguageFilter;
    }

    // Fetch actors with pagination, sorting, and filtering
    const actors = await Actor.find(filterCriteria)
      .sort({ [sortField]: sortOrder === 'desc' ? -1 : 1 }) // Sort dynamically based on query params
      .skip(skip)
      .limit(limit);

    // Fetch distinct languages and remove empty strings
    const allLanguages = (await Actor.distinct("topLanguage"))
      .filter(language => language !== null && language.trim() !== "");

    // Count total actors for pagination with the applied filter
    const totalActors = await Actor.countDocuments(filterCriteria);

    res.render('all', {
      actors,
      totalActors,
      currentPage: page,
      limit,
      sortField,
      sortOrder,
      genderFilter,
      revenueFilter,
      popularityFilter,
      moviesTotalFilter,
      top5billingFilter,
      topLanguageFilter,
      allLanguages
    });
  } catch (error) {
    console.error('Error fetching actors:', error);
    res.status(500).send('Error fetching actors');
  }
});


// Stats route
app.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const oneWeekAgo = new Date(now.setDate(now.getDate() - 7));

    // Get counts for actors
    const [actorsTotal, actorsUpdated, actorsWithoutRevenue, actorsWithoutTop5Billing, actorsWithoutBirthday, actorsWithoutLanguage] = await Promise.all([
      Actor.countDocuments(),
      Actor.countDocuments({ updatedAt: { $gte: oneWeekAgo } }),
      Actor.countDocuments({ $or: [{ revenue: { $exists: false } }, { revenue: null }, { revenue: "" }] }), // Count missing revenue
      Actor.countDocuments({ top5billing: { $exists: false } }), // Count missing top5billing
      Actor.countDocuments({ birthday: { $exists: false } }), 
      Actor.countDocuments({ topLanguage: { $exists: false } }), 
    ]);

    const [moviesTotal, moviesUpdated] = await Promise.all([
      Movie.countDocuments(),
      Movie.countDocuments({ updated: { $gte: oneWeekAgo } }),
    ]);

    const [directorsTotal, directorsUpdated] = await Promise.all([
      Director.countDocuments(),
      Director.countDocuments({ updated: { $gte: oneWeekAgo } }),
    ]);

    // Pass the data to the stats view
    res.render('stats', {
      stats: [
        { name: 'Actors', total: actorsTotal, updated: actorsUpdated, noRevenue: actorsWithoutRevenue, noTop5Billing: actorsWithoutTop5Billing, noBirthday: actorsWithoutBirthday, noLanguage: actorsWithoutLanguage },
        { name: 'Movies', total: moviesTotal, updated: moviesUpdated },
        { name: 'Directors', total: directorsTotal, updated: directorsUpdated },
      ],
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).send('Error retrieving stats');
  }
});


app.get('/update', (req, res) => {
  res.render('update'); 
});

app.post('/submit-actor-update', async (req, res) => {
  const { actorId } = req.body;

  try {
    await updateActor(actorId, true);
    res.status(200).send(`Performer with ID ${actorId} has been updated successfully. <a href='/actor/${actorId}'>Visit their profile.</a>`);
  } catch (error) {
    console.error('Error updating actor:', error);
    res.status(500).send('Error updating actor');
  }
});



async function updateActorEntries() {
  try {
    // Fetch all actors from the database
    const actors = await Actor.find();

    for (let actor of actors) {
      actor.movies_total = actor.movies.length;
      await actor.save();
    }

    console.log('All actors updated successfully!');
  } catch (error) {
    console.error('Error updating actors:', error);
  }
}





// Error handling for unknown routes
app.use((req, res) => {
  res.status(404).send('404 - Page not found');
});




// loopPopularityPage();
// setInterval(loopPopularityPage, 200000);



// loopActorUpdates();
// setInterval(loopActorUpdates, 40000);
// updateActors();
// updateActor(4095744,true);


// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
//


