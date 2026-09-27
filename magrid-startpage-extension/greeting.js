// ---------------------------------------------------------------------------
// Greeting. Both the name and the wording come from the settings menu, so
// neither is hardcoded here: the template may use {greeting} and {name}, and
// dropping {greeting} makes the wording constant.
// ---------------------------------------------------------------------------

// Hour each period starts at, earliest first. Anything before the first entry
// is night.
const GREETING_PERIODS = [
    [5, "Good morning"],
    [12, "Good afternoon"],
    [18, "Good evening"],
    [22, "Good night"],
];

function timeOfDayGreeting(hour) {
    // The last period that has already started, not the first: at 14 the
    // afternoon has begun, even though the morning did too.
    const period = GREETING_PERIODS.findLast(([from]) => hour >= from);
    return period ? period[1] : "Good night";
}

function greetingText(theme, hour = new Date().getHours()) {
    const name = (theme.greetingName || "").trim();
    const text = theme.greetingTemplate
        .replace(/\{greeting\}/g, () => timeOfDayGreeting(hour))
        .replace(/\{name\}/g, name)
        .replace(/\s+/g, " ")
        .trim();

    // Without a name "{greeting}, {name}." would read "Good morning, ."
    if (name) return text;
    return text
        .replace(/[ \t]*[,;:][ \t]*(?=\.)/g, "")
        .replace(/[ \t]*[,;:][ \t]*$/, "")
        .trim();
}

// Remembered so a minute-by-minute tick does not rewrite the same text.
let lastGreeting = null;

function updateGreeting() {
    const node = document.getElementById("greeting");
    if (!node) return;

    const text = greetingText(Settings.get().theme);
    if (text === lastGreeting) return;
    lastGreeting = text;

    node.textContent = text;
    // An empty template is a valid choice, and hides the line and its padding.
    node.hidden = text === "";
}

Settings.ready.then(() => {
    updateGreeting();
    // The time of day rolls over without a reload, so recheck now and then.
    setInterval(updateGreeting, 60000);
});

Settings.subscribe(updateGreeting);

window.Greeting = { text: greetingText, update: updateGreeting };
