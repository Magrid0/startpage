// OpenWeatherMap widget. The city, the API key and the visibility all come from
// the settings menu; the bundled defaults keep the original behaviour.

function weatherSettings() {
    return Settings.get().widgets.weather;
}

function updateWeatherVisibility() {
    document.getElementById("weather-widget").hidden = !weatherSettings().enabled;
}

/**
 * Returns the coordinates to query. The settings store keeps the coordinates
 * of the last resolved city, so the lookup only happens for a brand new city
 * name (or for the original default, which has no coordinates yet).
 */
async function weatherCoordinates() {
    const { city, lat, lon } = weatherSettings();
    if (lat !== null && lon !== null) return { lat, lon };

    const results = await fetch(
        `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(
            city,
        )}&limit=1&appid=${encodeURIComponent(weatherSettings().apiKey)}`,
    ).then((response) => {
        if (!response.ok) throw new Error(`City lookup failed (${response.status})`);
        return response.json();
    });

    if (!results.length) throw new Error(`No city called "${city}" was found`);

    const match =
        results.find(
            (result) => result.name.toLowerCase() === city.toLowerCase(),
        ) ?? results[0];

    // Remember it so the next page load skips the lookup.
    await Settings.set({
        widgets: {
            weather: { city: match.name, lat: match.lat, lon: match.lon },
        },
    });

    return { lat: match.lat, lon: match.lon };
}

async function updateWeatherWidget() {
    if (!weatherSettings().enabled) return;

    try {
        const { lat, lon } = await weatherCoordinates();
        const { apiKey } = weatherSettings();

        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;

        const data = await fetch(url).then((response) => response.json());

        if (data.cod && data.cod !== 200) {
            throw new Error(data.message || "Weather unavailable");
        }

        const temp = Math.round(data.main.temp);
        const icon = data.weather[0].icon;
        const description = data.weather[0].description;

        document.getElementById("weather-location").textContent = data.name;
        document.getElementById("weather-temp").textContent =
            `${temp}°C - ${description}`;
        document.getElementById("weather-icon").src =
            `https://openweathermap.org/img/wn/${icon}.png`;
        document.getElementById("weather-icon").alt = description;
    } catch (err) {
        document.getElementById("weather-location").textContent =
            "Weather unavailable";
        console.error("Weather error:", err);
    }
}

// Only refetch when something the widget actually depends on changed.
const weatherFingerprint = (state) => JSON.stringify(state.widgets.weather);
let lastWeatherState = "";

Settings.ready.then(() => {
    lastWeatherState = weatherFingerprint(Settings.get());
    updateWeatherVisibility();
    updateWeatherWidget();
});

Settings.subscribe((state) => {
    const fingerprint = weatherFingerprint(state);
    if (fingerprint === lastWeatherState) return;
    lastWeatherState = fingerprint;

    updateWeatherVisibility();
    updateWeatherWidget();
});
