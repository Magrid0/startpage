// Reads the hour format, the timezone and the date template from the settings
// menu. "auto", an empty timezone and an empty date template fall back to the
// browser locale, which is what the clock showed before any of this existed.

// A new tab is often left open for hours, and the clock used to wake up every
// second to draw the same two strings fifty-nine times out of sixty. It now
// runs just after each minute turns, builds its formatters once, and only
// writes to the page when the text has actually changed.
const timeNode = document.getElementById("time");
const dateNode = document.getElementById("date");

let timeFormat = null;
let dateFormat = null;
let lastFormatKey = "";
let lastTime = null;
let lastDate = null;
let timer = 0;

// Set when the date is drawn from a template instead of Intl, with the two
// formatters it needs, both aware of the chosen timezone.
let dateTemplate = null;
let dayParts = null;
let weekdayFmt = null;
let monthFmt = null;

/**
 * Builds the formatters for the current settings, and reports whether this
 * changed them. Building an Intl formatter is the expensive part, and it only
 * needs doing when the hour format, timezone or date template does.
 */
function buildFormatters() {
    const clock = Settings.get().widgets.clock;
    const key = `${clock.hourFormat}|${clock.timezone}|${clock.dateTemplate}`;
    if (key === lastFormatKey) return false;
    lastFormatKey = key;

    // An unrecognised timezone name would make every Intl call below throw, so
    // it is probed once and quietly dropped: a mistyped name keeps the
    // browser's own time instead of breaking the clock.
    let timeZone = clock.timezone.trim();
    try {
        new Intl.DateTimeFormat([], { timeZone });
    } catch {
        timeZone = "";
    }
    const tzOptions = timeZone ? { timeZone } : {};

    switch (clock.hourFormat) {
        case "12":
            timeFormat = new Intl.DateTimeFormat([], {
                hour: "2-digit",
                hour12: true,
                minute: "2-digit",
                ...tzOptions,
            });
            break;
        case "24":
            timeFormat = new Intl.DateTimeFormat([], {
                hour: "2-digit",
                hour12: false,
                minute: "2-digit",
                ...tzOptions,
            });
            break;
        default:
            timeFormat = new Intl.DateTimeFormat([], {
                hour: "2-digit",
                minute: "2-digit",
                ...tzOptions,
            });
            break;
    }
    dateFormat = new Intl.DateTimeFormat([], {
        weekday: "short",
        month: "short",
        day: "numeric",
        ...tzOptions,
    });

    dateTemplate = clock.dateTemplate.trim() || null;
    if (dateTemplate) {
        dayParts = new Intl.DateTimeFormat([], {
            day: "numeric",
            month: "numeric",
            year: "numeric",
            ...tzOptions,
        });
        weekdayFmt = new Intl.DateTimeFormat([], {
            weekday: "short",
            ...tzOptions,
        });
        monthFmt = new Intl.DateTimeFormat([], {
            month: "short",
            ...tzOptions,
        });
    }

    // A different format makes the text on screen out of date, so the next tick
    // writes both of them whatever they were.
    lastTime = null;
    lastDate = null;
    return true;
}

/**
 * The date in the shape of the settings template. {wd} is the short weekday,
 * {mo} the short month name, {d} the day number, {m} the month number and {y}
 * the year; anything that is not a token is kept as written.
 */
function formatDate(date) {
    const tokens = { wd: weekdayFmt.format(date), mo: monthFmt.format(date) };
    for (const part of dayParts.formatToParts(date)) {
        if (part.type === "day") tokens.d = part.value;
        else if (part.type === "month") tokens.m = part.value;
        else if (part.type === "year") tokens.y = part.value;
    }
    return dateTemplate.replace(/\{(wd|mo|d|m|y)\}/g, (match, token) =>
        token in tokens ? tokens[token] : match,
    );
}

function updateClock() {
    buildFormatters();
    const now = new Date();

    const time = timeFormat.format(now);
    if (time !== lastTime) {
        lastTime = time;
        timeNode.textContent = time;
    }

    const date = dateTemplate ? formatDate(now) : dateFormat.format(now);
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
