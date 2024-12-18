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

let updateThreshold = 5;  // days
let currentPage = 309;
let currentActor = 380;





async function loopActorUpdates() {
  console.log(`Request actor ${currentActor}.`);
  try {
    updateActor(currentActor,true);
  }
  catch (error) {
    console.error('Error polling TMDB:', error);
  }
  currentActor++;
}



async function loopPopularityPage() {
    console.log(`>>>>>>>>>>>>>> Request popularity page ${currentPage}.`);

    try {
        // Fetch the popular actors from TMDB
        const response = await axios.get(`https://api.themoviedb.org/3/person/popular?api_key=${API_KEY}&language=en-US&page=${currentPage}`);
        const actors = response.data.results;

        // Filter actors based on known_for_department
        const filteredActors = actors.filter(actor => actor.known_for_department === 'Acting');

        for (const actor of filteredActors) {
            updateActor(actor.id,true);
            // Wait for 1 second before processing the next actor
            await delay(1000);
        }
        // Increment the page count for the next API call
        currentPage++;
        if(currentPage>500) currentPage = 1;
    } catch (error) {
        console.error('Error on loopPopularityPage:', error);
    }
}


async function updateActor(actorId, forceUpdate) {
  // console.log(`updateActor(${actorId})`)
  // Check if actor exists in the database
  const existingActor = await Actor.findOne({ id: actorId });
  const now = new Date();
  const updateComparison = new Date(now.setDate(now.getDate() - updateThreshold));

  if(!forceUpdate && existingActor && existingActor.updated >= updateComparison) {
    // console.log(`Actor ${existingActor.name} already recently updated.`);
        return;
  }

  // if (!existingActor) {
  //   console.log(`Actor not found in DB.`);
  // }

  try {
    const { data: actorData } = await axios.get(`https://api.themoviedb.org/3/person/${actorId}?api_key=${API_KEY}&language=en-US&append_to_response=images,movie_credits`);

    // Check if the response indicates success
    if (actorData.hasOwnProperty('success') && !actorData.success) {
        console.error(`Error fetching actor details: ${actorData.status_message || 'Unknown error'}`);
        return; // End the function if the response is invalid
    }

    // console.log(`API call for (${actorData.name})`);

    if (actorData.known_for_department !== 'Acting') {
      console.log("Not an actor");
      return;
    }

    // Set the file_path to the first profile image if it exists
    const actorImagePath = actorData.images.profiles.length > 0 ? actorData.images.profiles[0].file_path : null;

    const actor = await Actor.findOneAndUpdate(
        { id: actorData.id },
        {
            id: actorData.id,
            name: actorData.name,
            original_name: actorData.original_name,
            birthday: actorData.birthday,
            deathday: actorData.deathday,
            gender: actorData.gender,
            known_for_department: actorData.known_for_department,
            popularity: actorData.popularity,
            revenue: 0,
            file_path: actorImagePath,
            updated: new Date(),
            movies: [],
            cnt_all: 0,
            cnt_last5: 0,
            cnt_last10: 0,
            cnt_last20: 0,
            movies_total: 0,
            list_all: [],
            list_last5: [],
            list_last10: [],
            list_last20: [],
            directedByWomenPercentage: 0,
            top5billing: 0,
            topLanguage: '',
        },
        { upsert: true, new: true }
    );

    const currentYear = new Date().getFullYear();


    // GO OVER ACTOR MOVIES

    // Filter out movies that have the "adult" value set to true
    // const filteredMovies = actorData.movie_credits.cast.filter(movie => !movie.adult);
    // Filter out movies that have the "adult" value set to true or where the character includes "(voice)"
    const filteredMovies = actorData.movie_credits.cast.filter(movie => !movie.adult && !movie.character.includes('(voice)'));

    const sortedMovies = filteredMovies.sort((a, b) => {
      const dateA = new Date(a.release_date);
      const dateB = new Date(b.release_date);
      // Handle invalid or missing dates
      if (isNaN(dateA)) return 1;  
      if (isNaN(dateB)) return -1; 
      // Sort in descending order (newest first)
      return dateB - dateA;
    });

    const allLanguages = [];

    for (const movie of sortedMovies) {
      const updatedMovie = await updateMovie(movie.id,false);

      // exclude movies 
      if(updatedMovie.release_date && updatedMovie.status == "Released" && updatedMovie.director.length < 4 && !updatedMovie.isDocumentary && updatedMovie.runtime > 40 && updatedMovie.imdb_id) {

        // Add movie ID to actor's movie list if not already present
        if (!actor.movies.includes(updatedMovie._id)) { 
          actor.movies.push(updatedMovie._id);
          allLanguages.push(updatedMovie.original_language);
        }
        actor.revenue += updatedMovie.revenue;

        if (updatedMovie.lead_top5.includes(actor.id)) { 
          actor.top5billing++;
        }

        // female movies only
        if(updatedMovie.director_gender == 1) {
          const releaseYear = updatedMovie.release_date.getFullYear();

          // Fetch the actual director names from the Director collection using the director IDs
          const directorEntries = await Director.find({ _id: { $in: updatedMovie.director } }, 'name');
          // Create a string with the director names, joining multiple names with a comma
          const directorNameString = directorEntries.map(director => director.name).join(', ');

          actor.cnt_all++; 
          actor.list_all.push(`${updatedMovie.title} by ${directorNameString}, ${releaseYear}`);
          if (releaseYear >= currentYear-5) {
            actor.cnt_last5++; 
            actor.list_last5.push(`${updatedMovie.title} by ${directorNameString}, ${releaseYear}`);
          }
          if (releaseYear >= currentYear-10) {
            actor.cnt_last10++; 
            actor.list_last10.push(`${updatedMovie.title} by ${directorNameString}, ${releaseYear}`);
          }
          if (releaseYear >= currentYear-20) {
            actor.cnt_last20++; 
            actor.list_last20.push(`${updatedMovie.title} by ${directorNameString}, ${releaseYear}`);
          }
        }

      }

    }

    // Save the actor with updated movie information
    actor.topLanguage = getMostFrequentLanguage(allLanguages);
    actor.directedByWomenPercentage = actor.movies.length > 0 ? actor.cnt_all / actor.movies.length : 0;
    actor.movies_total = actor.movies.length;
    await actor.save();

    if(!existingActor) console.log(`\tNEW ENTRY:::::::::::::::::::> ${actor.name}`)
    // console.log(`Actor ${actor.name}'s movies and directors updated successfully.`);

  } catch (err) {
    // console.error('Error fetching actor data.');
    console.error('Error fetching actor data:', err);
  }

}


function getMostFrequentLanguage(allLanguages) {
  // Create an object to store the occurrence count for each language
  const languageCount = {};

  // Count occurrences of each language
  allLanguages.forEach(language => {
    languageCount[language] = (languageCount[language] || 0) + 1;
  });

  // Find the language with the highest count
  let mostFrequentLanguage = null;
  let maxCount = 0;

  for (const [language, count] of Object.entries(languageCount)) {
    if (count > maxCount) {
      mostFrequentLanguage = language;
      maxCount = count;
    }
  }

  return mostFrequentLanguage;
}




async function updateMovie(movieId, forceUpdate) {
  const existingMovie = await Movie.findOne({ id: movieId });
  const now = new Date();
  const updateComparison = new Date(now.setDate(now.getDate() - updateThreshold));

  if(!forceUpdate && existingMovie && existingMovie.updated >= updateComparison) {
    // console.log(`Movie ${existingMovie.title} already recently updated.`);
    return existingMovie;
  }

  // if (!existingMovie) {
  //   console.log(`Movie not found in DB.`);
  // }

  let movieCreditsData = null;

  try {
    const response = await axios.get(`https://api.themoviedb.org/3/movie/${movieId}?api_key=${API_KEY}&language=en-US&append_to_response=credits`);
    movieCreditsData = response.data; 
  } catch (error) {
    if (error.response) {
      // console.error('Error Status:', error.response.status);
      // console.error('Error Data:', error.response.data);
      console.error('Error Message:', error.response.statusText);
    } else if (error.request) {
      console.error('No response received:', error.request);
    } else {
      console.error('Error Message:', error.message);
    }
    return existingMovie;
  }


  const leadTop5Ids = movieCreditsData.credits.cast
    .sort((a, b) => a.order - b.order)   // Sorts by the 'order' field in ascending order
    .slice(0, 5)                         // Selects the top 5 cast members
    .map(castMember => castMember.id);   // Maps only the 'id' of each cast member


  const movieEntry = await Movie.findOneAndUpdate(
      { id: movieId },
      {
          id: movieId,
          title: movieCreditsData.title,
          original_title: movieCreditsData.original_title,
          release_date: movieCreditsData.release_date,
          original_language: movieCreditsData.original_language,
          runtime: movieCreditsData.runtime,
          status: movieCreditsData.status,
          budget: movieCreditsData.budget,
          revenue: movieCreditsData.revenue,
          imdb_id: movieCreditsData.imdb_id,
          isDocumentary: movieCreditsData.genres.some(genre => genre.name === "Documentary"),
          updated: new Date(),
          director_gender: null,
          director: [],
          lead_top5: leadTop5Ids
      },
      { upsert: true, new: true }
  );

  let isFemaleDirector = false;
  if(!movieEntry.isDocumentary) {
    for (const crewMember of movieCreditsData.credits.crew) {
      if (crewMember.job === 'Director') {
        const updatedDirector = await updateDirector(crewMember,false);

        // Initialize as an empty array if it is not
        if (!Array.isArray(movieEntry.director)) {
          movieEntry.director = []; 
        }
        // Add director ID to the movie's director array
        if (!movieEntry.director.includes(updatedDirector._id)) {
          movieEntry.director.push(updatedDirector._id);
        }
        // Check if the director is female
        if (updatedDirector.gender === 1) {
          isFemaleDirector = true;
        }
      }
    }
  }

  // Update the movie's director_gender based on the directors
  movieEntry.director_gender = isFemaleDirector ? 1 : 0;

  // Save the movie entry with updated directors
  await movieEntry.save();
  if (!existingMovie) console.log(`\tNEW MOVIE ENTRY - - - - - - - - - > ${movieEntry.title}`)

  return movieEntry;

}



async function updateDirector(crewMember,forceUpdate) {
  const existingDirector = await Director.findOne({ id: crewMember.id });
  const now = new Date();
  const updateComparison = new Date(now.setDate(now.getDate() - updateThreshold));

  if(!forceUpdate && existingDirector && existingDirector.updated >= updateComparison) {
    // console.log(`Director ${existingDirector.name} already recently updated.`);
        return existingDirector;
  }

  // if (!existingDirector) {
  //   console.log(`Director not found in DB.`);
  // }

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

  if (!existingDirector) console.log(`\tNEW DIRECTOR ENTRY ~~~~~~~~> ${directorEntry.name}`)
  return directorEntry;

}





module.exports = { updateActor, loopPopularityPage, loopActorUpdates, updateMovie, updateDirector };
