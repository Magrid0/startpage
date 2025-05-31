const apiKey = "onhyF1p6RqQ7bzpVUPcaIzfL2zorx0hkJXMaYcFu"; // Replace with your own key
const apiUrl = `https://api.nasa.gov/planetary/apod?api_key=${apiKey}`;
const imgElement = document.getElementById("nasa-img");

function getTodayDateString() {
  return new Date().toISOString().split("T")[0];
}

const cached = JSON.parse(localStorage.getItem("nasaImage")) || {};

if (cached.date === getTodayDateString()) {
  // Use cached image
  imgElement.src = cached.url;
  imgElement.alt = cached.title;
} else {
  // Fetch new image from NASA
  fetch(apiUrl)
    .then((res) => res.json())
    .then((data) => {
      if (data.media_type === "image") {
        imgElement.src = data.url;
        imgElement.alt = data.title;

        // Cache it
        localStorage.setItem(
          "nasaImage",
          JSON.stringify({
            url: data.url,
            title: data.title,
            date: getTodayDateString(),
          }),
        );
      } else {
        imgElement.src = "fallback.jpg";
        imgElement.alt = "NASA video of the day (not shown)";
      }
    })
    .catch((err) => {
      console.error("NASA fetch failed:", err);
      imgElement.src = "fallback.jpg";
      imgElement.alt = "Error loading image";
    });
}
