// Reads the hour format, the date template and the extra time zones from the
// settings menu. "auto" and an empty date template fall back to the browser
// locale, and an empty zone list is the single local clock that shipped before
// any of this existed.

// A new tab is often left open for hours, and the clock used to wake up every
// second to draw the same two strings fifty-nine times out of sixty. It now
// runs just after each minute turns, builds its formatters once, and only
// writes to the page when the text has actually changed.
const timeNode = document.getElementById("time");
const dateNode = document.getElementById("date");
const clocksNode = document.getElementById("clocks");

let formats = null;
let lastKey = "";
let lastTime = null;
let lastDate = null;
let timer = 0;

// One entry per extra time zone: the small label and the element its time goes
// in. Rebuilt when the zone list changes, then faded-in place by minute.
let zoneRows = [];

/**
 * Builds a fresh set of formatters for the given clock settings. Purely
 * functional: nothing is cached, so the settings menu preview can call it
 * freely without disturbing what the ticking clock has built.
 */
function buildFormats(clock) {
    // A name that is not a real IANA zone would make every Intl call below
    // throw, so each one is probed once and quietly dropped: an imported
    // mistyped zone keeps the rest of the clock whole.
    const validated = (zone) => {
        const name = (zone || "").trim();
        if (!name) return null;
        try {
            new Intl.DateTimeFormat([], { timeZone: name });
            return name;
        } catch {
            return null;
        }
    };

    // One shape of time for the main clock and every extra zone: the locale
    // picks the hour cycle unless a format is chosen, and only the extra
    // clocks carry a timezone.
    const timeFormat = (timeZone) => {
        const options = { hour: "2-digit", minute: "2-digit" };
        if (clock.hourFormat === "12") options.hour12 = true;
        if (clock.hourFormat === "24") options.hour12 = false;
        if (timeZone) options.timeZone = timeZone;
        return new Intl.DateTimeFormat([], options);
    };

    const dateFormat = new Intl.DateTimeFormat([], {
        weekday: "short",
        month: "short",
        day: "numeric",
    });

    const dateTemplate = clock.dateTemplate.trim() || null;
    let dayParts = null;
    let weekdayFmt = null;
    let monthFmt = null;
    if (dateTemplate) {
        dayParts = new Intl.DateTimeFormat([], {
            day: "numeric",
            month: "numeric",
            year: "numeric",
        });
        weekdayFmt = new Intl.DateTimeFormat([], {
            weekday: "short",
        });
        monthFmt = new Intl.DateTimeFormat([], {
            month: "short",
        });
    }

    // Every extra zone gets the same hour format as the main clock.
    const zones = (Array.isArray(clock.zones) ? clock.zones : [])
        .map((entry) => {
            const zone = validated(entry?.zone);
            if (!zone) return null;
            return {
                zone,
                label: (entry?.label || "").trim() || zone,
                fmt: timeFormat(zone),
            };
        })
        .filter(Boolean);

    return {
        timeFormat: timeFormat(""),
        dateFormat,
        dateTemplate,
        dayParts,
        weekdayFmt,
        monthFmt,
        zones,
    };
}

/** Everything the clock reads from the settings, as a stable cache key. */
function clockKey(clock) {
    return JSON.stringify([
        clock.hourFormat,
        clock.dateTemplate,
        clock.zones,
    ]);
}

/**
 * Rebuilds the cached formatters for the current settings, and reports whether
 * that changed them. Building Intl formatters is the expensive part, and it
 * only needs doing when the hour format, date template or zone list does.
 */
function buildFormatters() {
    const clock = Settings.get().widgets.clock;
    const key = clockKey(clock);
    if (key === lastKey) return false;
    lastKey = key;
    formats = buildFormats(clock);

    // A different format makes the text on screen out of date, so the next
    // draw writes everything whatever it was.
    lastTime = null;
    lastDate = null;
    return true;
}

/**
 * The date in the shape of the settings template. {wd} is the short weekday,
 * {mo} the short month name, {d} the day number, {m} the month number and {y}
 * the year; anything that is not a token is kept as written.
 */
function formatDate(date, f) {
    const tokens = {
        wd: f.weekdayFmt.format(date),
        mo: f.monthFmt.format(date),
    };
    for (const part of f.dayParts.formatToParts(date)) {
        if (part.type === "day") tokens.d = part.value;
        else if (part.type === "month") tokens.m = part.value;
        else if (part.type === "year") tokens.y = part.value;
    }
    return f.dateTemplate.replace(/\{(wd|mo|d|m|y)\}/g, (match, token) =>
        token in tokens ? tokens[token] : match,
    );
}

/**
 * The time and the date the clock would show right now with the current
 * settings. The settings menu uses this for its preview line. It builds its
 * own formatters on purpose: it must never consume the cache, or the corner
 * clock would not notice its own settings change.
 */
function clockPreview() {
    const f = buildFormats(Settings.get().widgets.clock);
    const now = new Date();
    return {
        time: f.timeFormat.format(now),
        date: f.dateTemplate ? formatDate(now, f) : f.dateFormat.format(now),
    };
}

/** Puts one small line per extra time zone under the main date. */
function renderClocks() {
    clocksNode.replaceChildren();
    zoneRows = formats.zones.map((zone) => {
        const line = document.createElement("div");
        line.className = "clock-line";

        const label = document.createElement("span");
        label.className = "clock-zone";
        label.textContent = zone.label;

        const time = document.createElement("span");
        time.className = "clock-time";

        line.append(label, time);
        clocksNode.append(line);
        return { zone, time };
    });
    clocksNode.hidden = zoneRows.length === 0;
}

/** Rewrites only the minutes that actually changed. */
function updateClocks() {
    const now = new Date();
    for (const row of zoneRows) {
        const text = row.zone.fmt.format(now);
        if (text !== row.time.textContent) row.time.textContent = text;
    }
}

function updateClock() {
    if (buildFormatters()) renderClocks();
    const now = new Date();

    const time = formats.timeFormat.format(now);
    if (time !== lastTime) {
        lastTime = time;
        timeNode.textContent = time;
    }

    const date = formats.dateTemplate
        ? formatDate(now, formats)
        : formats.dateFormat.format(now);
    if (date !== lastDate) {
        lastDate = date;
        dateNode.textContent = date;
    }

    updateClocks();
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

// Repaint when the settings change: a new timezone clock or date template must
// show up at once, not when the minute happens to turn.
Settings.subscribe(() => {
    updateClockVisibility();
    updateClock();
});