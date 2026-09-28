// OpenWeatherMap widget. The city, the API key, the forecast mode and the
// visibility all come from the settings menu; the bundled defaults keep the
// original behaviour, and the forecast is off unless it is asked for.

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

    await updateWeatherForecast();
}

// --- opt-in forecast --------------------------------------------------------

function forecastIcon(icon) {
    const img = document.createElement("img");
    img.className = "wf-icon";
    img.src = `https://openweathermap.org/img/wn/${icon}.png`;
    img.alt = "";
    return img;
}

/** One forecast entry: a label, the icon, and the temperature text. */
function forecastCell(label, icon, temp) {
    const cell = document.createElement("span");
    cell.className = "wf-item";
    const name = document.createElement("span");
    name.textContent = label;
    const degrees = document.createElement("span");
    degrees.textContent = temp;
    cell.append(name, icon, degrees);
    return cell;
}

/**
 * The wall-clock instant for a forecast step, i.e. the forecast's UTC instant
 * shifted by the city's timezone offset. Reading its UTC fields then gives the
 * time and date the city itself is on, whatever the browser's own timezone.
 */
function cityClock(dt, timezone) {
    return new Date((dt + timezone) * 1000);
}

const pad = (number) => String(number).padStart(2, "0");

/** The next twelve hours as four three-hour steps: time, icon, temperature. */
function hourForecast(steps, timezone) {
    return steps.slice(0, 4).map((step) => {
        const at = cityClock(step.dt, timezone);
        const label = `${pad(at.getUTCHours())}:00`;
        return forecastCell(label, forecastIcon(step.weather[0].icon), `${Math.round(step.main.temp)}°`);
    });
}

/** The next three calendar days: weekday, icon, low over high. */
function dayForecast(steps, timezone) {
    const days = [];
    for (const step of steps) {
        const at = cityClock(step.dt, timezone);
        const key = `${at.getUTCFullYear()}-${at.getUTCMonth() + 1}-${at.getUTCDate()}`;
        // A row for the city's local calendar day, which starts at UTC midnight
        // of the shifted instant and so is simply the shifted date string.
        const day = days[days.length - 1];
        if (day && day.key === key) day.steps.push(step);
        else days.push({ key, steps: [step] });
    }

    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return days.slice(0, 3).map((day) => {
        const first = cityClock(day.steps[0].dt, timezone);
        const lows = day.steps.map((step) => step.main.temp_min);
        const highs = day.steps.map((step) => step.main.temp_max);
        // The icon near the middle of the day says the most about it.
        const icon = day.steps[Math.floor(day.steps.length / 2)].weather[0].icon;
        const label = names[first.getUTCDay()];
        const temp = `${Math.round(Math.min(...lows))}°/${Math.round(Math.max(...highs))}°`;
        return forecastCell(label, forecastIcon(icon), temp);
    });
}

/**
 * Draws the opt-in forecast under the current weather. "off" (the default)
 * does nothing at all, so a tab that never asks for it never calls the
 * forecast API. Errors just hide the row; they must not disturb the current
 * conditions already on screen.
 */
async function updateWeatherForecast() {
    const mode = weatherSettings().forecast;
    const host = document.getElementById("weather-forecast");
    if (!host) return;

    if (mode === "off") {
        host.hidden = true;
        host.replaceChildren();
        return;
    }

    try {
        const { lat, lon } = await weatherCoordinates();
        const { apiKey } = weatherSettings();
        const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
        const data = await fetch(url).then((response) => response.json());
        if (data.cod && data.cod !== "200") throw new Error("Forecast unavailable");
        // The setting may have moved on while the request was out; a stale
        // answer must not re-draw a row the user just turned off.
        if (weatherSettings().forecast !== mode) return;

        const steps = data.list ?? [];
        const timezone = data.city?.timezone ?? 0;
        const cells = mode === "hours" ? hourForecast(steps, timezone) : dayForecast(steps, timezone);
        host.replaceChildren(...cells);
        host.hidden = false;
    } catch (err) {
        console.warn("Forecast error:", err);
        host.hidden = true;
        host.replaceChildren();
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