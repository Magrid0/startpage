// Reads the hour format from the settings menu, falling back to the browser
// locale when it is set to "auto".

// A new tab is often left open for hours, and the clock used to wake up every
// second to draw the same two strings fifty-nine times out of sixty. It now
// runs just after each minute turns, builds its formatters once, and only
// writes to the page when the text has actually changed.
const timeNode = document.getElementById("time");
const dateNode = document.getElementById("date");

let timeFormat = null;
let dateFormat = null;
let lastFormat = "";
let lastTime = null;
let lastDate = null;
let timer = 0;

/**
 * Builds the formatters for the current hour format, and reports whether this
 * changed them. Building an Intl formatter is the expensive part, and it only
 * needs doing when the hour format setting does.
 */
function buildFormatters() {
    const hourFormat = Settings.get().widgets.clock.hourFormat;
    if (hourFormat === lastFormat) return false;
    lastFormat = hourFormat;

    switch (hourFormat) {
        case "12":
            timeFormat = new Intl.DateTimeFormat([], {
                hour: "2-digit",
                hour12: true,
                minute: "2-digit",
            });
            break;
        case "24":
            timeFormat = new Intl.DateTimeFormat([], {
                hour: "2-digit",
                hour12: false,
                minute: "2-digit",
            });
            break;
        default:
            timeFormat = new Intl.DateTimeFormat([], {
                hour: "2-digit",
                minute: "2-digit",
            });
            break;
    }
    dateFormat = new Intl.DateTimeFormat([], {
        weekday: "short",
        month: "short",
        day: "numeric",
    });
    // A different format makes the text on screen out of date, so the next tick
    // writes both of them whatever they were.
    lastTime = null;
    lastDate = null;
    return true;
}

function updateClock() {
    buildFormatters();
    const now = new Date();

    const time = timeFormat.format(now);
    if (time !== lastTime) {
        lastTime = time;
        timeNode.textContent = time;
    }

    const date = dateFormat.format(now);
    if (date !== lastDate) {
        lastDate = date;
        dateNode.textContent = date;
    }
}

function updateClockVisibility() {
    document.getElementById("clock-widget").hidden = !Settings.get().widgets.clock.enabled;
}

/**
 * Draws the clock now and again just after the next minute turns. The seconds
 * are not shown, so there is nothing to be gained by looking sooner.
 */
function startClock() {
    clearTimeout(timer);
    updateClock();
    const now = new Date();
    timer = setTimeout(
        startClock,
        60000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 20,
    );
}

Settings.ready.then(() => {
    updateClockVisibility();
    startClock();
});

// Repaint when the format or visibility changes. Anything else the settings do
// cannot move the time, so the timer is left alone.
Settings.subscribe(() => {
    updateClockVisibility();
    if (buildFormatters()) updateClock();
});
