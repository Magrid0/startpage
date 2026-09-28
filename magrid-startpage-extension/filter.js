// ---------------------------------------------------------------------------
// Type to filter. Start typing (or press /) and the bookmark list narrows to
// what matches, with the matched part highlighted. The arrow keys walk the
// matches, Enter follows the one you are standing on (Alt+Enter in a new tab)
// and Escape clears the filter, then puts the list back. Nothing is stored: a
// reload starts whole.
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

    // The rows still visible while filtering, in page order, and which one the
    // arrow keys are standing on. Built fresh by every apply(), because any
    // keystroke can change what is visible.
    let matches = [];
    let activeIndex = -1;

    function setActive(index) {
        if (activeIndex >= 0 && activeIndex < matches.length) {
            matches[activeIndex].classList.remove("is-active");
        }
        activeIndex = index;
        if (index >= 0 && index < matches.length) {
            matches[index].classList.add("is-active");
        }
    }

    /** The bookmark the arrows are on, or the only match when there is one. */
    function currentRow() {
        if (activeIndex >= 0 && activeIndex < matches.length) return matches[activeIndex];
        if (matches.length === 1) return matches[0];
        return null;
    }

    /** Follows a match, in this tab, or in a new one with Alt+Enter. */
    function openRow(row, newTab) {
        const anchor = row.querySelector("a");
        if (!anchor) return;
        if (!newTab) {
            anchor.click();
            return;
        }
        // A plain click() on an existing anchor never opens a new tab, so the
        // address is handed to a throwaway <a target="_blank"> instead.
        const copy = document.createElement("a");
        copy.href = anchor.href;
        copy.target = "_blank";
        copy.rel = "noopener";
        document.body.append(copy);
        copy.click();
        copy.remove();
    }

    function apply() {
        const needle = input.value.trim().toLowerCase();
        let shown = 0;
        let total = 0;
        matches = [];

        for (const category of document.querySelectorAll("#bookmarks .category")) {
            let visibleHere = 0;

            for (const anchor of category.querySelectorAll(".links a")) {
                total++;
                const haystack = `${anchor.dataset.title} ${anchor.dataset.url}`.toLowerCase();
                const hit = !needle || haystack.includes(needle);
                // The anchor's parent <li> is the row, the category is the box.
                anchor.parentElement.hidden = !hit;
                paint(anchor, needle);
                if (hit) {
                    visibleHere++;
                    matches.push(anchor.parentElement);
                }
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
        setActive(-1);
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
        matches = [];
        setActive(-1);
        apply();
    }

    input.addEventListener("input", apply);

    input.addEventListener("keydown", (event) => {
        // The arrows walk the visible matches in page order, wrapping around.
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!matches.length) return;
            const delta = event.key === "ArrowDown" ? 1 : -1;
            setActive((activeIndex + delta + matches.length) % matches.length);
            return;
        }
        // Enter follows the highlighted bookmark, or the only match. Alt+Enter
        // opens it in a new tab. Typing in the filter never navigates on its
        // own, so Enter was previously doing nothing here.
        if (event.key === "Enter") {
            const row = currentRow();
            if (!row) return;
            event.preventDefault();
            openRow(row, event.altKey);
            return;
        }
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

    // Hovering a match also moves the arrow highlight, so the mouse and the
    // keyboard point at the same row and Enter follows whichever is current.
    document.getElementById("bookmarks")?.addEventListener("mouseover", (event) => {
        if (bar.hidden) return;
        const row = event.target.closest("li");
        if (!row) return;
        const index = matches.indexOf(row);
        if (index >= 0) setActive(index);
    });

    return { open, close, apply };
})();

window.Filter = Filter;

// The bookmark list is re-rendered from scratch on every change, which drops
// the filter state, so put it back while a filter is live.
Settings.subscribe(() => {
    if (document.getElementById("bookmark-filter-input")?.value) Filter.apply();
});
