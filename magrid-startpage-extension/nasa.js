const apiKey = "onhyF1p6RqQ7bzpVUPcaIzfL2zorx0hkJXMaYcFu"; // Replace with your own key
const apiUrl = `https://api.nasa.gov/planetary/apod?api_key=${apiKey}`;

fetch(apiUrl)
  .then((response) => response.json())
  .then((data) => {
    if (data.media_type === "image") {
      const img = document.getElementById("nasa-img");
      img.src = data.url;
      img.alt = data.title;
    } else {
      const img = document.getElementById("nasa-img");
      img.src = "fallback.jpg";
      img.alt = "NASA video of the day (not shown)";
    }
  })
  .catch((error) => {
    console.error("Error fetching NASA APOD:", error);
  });
