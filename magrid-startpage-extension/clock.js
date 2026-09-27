// Reads the hour format from the settings menu, falling back to the browser
// locale when it is set to "auto".

function clockHourOptions() {
    switch (Settings.get().widgets.clock.hourFormat) {
        case "12":
            return { hour: "2-digit", hour12: true };
        case "24":
            return { hour: "2-digit", hour12: false };
        default:
            return { hour: "2-digit" };
    }
}

function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], {
        ...clockHourOptions(),
        minute: "2-digit",
    });
    const dateStr = now.toLocaleDateString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
    });

    document.getElementById("time").textContent = timeStr;
    document.getElementById("date").textContent = dateStr;
}

function updateClockVisibility() {
    const widget = document.getElementById("clock-widget");
    widget.hidden = !Settings.get().widgets.clock.enabled;
}

Settings.ready.then(() => {
    updateClockVisibility();
    updateClock();
    setInterval(updateClock, 1000);
});

// Repaint when the format or visibility changes.
Settings.subscribe(() => {
    updateClockVisibility();
    updateClock();
});
