// ---------------------------------------------------------------------------
// Type to filter. Start typing (or press /) and the bookmark list narrows to
// what matches, with the matched part highlighted. Escape clears the filter,
// Escape again puts the list back. Nothing is stored: a reload starts whole.
// ---------------------------------------------------------------------------

const Filter = (() => {
    const bar = document.getElementById("bookmark-filter");
    const input = document.getElementById("bookmark-filter-input");
    const counter = document.getElementById("bookmark-filter-count");
    if (!bar || !input || !counter) return {};

    /** The settings menu keeps its open state in the overlay's hidden flag. */
    const settingsOpen = () => !document.getElementById("settings-overlay").hidden;

    /** True when the user is typing somewhere that should keep their keys. */
    function typingElsewhere() {
        const active = document.activeElement;
        if (!active || active === input) return false;
        if (active.isContentEditable === true) return true;
        if (!active.matches("input, textarea, select")) return false;
        // Focus can be left behind in a field that is no longer on screen, such
        // as one inside the closed settings panel. It is not taking keys, so it
        // should not block the filter.
        return active.getClientRects().length > 0;
    }

    /**
     * Redraws one link, wrapping the matched part in a <mark>. Built from text
     * nodes rather than innerHTML, so a title can never become markup.
     */
    function paint(anchor, needle) {
        const label = anchor.dataset.title || "";
        const at = needle ? label.toLowerCase().indexOf(needle) : -1;
        if (at === -1) {
            anchor.textContent = label;
            return;
        }

        const mark = document.createElement("mark");
        mark.textContent = label.slice(at, at + needle.length);
        anchor.textContent = "";
        anchor.append(label.slice(0, at), mark, label.slice(at + needle.length));
    }

    function apply() {
        const needle = input.value.trim().toLowerCase();
        let shown = 0;
        let total = 0;

        for (const category of document.querySelectorAll("#bookmarks .category")) {
            let visibleHere = 0;

            for (const anchor of category.querySelectorAll(".links a")) {
                total++;
                const haystack = `${anchor.dataset.title} ${anchor.dataset.url}`.toLowerCase();
                const hit = !needle || haystack.includes(needle);
                // The anchor's parent <li> is the row, the category is the box.
                anchor.parentElement.hidden = !hit;
                paint(anchor, needle);
                if (hit) visibleHere++;
            }

            // A category with nothing left in it is just noise while filtering.
            category.hidden = needle !== "" && visibleHere === 0;
            shown += visibleHere;
        }

        counter.textContent =
            shown === total
                ? `${total} ${total === 1 ? "bookmark" : "bookmarks"}`
                : `${shown} of ${total}`;
        bar.dataset.empty = shown === 0 ? "true" : "false";
    }

    function focus(append) {
        if (append) input.value += append;
        const end = input.value.length;
        input.focus();
        // Park the caret after what was just typed, or it would be overwritten.
        input.setSelectionRange(end, end);
        apply();
    }

    function open(seed) {
        bar.hidden = false;
        focus(seed);
    }

    function close() {
        bar.hidden = true;
        input.value = "";
        input.blur();
        apply();
    }

    input.addEventListener("input", apply);

    input.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        // Stop the settings menu from also treating this as "close".
        event.preventDefault();
        event.stopPropagation();
        if (input.value) {
            input.value = "";
            apply();
        } else {
            close();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.key === "Escape" || event.key.length !== 1) return;
        // The input is handling this one, and inserting the character itself.
        if (document.activeElement === input) return;
        // Uppercase S opens the settings menu, so it is not a filter character.
        if (event.key === "S") return;
        if (settingsOpen() || typingElsewhere()) return;

        if (event.key === "/") {
            event.preventDefault();
            open("");
            return;
        }

        event.preventDefault();
        // The input was not focused when this key went down, so the character
        // has to be put in by hand.
        open(event.key);
    });

    return { open, close, apply };
})();

window.Filter = Filter;

// The bookmark list is re-rendered from scratch on every change, which drops
// the filter state, so put it back while a filter is live.
Settings.subscribe(() => {
    if (document.getElementById("bookmark-filter-input")?.value) Filter.apply();
});
