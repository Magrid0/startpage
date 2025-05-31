const weatherApiKey = "4ffb38f99cbe1031fe02399b57be27f2"; // Replace this
const cityId = 3164778; // Valmontone, RM

function updateWeatherWidget() {
  const url = `https://api.openweathermap.org/data/2.5/weather?id=${cityId}&appid=${weatherApiKey}&units=metric`;

  fetch(url)
    .then((res) => res.json())
    .then((data) => {
      const location = data.name;
      const temp = Math.round(data.main.temp);
      const description = data.weather[0].description;

      document.getElementById("weather-location").textContent = `${location}`;
      document.getElementById("weather-temp").textContent =
        `${temp}°C - ${description}`;
    })
    .catch((err) => {
      document.getElementById("weather-location").textContent =
        "Weather unavailable";
      console.error("Weather error:", err);
    });
}

updateWeatherWidget();
