const axios = require('axios');
const Actor = require('./models/Actor');
const Movie = require('./models/Movie');
const Director = require('./models/Director');

require('dotenv').config(); // Ensure this is included to load .env variables


const API_KEY = process.env.TMDB_API_KEY;


// Delay function to pause execution
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

let currentPage = 9;

async function pollTMDB() {
    console.log(`Request popularity page ${currentPage}.`);

    try {
        // Fetch the popular actors from TMDB
        const response = await axios.get(`https://api.themoviedb.org/3/person/popular?api_key=${API_KEY}&language=en-US&page=${currentPage}`);
        const actors = response.data.results;

        // Filter actors based on known_for_department
        const filteredActors = actors.filter(actor => actor.known_for_department === 'Acting');

        for (const actor of filteredActors) {
            // console.log(`Actor ${actor.name}`);
            const { id, name } = actor;

            // Check if actor exists in the database
            const existingActor = await Actor.findOne({ id: id });

            if (!existingActor) {
               // console.log(`Actor ${actor.name} not found in DB.`);
                // Actor doesn't exist, fetch credits and create new document
                await fetchActorCredits(actor.id);
            } else {
                // Compare with the current date
                const now = new Date();
                const oneWeekAgo = new Date(now.setDate(now.getDate() - 7));

                // if (existingActor.updated < oneWeekAgo) {
                  // console.log(`Actor ${actor.name} hasn't been updated in a while`);
                    //  // Update the actor with new credits
                    await fetchActorCredits(actor.id);
                // } else {
                  // console.log(`Actor ${actor.name} already updated last week.`);
                // }
            }

            // Wait for 1 second before processing the next actor
            await delay(1000);
        }
        // Increment the page count for the next API call
        currentPage++;
    } catch (error) {
        console.error('Error polling TMDB:', error);
    }
}


async function fetchActorCredits(actorId) {
  try {
    // Get actor details, images, and movie credits from TMDB
    const { data: actorData } = await axios.get(`https://api.themoviedb.org/3/person/${actorId}?api_key=${API_KEY}&language=en-US&append_to_response=images,movie_credits`);
    
  // Set the file_path to the first profile image if it exists
    const actorImagePath = actorData.images.profiles.length > 0 ? actorData.images.profiles[0].file_path : null;


    const actor = await Actor.findOneAndUpdate(
      { id: actorData.id },
      {
        id: actorData.id,
        name: actorData.name,
        original_name: actorData.original_name,
        gender: actorData.gender,
        known_for_department: actorData.known_for_department,
        popularity: actorData.popularity,
        revenue: 0,
        file_path: actorImagePath, // Use the first image URL
        updated: new Date(),  // Update timestamp
        movies: [],            // Initialize an empty array for movie IDs
        cnt_all: 0,           // Initialize all-time movie count
        cnt_last5: 0,         // Initialize last 5 years count
        cnt_last10: 0,        // Initialize last 10 years count
        cnt_last20: 0,        // Initialize last 20 years count
        list_all: [],         // Initialize list of all movies
        list_last5: [],       // Initialize last 5 years movie list
        list_last10: [],      // Initialize last 10 years movie list
        list_last20: []       // Initialize last 20 years movie list
      },
      { upsert: true, new: true }
    );

    // console.log(`Actor ${actor.name} found.`);

    const currentYear = new Date().getFullYear();

    // Filter out movies that have the "adult" value set to true
    const filteredMovies = actorData.movie_credits.cast.filter(movie => !movie.adult);

    // Sort movies by release_date in descending order (newest first)
    const sortedMovies = filteredMovies.sort((a, b) => {
      const dateA = new Date(a.release_date);
      const dateB = new Date(b.release_date);

      // Handle invalid or missing dates
      if (isNaN(dateA)) return 1;  // Treat 'a' as older if dateA is invalid
      if (isNaN(dateB)) return -1; // Treat 'b' as older if dateB is invalid
    
      // Sort in descending order (newest first)
      return dateB - dateA;
    });


    // Iterate through the actor's movie credits from the response
    for (const movie of sortedMovies) {

      // console.log(`Movie: ${movie.id}`);

      // Store movie in DB if it doesn't exist
      const movieEntry = await Movie.findOneAndUpdate(
        { id: movie.id },
        {
          id: movie.id,
          title: movie.title,
          original_title: movie.original_title,
          release_date: movie.release_date,
          updated: new Date(), // Update timestamp
          director_gender: null, // Initialize director gender
          director: []          // Initialize array for director IDs
        },
        { upsert: true, new: true }
      );

      // Add movie ID to actor's movie list if not already present
      if (!actor.movies.includes(movieEntry._id)) { // Use movieEntry._id instead
        actor.movies.push(movieEntry._id); // Push the ObjectId of the movie
      }

      // // Get movie credits to find directors
      const { data: movieCreditsData } = await axios.get(`https://api.themoviedb.org/3/movie/${movie.id}?api_key=${API_KEY}&language=en-US&append_to_response=credits`);

      // 
      movieEntry.runtime = movieCreditsData.runtime;
      movieEntry.status = movieCreditsData.status;
      movieEntry.budget = movieCreditsData.budget;
      movieEntry.revenue = movieCreditsData.revenue;
      movieEntry.imdb_id = movieCreditsData.imdb_id;

      // 
      actor.revenue += movieEntry.revenue;

      // Check if the genre array contains "Documentary"
      const isDocumentary = movieCreditsData.genres.some(genre => genre.name === "Documentary");
      const onIMDB = 
      movieEntry.isDocumentary = isDocumentary;

      let isFemaleDirector = false; // Track if there's any female director
      if(!isDocumentary) {
        for (const crewMember of movieCreditsData.credits.crew) {
          if (crewMember.job === 'Director') {
            // console.log(`Director ${crewMember.name} found.`);

            // Store director in DB if not already present
            const directorEntry = await Director.findOneAndUpdate(
              { id: crewMember.id },
              {
                id: crewMember.id,
                name: crewMember.name,
                original_name: crewMember.original_name,
                gender: crewMember.gender,
                updated: new Date(), // Update timestamp
                known_for_department: crewMember.known_for_department,
              },
              { upsert: true, new: true }
            );


            // Ensure movieEntry.director is an array before checking
            if (!Array.isArray(movieEntry.director)) {
              movieEntry.director = []; // Initialize as an empty array if it is not
            }
            // Add director ID to the movie's director array if it's not already present
            if (!movieEntry.director.includes(directorEntry._id)) {
              movieEntry.director.push(directorEntry._id);
            }
            
            // Check if the director is female
            if (crewMember.gender === 1) { // 1 = Female
              isFemaleDirector = true;
            }
          }
        }
      }

      // Update the movie's director_gender based on the directors
      movieEntry.director_gender = isFemaleDirector ? 1 : 0; // Assuming male if not female

      // Save the movie entry with updated directors
      await movieEntry.save();


     // If the movie was directed by a woman: update actor's counts and lists
      if (isFemaleDirector && movieEntry.release_date && movieEntry.status == "Released" && movieEntry.director.length < 4 && !isDocumentary && movieEntry.runtime > 40 && movieEntry.imdb_id) {
        const releaseYear = movieEntry.release_date.getFullYear();

        // Fetch the actual director names from the Director collection using the director IDs
        const directorEntries = await Director.find({ _id: { $in: movieEntry.director } }, 'name');
        // Create a string with the director names, joining multiple names with a comma
        const directorNameString = directorEntries.map(director => director.name).join(', ');


        actor.cnt_all++; 
          actor.list_all.push(`${movieEntry.title} by ${directorNameString}, ${releaseYear}`);
        if (releaseYear >= currentYear-5) {
          actor.cnt_last5++; 
          actor.list_last5.push(`${movieEntry.title} by ${directorNameString}, ${releaseYear}`);
        }
        if (releaseYear >= currentYear-10) {
          actor.cnt_last10++; 
          actor.list_last10.push(`${movieEntry.title} by ${directorNameString}, ${releaseYear}`);
        }
        if (releaseYear >= currentYear-20) {
          actor.cnt_last20++; 
          actor.list_last20.push(`${movieEntry.title} by ${directorNameString}, ${releaseYear}`);
        }
      }
    }

    // Save the actor with updated movie information
    await actor.save();


    console.log(`Actor ${actor.name}'s movies and directors saved successfully.`);
  } catch (err) {
    console.error('Error fetching actor data:', err);
  }
}

module.exports = { fetchActorCredits, pollTMDB };
