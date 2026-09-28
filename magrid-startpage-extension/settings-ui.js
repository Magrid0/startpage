// ---------------------------------------------------------------------------
// Settings menu: wiring for the overlay, the appearance/wallpaper/widget forms,
// the bookmark editor and the backup tools.
//
// Form inputs are bound to a dotted settings path through `data-setting`, so
// adding a new option is a one line change in index.html plus (optionally) a
// matching key in the defaults.
// ---------------------------------------------------------------------------

const SettingsUI = (() => {
    const els = {};
    let selfChange = false;
    let dragPayload = null;
    let dataJsonDirty = false;
    let toastTimer = null;

    // --- helpers -----------------------------------------------------------

    const getByPath = (object, path) =>
        path.split(".").reduce((node, key) => node?.[key], object);

    /** Turns `theme.colorFg` into `{ theme: { colorFg: value } }`. */
    function patchFor(path, value) {
        const patch = {};
        let node = patch;
        const keys = path.split(".");
        keys.forEach((key, index) => {
            if (index === keys.length - 1) node[key] = value;
            else {
                node[key] = {};
                node = node[key];
            }
        });
        return patch;
    }

    /** Runs a settings mutation, reporting failures as a toast. */
    async function mutate(action) {
        selfChange = true;
        try {
            await action();
        } catch (error) {
            toast(error.message || String(error), true);
        } finally {
            selfChange = false;
        }
    }

    const debounce = (fn, wait) => {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), wait);
        };
    };

    /** A plain copy of a settings slice, for an undo to put back. */
    const deepCopy = (value) => JSON.parse(JSON.stringify(value));

    // What each bookmark issue says on the editor row. The kinds come from
    // Bookmarks.issues(); the copy lives here because it is presentation.
    const ISSUE_TEXT = {
        noAddress: "No address yet.",
        noName: "No name — the address will be shown.",
        duplicate: "Same address as another bookmark.",
        empty: "Nothing here yet — it will not show until it has a bookmark.",
    };

    function toast(message, isError = false, undo = null, onExpire = null) {
        clearTimeout(toastTimer);
        // Setting textContent wipes whatever the previous toast left in place,
        // including the Undo button it may have carried.
        els.toast.textContent = message;
        els.toast.classList.toggle("is-error", isError);
        if (undo) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "toast-undo";
            button.textContent = "Undo";
            button.addEventListener("click", () => {
                clearTimeout(toastTimer);
                els.toast.classList.remove("is-visible");
                undo();
            });
            els.toast.append(button);
        }
        els.toast.classList.add("is-visible");
        // An undoable message is worth keeping on screen a moment longer than a
        // plain confirmation, so the button is still there when the eye finds
        // it; a failure gets the longest time, because it is the one that asks
        // to be read twice.
        const duration = isError ? 6000 : undo ? 8000 : 3000;
        toastTimer = setTimeout(() => {
            els.toast.classList.remove("is-visible");
            onExpire?.();
        }, duration);
    }

    /**
     * Runs a deletion that the toast offers to undo. The snapshot is taken
     * before the action, so Undo restores exactly what was there; the sweep of
     * pictures the deletion orphaned waits until the toast window closes, so
     * the undo has the files to point at again. Returns false when the action
     * failed, and the caller's "deleted" message is not shown.
     */
    async function deleteWithUndo(snapshot, message, action, rerender) {
        let ok = false;
        await mutate(async () => {
            try {
                await action();
                ok = true;
            } catch (error) {
                ok = false;
                throw error;
            }
        });
        if (!ok) return false;
        if (rerender) await rerender();
        toast(message, false, () => {
            mutate(() => Settings.applyUndo(snapshot)).then(() => {
                rerender?.();
                toast("Undone.");
            });
        }, () => Settings.flushPending());
        return true;
    }

    function status(message, isError = false) {
        els.dataStatus.textContent = message;
        els.dataStatus.classList.toggle("is-error", isError);
    }

    function formatValue(path, value) {
        if (path === "panel.opacity" || path === "wallpaperDim") {
            return `${Math.round(value * 100)}%`;
        }
        // Zero means "whatever fits", which is worth spelling out rather than
        // showing a bare 0 next to a slider.
        if (path === "layout.columns") return value > 0 ? String(value) : "any";
        if (path === "layout.panelWidth") return value > 0 ? `${value}px` : "fits";
        if (path.startsWith("theme.size") || path.startsWith("layout.")) {
            return `${value}px`;
        }
        if (path === "panel.blur") return `${value}px`;
        return String(value);
    }

    function showOutputs(path, value) {
        const output = document.querySelector(
            `[data-output-for="${path}"]`,
        );
        if (output) output.textContent = formatValue(path, value);
    }

    // --- form binding ------------------------------------------------------

    function fillInputs() {
        for (const input of document.querySelectorAll("[data-setting]")) {
            const path = input.dataset.setting;
            const value = getByPath(Settings.get(), path);
            if (value === undefined) continue;

            // Never fight the user for the caret while they are typing.
            if (input !== document.activeElement) {
                if (input.type === "checkbox") input.checked = Boolean(value);
                else input.value = value;
            }
            showOutputs(path, value);
        }

        if (els.weatherCity !== document.activeElement) {
            els.weatherCity.value = Settings.get().widgets.weather.city;
        }
        if (els.wallpaperUrl !== document.activeElement) {
            els.wallpaperUrl.value = Settings.get().wallpaper.url;
        }
    }

    function commitSetting(input) {
        const path = input.dataset.setting;
        const value = input.type === "checkbox" ? input.checked : input.value;
        const final = input.type === "range" ? Number(value) : value;
        if (input.type === "range") showOutputs(path, final);
        mutate(() => Settings.set(patchFor(path, final)));
    }

    function bindSettingInputs() {
        for (const input of document.querySelectorAll("[data-setting]")) {
            if (input.type === "checkbox" || input.tagName === "SELECT") {
                input.addEventListener("change", () => commitSetting(input));
            } else {
                // Colours, ranges and text fields write on every keystroke, but
                // debounced so dragging a slider is not a hundred writes.
                input.addEventListener("input", debounce(() => commitSetting(input), 150));
            }
        }
    }

    // --- modal -------------------------------------------------------------

    const isOpen = () => !els.overlay.hidden;

    function open() {
        els.overlay.hidden = false;
        // Having seen the menu, stop the gear pulsing about the wallpaper.
        els.button.dataset.seen = "";
        buildContents();
        fillInputs();
        refreshWallpaperInfo();
        refreshJson();
        requestAnimationFrame(() => els.close.focus());
    }

    function close() {
        els.overlay.hidden = true;
        els.button.focus();
    }

    function toggle() {
        if (isOpen()) close();
        else open();
    }

    function selectTab(name) {
        for (const tab of document.querySelectorAll(".settings-tab")) {
            tab.classList.toggle("is-active", tab.dataset.tab === name);
        }
        for (const section of document.querySelectorAll(".settings-section")) {
            section.classList.toggle("is-active", section.dataset.section === name);
        }
        if (name === "data") refreshJson();
    }

    function bindModal() {
        els.button.addEventListener("click", toggle);
        els.close.addEventListener("click", close);
        els.tabs.addEventListener("click", (event) => {
            const tab = event.target.closest(".settings-tab");
            if (tab) selectTab(tab.dataset.tab);
        });

        // Clicking the backdrop closes, clicking the panel does not.
        els.overlay.addEventListener("mousedown", (event) => {
            if (event.target === els.overlay) close();
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && isOpen()) {
                close();
                return;
            }
            // Where the keystroke was aimed, and where focus sits: either one
            // being a field means you were typing, not asking for the menu.
            const typing = ["INPUT", "TEXTAREA", "SELECT"].some(
                (tag) =>
                    event.target?.tagName === tag ||
                    document.activeElement?.tagName === tag,
            );
            // Uppercase S, so that a lower case "s" can still start a bookmark
            // filter. See filter.js.
            if (event.key === "S" && !typing && !event.ctrlKey && !event.metaKey) {
                event.preventDefault();
                toggle();
            }
        });
    }

    // --- wallpaper ---------------------------------------------------------

    /** Small images read better in kB than as a row of zeroes in MB. */
    function formatSize(bytes) {
        return bytes >= 1048576
            ? `${(bytes / 1048576).toFixed(2)} MB`
            : `${Math.max(1, Math.round(bytes / 1024))} kB`;
    }

    async function refreshWallpaperInfo() {
        const info = await Settings.wallpaperInfo();
        const labels = {
            none: "No wallpaper set, so the background is a flat colour",
            image: info.size
                ? `Using your image (${formatSize(info.size)})`
                : "Your image could not be found, so the background is a flat colour",
            url: `Using ${info.url}`,
            gradient: "Using a background from a preset",
        };
        els.wallpaperCurrent.textContent = labels[info.mode] ?? labels.none;
        // A picture much larger than the screen is stored smaller, and saying so
        // is better than the size quietly changing under you.
        els.wallpaperShrink.textContent = info.shrink
            ? `Made smaller to fit the screen: ${formatSize(info.shrink.from)} became ${formatSize(
                  info.shrink.to,
              )}.`
            : "";
        // The picture you picked last, if something else put it aside, so offer
        // to put it back rather than making them pick the file again.
        els.wallpaperRestoreRow.hidden = !info.restore;
    }

    // --- presets -------------------------------------------------------------

    /**
     * The CSS background for a preview, so a card looks like the look it saves.
     * A picture is the one thing that needs reading from the image library
     * first, so it arrives later, as an object URL from renderGallery; until
     * then, and for a look with no background at all, the card shows the flat
     * page colour.
     */
    function previewBackground(wallpaper) {
        if (wallpaper.mode === "gradient") return wallpaper.gradient;
        if (wallpaper.mode === "url" && wallpaper.url) {
            return `url("${wallpaper.url.replace(/["\\\n\r]/g, "")}")`;
        }
        return "linear-gradient(#2b2b2b, #2b2b2b)";
    }

    // Object URLs made for the previews, revoked when the gallery is drawn
    // again, so looking at a gallery full of pictures does not leak them.
    let previewUrls = [];

    function revokePreviews() {
        for (const url of previewUrls) URL.revokeObjectURL(url);
        previewUrls = [];
    }

    // Which draw of the gallery is the current one. A draw that is still
    // reading a picture when a newer one starts is stale: its cards are gone
    // from the page, and the URL it was about to use has to be handed straight
    // back rather than kept. Dragging a colour slider redraws the gallery many
    // times a second, so this is a real case and not a theoretical one.
    let galleryDraw = 0;

    /** A card for one saved preset: what it looks like, and what you can do. */
    function presetCard(preset, index) {
        const card = document.createElement("article");
        card.className = "preset-card";
        card.dataset.index = index;

        const preview = document.createElement("div");
        preview.className = "preset-preview";
        preview.style.background = previewBackground(preset.wallpaper);
        // The panel sitting on the background, with sample text in the preset's
        // own colours: enough to tell two presets that share a background apart.
        const sample = document.createElement("div");
        sample.className = "preset-sample";
        sample.style.background = `rgba(0, 0, 0, ${preset.panel.opacity})`;
        sample.style.backdropFilter = `blur(${Math.min(preset.panel.blur, 4)}px)`;
        sample.style.color = preset.theme.colorFg;
        const title = document.createElement("b");
        title.style.color = preset.theme.colorTitle;
        title.textContent = "general";
        const link = document.createElement("span");
        link.style.color = preset.theme.colorLink;
        link.textContent = "gmail";
        const hover = document.createElement("span");
        hover.style.color = preset.theme.colorLinkHover;
        hover.textContent = "docs";
        const visited = document.createElement("span");
        visited.style.color = preset.theme.colorLinkVisited;
        visited.textContent = "reddit";
        sample.append(title, link, hover, visited);
        preview.append(sample);

        const name = document.createElement("input");
        name.type = "text";
        name.className = "preset-name";
        name.value = preset.name;
        name.maxLength = 30;
        name.title = "Change this and the preset is renamed";
        name.setAttribute("aria-label", "Preset name");

        const actions = document.createElement("div");
        actions.className = "button-row";
        const button = (action, label, extra = "") => {
            const node = document.createElement("button");
            node.type = "button";
            node.className = `button ${extra}`.trim();
            node.dataset.action = action;
            node.textContent = label;
            return node;
        };
        // No rename button: the name field above is the rename, and a control
        // that only does what the field already does is clutter.
        actions.append(
            button("use", "Use it", "button-primary"),
            button("update", "Update", "button-small"),
            button("delete", "Delete", "button-small button-danger"),
        );

        card.append(preview, name, actions);
        return card;
    }

    /**
     * Draws the gallery: the looks you saved, with a card each. A preset whose
     * background is one of your own pictures needs its blob read to show it, so
     * this is async and the pictures arrive a moment later.
     */
    async function renderGallery() {
        if (!els.presetGallery) return;
        const presets = Settings.get().presets;
        const draw = ++galleryDraw;
        revokePreviews();

        if (!presets.length) {
            els.presetGallery.replaceChildren();
            els.presetGallery.hidden = true;
            els.presetEmpty.hidden = false;
            return;
        }

        const cards = presets.map((preset, index) => presetCard(preset, index));
        els.presetGallery.replaceChildren(...cards);
        els.presetGallery.hidden = false;
        els.presetEmpty.hidden = true;

        await Promise.all(
            presets.map(async (preset, index) => {
                if (preset.wallpaper.mode !== "image") return;
                const url = await Settings.imageUrl(preset.wallpaper.image);
                const card = cards[index];
                if (!url) {
                    if (galleryDraw !== draw) return;
                    // The picture went, with the export or by hand. Say so on the
                    // card rather than showing a blank one.
                    card.classList.add("is-missing-image");
                    const preview = card.querySelector(".preset-preview");
                    preview.style.background = "linear-gradient(#2b2b2b, #2b2b2b)";
                    preview.title = "The picture is not in this browser any more";
                    return;
                }
                if (galleryDraw !== draw) {
                    URL.revokeObjectURL(url);
                    return;
                }
                previewUrls.push(url);
                card.querySelector(".preset-preview").style.background =
                    `url("${url}") center / cover`;
            }),
        );
    }

    function bindGallery() {
        // Saving the look on screen under a name. The field empties itself so
        // the next save does not inherit the last name by accident.
        els.presetSave?.addEventListener("click", async () => {
            const typed = els.presetName.value;
            const name = typed.trim() || "My look";
            await mutate(() => Settings.savePreset(name));
            els.presetName.value = "";
            await renderGallery();
            toast(`Saved as ${name}.`);
        });

        els.presetGallery?.addEventListener("click", async (event) => {
            const button = event.target.closest("[data-action]");
            if (!button) return;
            const index = Number(button.closest(".preset-card").dataset.index);
            const preset = Settings.get().presets[index];
            if (!preset) return;

            if (button.dataset.action === "use") {
                await mutate(() => Settings.applyPreset(preset));
                fillInputs();
                refreshWallpaperInfo();
                await renderGallery();
                toast(`${preset.name} applied.`);
            } else if (button.dataset.action === "update") {
                await mutate(() => Settings.updatePreset(index));
                await renderGallery();
                toast(`${preset.name} updated.`);
            } else if (button.dataset.action === "delete") {
                const snapshot = { presets: deepCopy(Settings.get().presets) };
                await deleteWithUndo(
                    snapshot,
                    `${preset.name} deleted.`,
                    () => Settings.deletePreset(index, { undoable: true }),
                    () => renderGallery(),
                );
            }
        });

        // Renaming is the name field: change it and the preset is renamed, so
        // there is no separate dialog to keep in step with the gallery.
        els.presetGallery?.addEventListener("change", async (event) => {
            if (!event.target.classList.contains("preset-name")) return;
            const index = Number(event.target.closest(".preset-card").dataset.index);
            const name = event.target.value.trim();
            await mutate(() => Settings.renamePreset(index, name));
            await renderGallery();
        });
    }


    function bindWallpaper() {
        els.wallpaperFile.addEventListener("change", async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            await mutate(() => Settings.useWallpaperFile(file));
            refreshWallpaperInfo();
        });

        els.wallpaperReset.addEventListener("click", async () => {
            const snapshot = { wallpaper: deepCopy(Settings.get().wallpaper) };
            await deleteWithUndo(
                snapshot,
                "Wallpaper removed.",
                () => Settings.clearWallpaper({ undoable: true }),
                async () => {
                    fillInputs();
                    refreshWallpaperInfo();
                },
            );
        });

        els.wallpaperRestore.addEventListener("click", async () => {
            await mutate(() => Settings.restoreWallpaper());
            refreshWallpaperInfo();
        });

        const applyUrl = async () => {
            await mutate(() => Settings.useWallpaperUrl(els.wallpaperUrl.value));
            refreshWallpaperInfo();
        };
        els.wallpaperUrlApply.addEventListener("click", applyUrl);
        els.wallpaperUrl.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                applyUrl();
            }
        });
    }

    // --- weather city ------------------------------------------------------

    function weatherStatus(message, isError = false) {
        els.weatherStatus.textContent = message;
        els.weatherStatus.classList.toggle("is-error", isError);
    }

    const geocode = (query) =>
        fetch(
            `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(
                query,
            )}&limit=5&appid=${encodeURIComponent(
                Settings.get().widgets.weather.apiKey,
            )}`,
        ).then((response) => {
            if (!response.ok) {
                throw new Error(`City lookup failed (${response.status}).`);
            }
            return response.json();
        });

    async function applyCity(query) {
        const name = query.trim();
        if (!name) return;

        weatherStatus("Looking up city…");
        try {
            const results = await geocode(name);
            if (!results.length) {
                weatherStatus(`No city called "${name}" was found.`, true);
                return;
            }

            const match =
                results.find(
                    (result) => result.name.toLowerCase() === name.toLowerCase(),
                ) ?? results[0];

            els.weatherCity.value = match.name;
            await mutate(() =>
                Settings.set({
                    widgets: {
                        weather: { city: match.name, lat: match.lat, lon: match.lon },
                    },
                }),
            );
            weatherStatus(`Weather city set to ${match.name}.`);
        } catch (error) {
            weatherStatus(error.message, true);
        }
    }

    /** Fills the datalist with cities matching what is being typed. */
    const suggestCities = debounce(async () => {
        const query = els.weatherCity.value.trim();
        if (query.length < 2) return;
        try {
            const results = await geocode(query);
            els.cityOptions.textContent = "";
            for (const result of results) {
                const option = document.createElement("option");
                option.value = result.name;
                option.label = [result.state, result.country]
                    .filter(Boolean)
                    .join(", ");
                els.cityOptions.append(option);
            }
        } catch {
            // Suggestions are a nicety, so failures stay silent.
        }
    }, 400);

    function bindWeather() {
        els.weatherCityApply.addEventListener("click", () =>
            applyCity(els.weatherCity.value),
        );
        els.weatherCity.addEventListener("input", suggestCities);
        els.weatherCity.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                els.weatherCityApply.click();
            }
        });
        els.weatherCity.addEventListener("change", () => {
            const current = Settings.get().widgets.weather;
            if (els.weatherCity.value.trim() === current.city) return;
            applyCity(els.weatherCity.value);
        });
    }

    // --- bookmark editor ---------------------------------------------------

    function iconButton(label, action, extraClass = "") {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `icon-button ${extraClass}`.trim();
        button.textContent = label;
        button.dataset.action = action;
        button.title = label;
        button.setAttribute("aria-label", label);
        return button;
    }

    function textInput(className, value, placeholder) {
        const input = document.createElement("input");
        input.type = "text";
        input.className = `editor-input ${className}`;
        input.value = value;
        input.placeholder = placeholder;
        input.spellcheck = false;
        // Keeps the browser from starting a text drag instead of our reorder.
        input.draggable = false;
        return input;
    }

    function buildEditorLink(categoryIndex, link, linkIndex, found) {
        const row = document.createElement("div");
        row.className = "editor-link";
        row.draggable = true;
        row.dataset.category = String(categoryIndex);
        row.dataset.index = String(linkIndex);

        const handle = document.createElement("span");
        handle.className = "drag-handle";
        handle.textContent = "⠿";
        handle.title = "Drag to reorder";

        const title = textInput("editor-link-title", link.title, "title");
        title.dataset.role = "title";

        const url = textInput("editor-link-url", link.url, "https://");
        url.dataset.role = "url";

        // A bare host gets a scheme when it is saved, which is almost always
        // what was meant. Say so while it is still being typed, so the address
        // quietly growing an https:// is never a surprise.
        const schemeHint = document.createElement("span");
        schemeHint.className = "editor-hint";
        schemeHint.hidden = true;
        url.addEventListener("input", () => {
            const typed = url.value.trim();
            const willNormalize =
                Boolean(typed) && !/^[a-z][a-z0-9+.-]*:/i.test(typed);
            schemeHint.hidden = !willNormalize;
            schemeHint.textContent =
                `No scheme — saved as https://${typed.replace(/^\/+/, "")}`;
        });

        const issues = found.filter(
            (issue) =>
                issue.category === categoryIndex && issue.link === linkIndex,
        );

        row.append(
            handle,
            title,
            url,
            iconButton("↑", "link-up"),
            iconButton("↓", "link-down"),
            iconButton("✕", "link-delete", "is-danger"),
            schemeHint,
        );
        for (const issue of issues) {
            const note = document.createElement("span");
            note.className = "editor-issue";
            note.textContent = ISSUE_TEXT[issue.kind] ?? issue.kind;
            row.append(note);
        }
        return row;
    }

    function buildEditorCategory(category, categoryIndex, found) {
        const block = document.createElement("div");
        block.className = "editor-category";
        block.draggable = true;
        block.dataset.index = String(categoryIndex);

        const header = document.createElement("div");
        header.className = "editor-category-head";

        const handle = document.createElement("span");
        handle.className = "drag-handle";
        handle.textContent = "⠿";
        handle.title = "Drag to reorder";

        const name = textInput("editor-category-name", category.name, "category name");
        name.dataset.role = "name";

        header.append(
            handle,
            name,
            iconButton("↑", "category-up"),
            iconButton("↓", "category-down"),
            iconButton("✕", "category-delete", "is-danger"),
        );

        const links = document.createElement("div");
        links.className = "editor-links";
        category.links.forEach((link, linkIndex) => {
            links.append(buildEditorLink(categoryIndex, link, linkIndex, found));
        });
        // A category that would render as an empty box is worth a word, right
        // where the missing bookmarks would sit.
        if (!category.links.length) {
            const note = document.createElement("span");
            note.className = "editor-issue";
            note.textContent = ISSUE_TEXT.empty;
            links.append(note);
        }

        const addLink = document.createElement("button");
        addLink.type = "button";
        addLink.className = "button button-small";
        addLink.dataset.action = "link-add";
        addLink.textContent = "+ bookmark";

        block.append(header, links, addLink);
        return block;
    }

    /** One factual line about what needs a second look, or "all good". */
    function renderIssueSummary(found) {
        if (!els.bookmarkIssues) return;
        const byKind = {};
        for (const issue of found) {
            byKind[issue.kind] = (byKind[issue.kind] || 0) + 1;
        }
        const render = (count, singular, plural) =>
            `${count} ${count === 1 ? singular : plural}`;
        const parts = [];
        if (byKind.noAddress) parts.push(`${render(byKind.noAddress, "has", "have")} no address yet`);
        if (byKind.noName) parts.push(`${render(byKind.noName, "has", "have")} no name`);
        if (byKind.duplicate) parts.push(`${render(byKind.duplicate, "shares", "share")} an address`);
        if (byKind.empty) parts.push(`${render(byKind.empty, "category is", "categories are")} empty`);
        els.bookmarkIssues.textContent = parts.length
            ? `Needs attention: ${parts.join(", ")}.`
            : "No bookmarks need attention.";
        els.bookmarkIssues.classList.toggle("has-issues", parts.length > 0);
    }

    /**
     * Re-says what needs a second look after an inline edit, without
     * rebuilding the rows, so the caret and any half-typed text in other
     * rows are left exactly where they are. Fixing an address changes the
     * issues list, and the old note on the row would otherwise stay.
     */
    function refreshEditorIssues() {
        const found = Bookmarks.issues();
        renderIssueSummary(found);
        for (const row of els.categoriesEditor.querySelectorAll(".editor-link")) {
            for (const old of row.querySelectorAll(".editor-issue")) old.remove();
            const mine = found.filter(
                (issue) =>
                    issue.category === Number(row.dataset.category) &&
                    issue.link === Number(row.dataset.index),
            );
            for (const issue of mine) {
                const note = document.createElement("span");
                note.className = "editor-issue";
                note.textContent = ISSUE_TEXT[issue.kind] ?? issue.kind;
                row.append(note);
            }
        }
    }

    function renderEditor() {
        els.categoriesEditor.textContent = "";
        const found = Bookmarks.issues();
        Settings.get().bookmarks.forEach((category, index) => {
            els.categoriesEditor.append(buildEditorCategory(category, index, found));
        });
        renderIssueSummary(found);
    }

    /**
     * Moves a bookmark, possibly into a different category, which is what
     * dropping it onto another category does.
     */
    function relocateLink(fromCategory, fromIndex, toCategory, toIndex) {
        if (fromCategory === toCategory) {
            return Bookmarks.moveLink(fromCategory, fromIndex, toIndex);
        }

        const list = Settings.get().bookmarks.map((category) => ({
            name: category.name,
            links: category.links.map((link) => ({ ...link })),
        }));
        const [moved] = list[fromCategory].links.splice(fromIndex, 1);
        list[toCategory].links.splice(toIndex, 0, moved);
        return Settings.set({ bookmarks: list });
    }

    function clearDropMarkers() {
        for (const node of els.panel.querySelectorAll(".drop-before, .drop-after")) {
            node.classList.remove("drop-before", "drop-after");
        }
    }

    /** Runs an editor action and repaints the editor afterwards. */
    async function editorAction(action) {
        await mutate(action);
        renderEditor();
    }

    function bindEditor() {
        els.addCategory.addEventListener("click", async () => {
            await editorAction(() => Bookmarks.addCategory());
            const names = els.categoriesEditor.querySelectorAll(
                ".editor-category-name",
            );
            names[names.length - 1]?.select();
        });

        els.categoriesEditor.addEventListener("click", (event) => {
            const button = event.target.closest("[data-action]");
            if (!button) return;

            const block = button.closest(".editor-category");
            const categoryIndex = Number(block?.dataset.index);
            const row = button.closest(".editor-link");
            const linkIndex = Number(row?.dataset.index);
            const name = Settings.get().bookmarks[categoryIndex]?.name;

            switch (button.dataset.action) {
                case "category-up":
                    editorAction(() =>
                        Bookmarks.moveCategory(categoryIndex, categoryIndex - 1),
                    );
                    break;
                case "category-down":
                    editorAction(() =>
                        Bookmarks.moveCategory(categoryIndex, categoryIndex + 1),
                    );
                    break;
                case "category-delete": {
                    const snapshot = { bookmarks: deepCopy(Settings.get().bookmarks) };
                    deleteWithUndo(
                        snapshot,
                        `"${name}" deleted.`,
                        () => Bookmarks.removeCategory(categoryIndex),
                        () => renderEditor(),
                    );
                    break;
                }
                case "link-add":
                    editorAction(() =>
                        Bookmarks.addLink(categoryIndex, {
                            title: "new link",
                            url: "",
                        }),
                    ).then(() => {
                        const rows = block.querySelectorAll(".editor-link");
                        rows[rows.length - 1]?.querySelector(".editor-link-title")
                            ?.select();
                    });
                    break;
                case "link-up":
                    editorAction(() =>
                        Bookmarks.moveLink(categoryIndex, linkIndex, linkIndex - 1),
                    );
                    break;
                case "link-down":
                    editorAction(() =>
                        Bookmarks.moveLink(categoryIndex, linkIndex, linkIndex + 1),
                    );
                    break;
                case "link-delete": {
                    const snapshot = { bookmarks: deepCopy(Settings.get().bookmarks) };
                    deleteWithUndo(
                        snapshot,
                        "Bookmark deleted.",
                        () => Bookmarks.removeLink(categoryIndex, linkIndex),
                        () => renderEditor(),
                    );
                    break;
                }
                default:
                    break;
            }
        });

        // Inline text fields commit on blur or Enter.
        els.categoriesEditor.addEventListener("change", async (event) => {
            const input = event.target.closest(".editor-input");
            if (!input) return;

            const block = input.closest(".editor-category");
            const categoryIndex = Number(block.dataset.index);
            const role = input.dataset.role;

            if (role === "name") {
                const name = input.value.trim() || "untitled";
                input.value = name;
                await mutate(() => Bookmarks.renameCategory(categoryIndex, name));
                return;
            }

            const linkIndex = Number(
                input.closest(".editor-link").dataset.index,
            );
            await mutate(() =>
                Bookmarks.updateLink(categoryIndex, linkIndex, {
                    [role]: input.value.trim(),
                }),
            );
            // A title or address edit can settle an issue, and the note on
            // the row and the summary line are stale until re-said.
            refreshEditorIssues();
        });

        els.categoriesEditor.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") return;
            if (event.target.closest(".editor-input")) event.target.blur();
        });

        bindDragAndDrop();
    }

    function bindDragAndDrop() {
        const editor = els.categoriesEditor;

        editor.addEventListener("dragstart", (event) => {
            const link = event.target.closest(".editor-link");
            const block = event.target.closest(".editor-category");

            if (link) {
                dragPayload = {
                    kind: "link",
                    category: Number(link.dataset.category),
                    index: Number(link.dataset.index),
                };
                link.classList.add("is-dragging");
            } else if (block && !event.target.closest("input, button")) {
                dragPayload = { kind: "category", index: Number(block.dataset.index) };
                block.classList.add("is-dragging");
            } else {
                return;
            }

            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", dragPayload.kind);
        });

        editor.addEventListener("dragend", () => {
            dragPayload = null;
            for (const node of editor.querySelectorAll(".is-dragging")) {
                node.classList.remove("is-dragging");
            }
            clearDropMarkers();
        });

        editor.addEventListener("dragover", (event) => {
            if (!dragPayload) return;
            const target = event.target.closest(".editor-category, .editor-link");
            if (!target) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";

            clearDropMarkers();
            if (target.classList.contains("editor-category")) {
                const bounds = target.getBoundingClientRect();
                target.classList.add(
                    event.clientY > bounds.top + bounds.height / 2
                        ? "drop-after"
                        : "drop-before",
                );
            } else {
                target.classList.add("drop-before");
            }
        });

        editor.addEventListener("drop", async (event) => {
            if (!dragPayload) return;
            event.preventDefault();

            const payload = dragPayload;
            const target = event.target.closest(".editor-category, .editor-link");
            clearDropMarkers();
            if (!target) return;

            const block = target.closest(".editor-category");
            const blockIndex = Number(block.dataset.index);
            const row = target.classList.contains("editor-link") ? target : null;
            const bounds = target.getBoundingClientRect();
            const after = event.clientY > bounds.top + bounds.height / 2;

            if (payload.kind === "category") {
                // `moveCategory` removes first, so a target below the dragged
                // item shifts up by one.
                let to = blockIndex + (after ? 1 : 0);
                if (to > payload.index) to -= 1;
                await editorAction(() => Bookmarks.moveCategory(payload.index, to));
                return;
            }

            const toIndex = row
                ? Number(row.dataset.index) + (after ? 1 : 0)
                : block.querySelectorAll(".editor-link").length;

            if (row && payload.category === blockIndex) {
                let to = toIndex;
                if (to > payload.index) to -= 1;
                await editorAction(() =>
                    Bookmarks.moveLink(payload.category, payload.index, to),
                );
                return;
            }

            await editorAction(() =>
                relocateLink(payload.category, payload.index, blockIndex, toIndex),
            );
        });
    }

    // --- backup ------------------------------------------------------------

    function refreshJson() {
        if (dataJsonDirty) return;
        els.dataJson.value = Settings.exportJson();
    }

    function downloadJson() {
        const blob = new Blob([Settings.exportJson()], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "startpage-settings.json";
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function bindData() {
        els.dataExport.addEventListener("click", () => {
            downloadJson();
            status("Exported startpage-settings.json.");
        });

        els.dataCopy.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(Settings.exportJson());
                status("Copied to clipboard.");
            } catch {
                els.dataJson.select();
                status("Clipboard blocked, the JSON is selected instead.", true);
            }
        });

        els.dataJson.addEventListener("input", () => {
            dataJsonDirty = true;
        });

        // Anything that replaces the whole settings object repaints the form.
        const afterFullReload = async (message) => {
            dataJsonDirty = false;
            fillInputs();
            refreshJson();
            refreshWallpaperInfo();
            renderEditor();
            status(message);
        };

        els.dataImport.addEventListener("change", async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            let imported = false;
            await mutate(async () => {
                dataJsonDirty = false;
                await Settings.importJson(await file.text());
                imported = true;
            });
            if (imported) await afterFullReload(`Imported ${file.name}.`);
        });

        els.dataApply.addEventListener("click", async () => {
            let applied = false;
            await mutate(async () => {
                await Settings.importJson(els.dataJson.value);
                applied = true;
            });
            if (applied) await afterFullReload("Applied.");
        });

        els.dataReset.addEventListener("click", async () => {
            const snapshot = deepCopy(Settings.get());
            let ok = false;
            await mutate(async () => {
                dataJsonDirty = false;
                try {
                    await Settings.reset({ undoable: true });
                    ok = true;
                } catch (error) {
                    ok = false;
                    throw error;
                }
            });
            if (!ok) return;
            await afterFullReload("Reset to defaults.");
            toast(
                "Reset to defaults.",
                false,
                () => {
                    mutate(() => Settings.applyUndo(snapshot)).then(() =>
                        afterFullReload("Undone — everything is back."),
                    );
                },
                () => Settings.flushPending(),
            );
        });
    }

    // --- init --------------------------------------------------------------

    const ELEMENT_IDS = {
        overlay: "settings-overlay",
        panel: "settings-panel",
        button: "settings-button",
        close: "settings-close",
        tabs: "settings-tabs",
        toast: "settings-toast",
        wallpaperFile: "wallpaper-file",
        wallpaperReset: "wallpaper-reset",
        wallpaperRestore: "wallpaper-restore",
        wallpaperRestoreRow: "wallpaper-restore-row",
        wallpaperUrl: "wallpaper-url",
        wallpaperUrlApply: "wallpaper-url-apply",
        wallpaperCurrent: "wallpaper-current",
        wallpaperShrink: "wallpaper-shrink",
        version: "settings-version",
        presetGallery: "preset-gallery",
        presetEmpty: "preset-empty",
        presetName: "preset-name",
        presetSave: "preset-save",
        weatherCity: "weather-city",
        weatherCityApply: "weather-city-apply",
        cityOptions: "weather-city-options",
        weatherStatus: "weather-status",
        addCategory: "category-add",
        categoriesEditor: "categories-editor",
        bookmarkIssues: "bookmark-issues",
        dataExport: "data-export",
        dataCopy: "data-copy",
        dataImport: "data-import",
        dataJson: "data-json",
        dataApply: "data-apply",
        dataReset: "data-reset",
        dataStatus: "data-status",
    };

    function cacheElements() {
        for (const [name, id] of Object.entries(ELEMENT_IDS)) {
            els[name] = document.getElementById(id);
        }
    }

    /**
     * The parts of the menu that have to be drawn rather than parsed: the
     * bookmark editor and the preset gallery, the last of these making a
     * fresh preview for every card.
     *
     * A new tab almost never opens the menu, so this happens the first time it
     * is opened instead of on every tab. The listeners are all bound to
     * containers that exist in the markup already, so drawing later changes
     * nothing about how the menu responds.
     */
    let contentsBuilt = false;

    function buildContents() {
        if (contentsBuilt) return;
        contentsBuilt = true;
        renderEditor();
        renderGallery();
        // The menu is now drawn from whatever the settings are at this moment,
        // so the next change is compared against that rather than against
        // whatever was on disk when the page loaded.
        drawn = drawnFrom(Settings.get());
    }

    /**
     * What the menu was last drawn from, so a change redraws the part it
     * actually affects.
     *
     * Every part of the menu is drawn from a different corner of the settings.
     * Rebuilding all of them for one change is not free: a single colour tweak
     * was rebuilding the whole bookmark editor and the whole preset gallery,
     * making a fresh preview and a fresh object URL for every card, and reading
     * the wallpaper back out of storage for a wallpaper that had not changed.
     */
    let drawn = null;

    const drawnFrom = (state) => ({
        inputs: JSON.stringify([
            state.theme,
            state.panel,
            state.layout,
            state.wallpaperDim,
            state.widgets,
            state.greetingName,
            state.greetingTemplate,
        ]),
        wallpaper: JSON.stringify(state.wallpaper),
        bookmarks: JSON.stringify(state.bookmarks),
        presets: JSON.stringify(state.presets),
    });

    function redrawChanged(state) {
        if (selfChange || !contentsBuilt) return;
        const next = drawnFrom(state);
        if (!drawn) {
            drawn = next;
            return;
        }
        if (next.inputs !== drawn.inputs) fillInputs();
        if (next.wallpaper !== drawn.wallpaper) {
            refreshWallpaperInfo();
        }
        if (next.bookmarks !== drawn.bookmarks) renderEditor();
        if (next.presets !== drawn.presets) renderGallery();
        drawn = next;
    }

    function init() {
        cacheElements();
        // The version, from the manifest, shown small under the Settings title.
        const runtime = typeof browser !== "undefined" ? browser : chrome;
        els.version.textContent = `v${runtime.runtime.getManifest().version}`;
        bindModal();
        bindSettingInputs();
        bindGallery();
        bindWallpaper();
        bindWeather();
        bindEditor();
        bindData();

        // Settings that arrived from disk, from another tab, or from a write of
        // our own such as the weather widget looking a city up, redraw the parts
        // of the menu that change touched.
        Settings.subscribe(redrawChanged);
    }

    return { init, open, close, toggle };
})();

SettingsUI.init();

window.SettingsUI = SettingsUI;
