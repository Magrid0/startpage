const apiKey = "onhyF1p6RqQ7bzpVUPcaIzfL2zorx0hkJXMaYcFu";
const apiUrl = `https://api.nasa.gov/planetary/apod?api_key=${apiKey}`;

// Function to get today's date in YYYY-MM-DD format
function getTodayDate() {
  const today = new Date();
  return today.toISOString().split("T")[0];
}

// Function to fetch and cache the NASA APOD
function fetchAndCacheAPOD() {
  fetch(apiUrl)
    .then((response) => response.json())
    .then((data) => {
      if (data.media_type === "image") {
        // Cache the data with today's date
        const cacheData = {
          url: data.url,
          title: data.title,
          date: data.date, // NASA provides the date in the response
          cachedDate: getTodayDate(),
        };
        localStorage.setItem("nasaAPOD", JSON.stringify(cacheData));

        // Display the image
        updateImage(data.url, data.title);
      } else {
        updateImage("fallback.jpg", "NASA video of the day (not shown)");
      }
    })
    .catch((error) => {
      console.error("Error fetching NASA APOD:", error);
      // If fetch fails, try to use cached data even if it's from yesterday
      const cachedData = JSON.parse(localStorage.getItem("nasaAPOD"));
      if (cachedData) {
        updateImage(cachedData.url, cachedData.title);
      }
    });
}

function updateImage(src, alt) {
  const img = document.getElementById("nasa-img");
  img.src = src;
  img.alt = alt;
}

// Check if we have cached data and if it's from today
const cachedData = JSON.parse(localStorage.getItem("nasaAPOD"));
const today = getTodayDate();

if (cachedData && cachedData.cachedDate === today) {
  // Use cached data if it's from today
  updateImage(cachedData.url, cachedData.title);

  // Still fetch in the background to update cache if needed
  fetchAndCacheAPOD();
} else {
  // No cached data or data is from previous day - fetch fresh
  fetchAndCacheAPOD();
}
