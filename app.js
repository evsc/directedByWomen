const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config(); // Ensure this is included to load .env variables

const ISO6391 = require('iso-639-1');
const customLanguageMap = {
  'cn': 'Chinese',
  'sh': 'Serbo-Croatian',
  // Add any other custom codes here
};
function getLanguageName(code) {
  return ISO6391.getName(code) || customLanguageMap[code] || 'Unknown';
}

const Movie = require('./models/Movie');
const Actor = require('./models/Actor');
const Director = require('./models/Director');
const { updateActor, loopPopularityPage, loopActorUpdates, updateMovie, updateDirector } = require('./fetchData')

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
  const { time = '10', gender = 'all', revenue = '1000000', popularity = 'all', movies = '10', top5billing = '5', topLanguage='all' } = req.query;

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

    if (topLanguage !== 'all') {
      if(topLanguage == 'not-en') {
        filterCriteria.topLanguage = { $ne: 'en' };
      } else {
        filterCriteria.topLanguage = topLanguage;
      }
    }

    // Fetch distinct languages and remove empty strings
    const allLanguages = (await Actor.distinct("topLanguage"))
      .filter(language => language !== null && language.trim() !== "");
    // const languageNames = allLanguages.map(code => ISO6391.getName(code) || code);
    const languageNames = allLanguages.map(code => getLanguageName(code));


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
    res.render('index', { actors: actorsData, time, gender, revenue, popularity, movies, top5billing, topLanguage, allLanguages, languageNames });
  } catch (err) {
    console.error('Error fetching actors:', err);
    res.status(500).send('Internal server error');
  }
});


// Define the main route
app.get('/shame', async (req, res) => {

  try {
    // Build the query to fetch actors
    let filterCriteria = { known_for_department: 'Acting' };
    filterCriteria.revenue = { $gte: 5000000000 };
    filterCriteria.movies_total = { $gte: 25 };
    filterCriteria.top5billing = { $gte: 20 };
    filterCriteria.popularity = { $gte: 10 };
    filterCriteria.cnt_all = 0;
    const today = new Date(); 
    filterCriteria.deathday = null;

    // Determine the count and list field based on the 'time' filter
    // let countField = 'cnt_all';
    // let listField = 'list_all';

    // Fetch actors sorted by their total revenue
    const actors = await Actor.find(filterCriteria)
      .sort({ revenue: -1 })
      // .limit(100); // Limit the result to the top 10 actors

    // Prepare the result to send to the view
    const actorsData = actors.map(actor => ({
      name: actor.name,
      id: actor.id,
      file_path: actor.file_path,
      movies: actor.movies_total,
      count: 0,  // Get the count based on the time filter
      // list: actor[listField]      // Get the list based on the time filter
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
      if(topLanguageFilter == 'not-en') {
        filterCriteria.topLanguage = { $ne: 'en' };
      } else {
        filterCriteria.topLanguage = topLanguageFilter;
      }
    }

    // Fetch actors with pagination, sorting, and filtering
    const actors = await Actor.find(filterCriteria)
      .sort({ [sortField]: sortOrder === 'desc' ? -1 : 1 }) // Sort dynamically based on query params
      .skip(skip)
      .limit(limit);

    // Fetch distinct languages and remove empty strings
    const allLanguages = (await Actor.distinct("topLanguage"))
      .filter(language => language !== null && language.trim() !== "");
    const languageNames = allLanguages.map(code => getLanguageName(code));

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
      allLanguages,
      languageNames
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
    const [actorsTotal, actorsUpdated, actorsWithoutRevenue, 
    actorsWithoutTop5Billing, actorsWithoutBirthday, actorsWithoutLanguage,
    actorsFemale, actorsMale, actorsNonBinary] = await Promise.all([
      Actor.countDocuments(),
      Actor.countDocuments({ updatedAt: { $gte: oneWeekAgo } }),
      Actor.countDocuments({ $or: [{ revenue: { $exists: false } }, { revenue: null }, { revenue: "" }] }), 
      Actor.countDocuments({ top5billing: { $exists: false } }), // Count missing top5billing
      Actor.countDocuments({ birthday: { $exists: false } }), 
      Actor.countDocuments({ topLanguage: { $exists: false } }), 
      Actor.countDocuments({ gender: 1 }), 
      Actor.countDocuments({ gender: 2 }), 
      Actor.countDocuments({ gender: 3 }), 
    ]);

    const [moviesTotal, moviesUpdated, moviesNoRevenue, moviesZeroRevenue, moviesNoLanguage] = await Promise.all([
      Movie.countDocuments(),
      Movie.countDocuments({ updated: { $gte: oneWeekAgo } }),
      Movie.countDocuments({ $or: [{ revenue: { $exists: false } }, { revenue: null }, { revenue: "" }] }),
      Movie.countDocuments({ revenue: 0 }),
      Movie.countDocuments({ $or: [{ original_language: { $exists: false } }, { original_language: null }, { original_language: "" }] }),
    ]);

    const [directorsTotal, directorsUpdated,
    directorsFemale, directorsMale, directorsNonBinary, directorsZero] = await Promise.all([
      Director.countDocuments(),
      Director.countDocuments({ updated: { $gte: oneWeekAgo } }),
      Director.countDocuments({ gender: 1 }), 
      Director.countDocuments({ gender: 2 }), 
      Director.countDocuments({ gender: 3 }), 
      Director.countDocuments({ gender: 0 }), 
    ]);

    // Pass the data to the stats view
    res.render('stats', {
      stats: [
        { name: 'Actors', total: actorsTotal, updated: actorsUpdated, noRevenue: actorsWithoutRevenue, noTop5Billing: actorsWithoutTop5Billing, noBirthday: actorsWithoutBirthday, noLanguage: actorsWithoutLanguage, female: actorsFemale, male: actorsMale, nonbinary: actorsNonBinary },
        { name: 'Movies', total: moviesTotal, updated: moviesUpdated, noRevenue: moviesNoRevenue, zeroRevenue: moviesZeroRevenue, noLanguage: moviesNoLanguage },
        { name: 'Directors', total: directorsTotal, updated: directorsUpdated, female: directorsFemale, male: directorsMale, nonbinary: directorsNonBinary, zero: directorsZero },
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



async function updateSpecifics() {
  try {

    ////////////////// UPDATE MOVIE LANGUAGES //////////////////
    // const moviesWithoutLanguage = await Movie.find({ original_language: { $exists: false } }).sort({ runtime: -1 }).limit(10000);
    // console.log(`Found ${moviesWithoutLanguage.length} movies without original_language defined.`);

    // // Loop over each movie and call updateMovie on it
    // for (const movie of moviesWithoutLanguage) {
    //   const updatedMovie = await updateMovie(movie.id); // Pass the movie's ID to updateMovie
    //   console.log(`Updated language for ${updatedMovie.title} to ${updatedMovie.original_language}`);
    // }

    ////////////////// UPDATE DIRECTOR GENDERS //////////////////
  //   const directorsWithoutGender = await Director.find({ $or: [
  //   { gender: { $exists: false } }, // Gender field does not exist
  //   { gender: { $nin: [1, 2, 3] } } // Gender field exists but is not 1, 2, or 3
  // ] }).sort({ id: 1 }).limit(10);
  //   console.log(`Found ${directorsWithoutGender.length} directors without gender defined.`);

  //   for (const director of directorsWithoutGender) {
  //     console.log(`${director.name} has gender: ${director.gender}`);
  //     // const updatedDirector = await updateDirector(director.id); 
  //     // console.log(`Updated gender for ${updatedDirector.name} to ${updatedDirector.gender}`);
  //   }

    ////////////////// UPDATE ACTOR BILLINGS //////////////////
    // const actorsWithout = await Actor.find({ top5billing: { $exists: false }, known_for_department: 'Acting'}).sort({ id: 1 }).limit(1001);
    const actorsWithout = await Actor.find({ birthday: { $exists: false }, known_for_department: 'Acting'}).sort({ id: 1 }).limit(1001);
    console.log(`Found ${actorsWithout.length} actors without birthday defined.`);

    for (const actor of actorsWithout) {
      // console.log(`${actor.name} has gender: ${director.gender}`);
      const updatedDirector = await updateActor(actor.id,true); 
      // console.log(`Updated gender for ${updatedDirector.name} to ${updatedDirector.gender}`);
    }

    console.log('All updated successfully!');
  } catch (error) {
    console.error('Error updateSpecifics :', error);
  }
}





// Error handling for unknown routes
app.use((req, res) => {
  res.status(404).send('404 - Page not found');
});



// updateSpecifics();
// loopPopularityPage();
// setInterval(loopPopularityPage, 60000);



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


