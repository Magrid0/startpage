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

    function toast(message, isError = false) {
        clearTimeout(toastTimer);
        els.toast.textContent = message;
        els.toast.classList.toggle("is-error", isError);
        els.toast.classList.add("is-visible");
        toastTimer = setTimeout(
            () => els.toast.classList.remove("is-visible"),
            isError ? 6000 : 3000,
        );
    }

    function status(message, isError = false) {
        els.dataStatus.textContent = message;
        els.dataStatus.classList.toggle("is-error", isError);
    }

    function formatValue(path, value) {
        if (path === "panel.opacity" || path === "wallpaperDim") {
            return `${Math.round(value * 100)}%`;
        }
        if (path.startsWith("theme.size") || path === "panel.blur") {
            return `${value}px`;
        }
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
            const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(
                document.activeElement?.tagName,
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
            file: info.size
                ? `Using your image (${formatSize(info.size)})`
                : "Your image could not be found, so the background is a flat colour",
            url: `Using ${info.url}`,
        };
        els.wallpaperCurrent.textContent = labels[info.mode] ?? labels.none;
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
            await mutate(() => Settings.clearWallpaper());
            fillInputs();
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

    function buildEditorLink(categoryIndex, link, linkIndex) {
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

        row.append(
            handle,
            title,
            url,
            iconButton("↑", "link-up"),
            iconButton("↓", "link-down"),
            iconButton("✕", "link-delete", "is-danger"),
        );
        return row;
    }

    function buildEditorCategory(category, categoryIndex) {
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
            links.append(buildEditorLink(categoryIndex, link, linkIndex));
        });

        const addLink = document.createElement("button");
        addLink.type = "button";
        addLink.className = "button button-small";
        addLink.dataset.action = "link-add";
        addLink.textContent = "+ bookmark";

        block.append(header, links, addLink);
        return block;
    }

    function renderEditor() {
        els.categoriesEditor.textContent = "";
        Settings.get().bookmarks.forEach((category, index) => {
            els.categoriesEditor.append(buildEditorCategory(category, index));
        });
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
                case "category-delete":
                    if (!confirm(`Delete the "${name}" category?`)) return;
                    editorAction(() => Bookmarks.removeCategory(categoryIndex));
                    break;
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
                case "link-delete":
                    editorAction(() => Bookmarks.removeLink(categoryIndex, linkIndex));
                    break;
                default:
                    break;
            }
        });

        // Inline text fields commit on blur or Enter.
        els.categoriesEditor.addEventListener("change", (event) => {
            const input = event.target.closest(".editor-input");
            if (!input) return;

            const block = input.closest(".editor-category");
            const categoryIndex = Number(block.dataset.index);
            const role = input.dataset.role;

            if (role === "name") {
                const name = input.value.trim() || "untitled";
                input.value = name;
                mutate(() => Bookmarks.renameCategory(categoryIndex, name));
                return;
            }

            const linkIndex = Number(
                input.closest(".editor-link").dataset.index,
            );
            mutate(() =>
                Bookmarks.updateLink(categoryIndex, linkIndex, {
                    [role]: input.value.trim(),
                }),
            );
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
            if (!confirm("Reset every setting and bookmark to the defaults?")) return;
            await mutate(async () => {
                dataJsonDirty = false;
                await Settings.reset();
                await Settings.clearWallpaper();
            });
            await afterFullReload("Reset to defaults.");
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
        wallpaperUrl: "wallpaper-url",
        wallpaperUrlApply: "wallpaper-url-apply",
        wallpaperCurrent: "wallpaper-current",
        weatherCity: "weather-city",
        weatherCityApply: "weather-city-apply",
        cityOptions: "weather-city-options",
        weatherStatus: "weather-status",
        addCategory: "category-add",
        categoriesEditor: "categories-editor",
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

    function init() {
        cacheElements();
        bindModal();
        bindSettingInputs();
        bindWallpaper();
        bindWeather();
        bindEditor();
        bindData();

        // Settings that arrived from disk (or another tab) repaint the form.
        Settings.subscribe(() => {
            if (selfChange) return;
            fillInputs();
            refreshWallpaperInfo();
            renderEditor();
        });

        Settings.ready.then(() => {
            fillInputs();
            renderEditor();
            refreshWallpaperInfo();
        });
    }

    return { init, open, close, toggle };
})();

SettingsUI.init();

window.SettingsUI = SettingsUI;
