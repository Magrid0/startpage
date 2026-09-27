/* global browser, chrome */

// ---------------------------------------------------------------------------
// Settings store
//
// Everything the settings menu can change lives in a single object persisted
// under one `storage.local` key, so exporting and importing is a plain
// read/write of that object.
//
// The wallpaper image is deliberately NOT part of that object: a picked image
// is kept in IndexedDB as a blob (storage.local only has a few MB to spend and
// base64 inflates by a third) and only its "mode" is stored here.
// ---------------------------------------------------------------------------

const SETTINGS_KEY = "startpage.settings";

// Image blobs, kept out of the settings object.
const DB_NAME = "magrid-startpage";
const DB_STORE = "assets";
const WALLPAPER_ASSET = "wallpaper";

// There is no bundled wallpaper, so the page ships small and you bring your own
// picture. With none set the background is a flat colour, and --wallpaper is a
// fully transparent layer rather than "none" so that background-image stays
// valid and the darkening layer still composites on top of it.
const NO_WALLPAPER = "linear-gradient(transparent, transparent)";

// OpenWeatherMap is called directly from the page, so the key lives here. It
// can be overridden from the settings menu, but since the start page is a
// normal web page the key is never truly secret.
const DEFAULT_WEATHER = {
    enabled: true,
    city: "Valmontone",
    lat: null,
    lon: null,
    apiKey: "4ffb38f99cbe1031fe02399b57be27f2",
};

const DEFAULTS = {
    version: 1,

    theme: {
        // Main text: greeting, dates, anything inheriting from body.
        colorFg: "#94b3c3",
        // Category headings.
        colorTitle: "#94b3c3",
        // Bookmark links.
        colorLink: "#43759b",
        colorLinkHover: "#7d6a5e",
        colorLinkVisited: "#43759b",
        // Clock and weather widget text.
        colorWidget: "#ffffff",
        fontFamily: '"Fira Code"',
        sizeLinks: 16,
        sizeTitle: 20,
        sizeGreeting: 40,
        // The greeting, from greeting.js.
        greetingName: "Magrid",
        // {greeting} becomes Good morning/afternoon/evening/night, {name} the
        // name above. Leave {greeting} out for fixed wording, or empty the whole
        // thing to drop the greeting.
        greetingTemplate: "{greeting}, {name}.",
    },

    // The frosted card the bookmarks sit in.
    panel: {
        opacity: 0.6,
        blur: 7,
    },

    // Darkening layer on top of the wallpaper, 0 to 1.
    wallpaperDim: 0,

    wallpaper: {
        // "none" (flat background colour), "file" (IndexedDB blob) or "url".
        mode: "none",
        url: "",
    },

    widgets: {
        weather: { ...DEFAULT_WEATHER },
        clock: {
            enabled: true,
            // "auto" follows the browser locale, like before.
            hourFormat: "auto",
        },
    },

    bookmarks: [
        {
            name: "general",
            links: [
                { title: "gmail", url: "https://gmail.com" },
                { title: "calendar", url: "https://calendar.google.com/" },
                { title: "weather", url: "https://www.ilmeteo.it/" },
                { title: "docs", url: "https://docs.google.com/" },
                { title: "amazon", url: "https://www.amazon.it/" },
            ],
        },
        {
            name: "piracy",
            links: [
                {
                    title: "cs.rin.ru",
                    url: "https://cs.rin.ru/forum/viewforum.php?f=10",
                },
                { title: "music", url: "https://squid.wtf/" },
                { title: "anime", url: "https://animeunity.so/" },
                {
                    title: "streaming community",
                    url: "https://streamingunity.tv/",
                },
                {
                    title: "calcio",
                    url: "https://vedo.direttecommunity.online/partite-streaming.html",
                },
            ],
        },
        {
            name: "tools",
            links: [
                { title: "chatgpt", url: "https://chatgpt.com/" },
                { title: "perplexity", url: "https://www.perplexity.ai/" },
                { title: "deepseek", url: "https://chat.deepseek.com/" },
                { title: "pairdrop", url: "https://pairdrop.net/" },
                { title: "protondb", url: "https://www.protondb.com/" },
            ],
        },
        {
            name: "social",
            links: [
                { title: "youtube", url: "https://youtube.com/" },
                { title: "reddit", url: "https://www.reddit.com/" },
                { title: "whatsapp", url: "https://web.whatsapp.com/" },
                { title: "4chan", url: "https://4chan.org" },
                { title: "twitch", url: "https://twitch.tv" },
            ],
        },
    ],
};

// --- small helpers ---------------------------------------------------------

const isPlainObject = (value) =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const clone = (value) => JSON.parse(JSON.stringify(value));

/** Recursive merge used by `set()` so a partial patch keeps untouched keys. */
function merge(target, patch) {
    const out = clone(target);
    for (const [key, value] of Object.entries(patch)) {
        if (!(key in out)) continue;
        out[key] = isPlainObject(value) && isPlainObject(out[key])
            ? merge(out[key], value)
            : value;
    }
    return out;
}

// --- storage adapter -------------------------------------------------------
// Firefox gives us the promise based `browser` namespace. Chromium style
// `chrome` and, when the page is opened outside of a browser extension (plain
// http server during development), localStorage are supported as fallbacks.

function detectStorage() {
    if (typeof browser !== "undefined" && browser.storage) return "browser";
    if (typeof chrome !== "undefined" && chrome.storage) return "chrome";
    return null;
}

const STORAGE_BACKEND = detectStorage();

async function storageRead() {
    if (STORAGE_BACKEND === "browser" || STORAGE_BACKEND === "chrome") {
        const result = await browser.storage.local.get(SETTINGS_KEY);
        return result[SETTINGS_KEY] ?? null;
    }
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : null;
}

async function storageWrite(value) {
    if (STORAGE_BACKEND === "browser" || STORAGE_BACKEND === "chrome") {
        await browser.storage.local.set({ [SETTINGS_KEY]: value });
        return;
    }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
}

async function storageClear() {
    if (STORAGE_BACKEND === "browser" || STORAGE_BACKEND === "chrome") {
        await browser.storage.local.remove(SETTINGS_KEY);
        return;
    }
    localStorage.removeItem(SETTINGS_KEY);
}

// --- IndexedDB, for wallpaper blobs ----------------------------------------

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(DB_STORE)) {
                db.createObjectStore(DB_STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function withStore(mode, action) {
    const db = await openDatabase();
    try {
        return await new Promise((resolve, reject) => {
            const transaction = db.transaction(DB_STORE, mode);
            const store = transaction.objectStore(DB_STORE);
            const request = action(store);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } finally {
        db.close();
    }
}

const assetGet = (key) => withStore("readonly", (store) => store.get(key));
const assetPut = (key, value) =>
    withStore("readwrite", (store) => store.put(value, key));
const assetDelete = (key) =>
    withStore("readwrite", (store) => store.delete(key));

// --- validation ------------------------------------------------------------
// Anything coming from disk (or from an imported file the user may have edited
// by hand) goes through here, so a malformed value can never brick the page.

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const pick = (value, fallback, test) =>
    test && test(value) ? value : fallback;

const asColor = (value, fallback) =>
    pick(value, fallback, (v) => typeof v === "string" && HEX_COLOR.test(v));

/**
 * Accepts a number, or a numeric string, inside the allowed range. Out of range
 * values fall back to the default rather than being clamped: every other
 * invalid value does the same, so "bad input, back to default" is one rule.
 */
const asNumber = (value, fallback, min, max) => {
    const n = typeof value === "string" ? Number(value) : value;
    if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
    if (n < min || n > max) return fallback;
    return n;
};

const asString = (value, fallback, maxLength = 200) =>
    pick(value, fallback, (v) => typeof v === "string" && v.length <= maxLength);

const asEnum = (value, allowed, fallback) =>
    allowed.includes(value) ? value : fallback;

const asBool = (value, fallback) =>
    typeof value === "boolean" ? value : fallback;

const asNullableNumber = (value, fallback, min, max) =>
    value === null || value === undefined
        ? null
        : asNumber(value, fallback, min, max);

/** Accepts http(s) URLs, and normalises "example.com" to a real URL. */
function normalizeUrl(value) {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    if (!trimmed) return "";
    const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;
    try {
        const url = new URL(withProtocol);
        if (url.protocol !== "http:" && url.protocol !== "https:") return "";
        return url.href;
    } catch {
        return "";
    }
}

function sanitizeBookmarks(value) {
    if (!Array.isArray(value)) return clone(DEFAULTS.bookmarks);

    const categories = value
        .filter(isPlainObject)
        .slice(0, 50)
        .map((category) => {
            const links = Array.isArray(category.links) ? category.links : [];
            return {
                name: asString(category.name, "untitled", 60) || "untitled",
                // A bookmark without a URL is kept: that is what a freshly
                // added, not yet filled in bookmark looks like.
                links: links
                    .filter(isPlainObject)
                    .slice(0, 200)
                    .map((link) => ({
                        title: asString(link.title, "", 100),
                        url: normalizeUrl(link.url),
                    })),
            };
        });

    return categories;
}

function sanitize(input) {
    const source = isPlainObject(input) ? input : {};
    const theme = isPlainObject(source.theme) ? source.theme : {};
    const panel = isPlainObject(source.panel) ? source.panel : {};
    const wallpaper = isPlainObject(source.wallpaper) ? source.wallpaper : {};
    const widgets = isPlainObject(source.widgets) ? source.widgets : {};
    const weather = isPlainObject(widgets.weather) ? widgets.weather : {};
    const clock = isPlainObject(widgets.clock) ? widgets.clock : {};

    // "default" was the bundled wallpaper, which no longer exists: anything but
    // "file" or "url" now means "no wallpaper".
    const mode = asEnum(wallpaper.mode, ["none", "file", "url"], "none");
    const url = mode === "url" ? normalizeUrl(wallpaper.url) : "";

    return {
        version: 1,
        theme: {
            colorFg: asColor(theme.colorFg, DEFAULTS.theme.colorFg),
            colorTitle: asColor(theme.colorTitle, DEFAULTS.theme.colorTitle),
            colorLink: asColor(theme.colorLink, DEFAULTS.theme.colorLink),
            colorLinkHover: asColor(
                theme.colorLinkHover,
                DEFAULTS.theme.colorLinkHover,
            ),
            colorLinkVisited: asColor(
                theme.colorLinkVisited,
                DEFAULTS.theme.colorLinkVisited,
            ),
            colorWidget: asColor(theme.colorWidget, DEFAULTS.theme.colorWidget),
            fontFamily: asString(theme.fontFamily, DEFAULTS.theme.fontFamily),
            sizeLinks: asNumber(theme.sizeLinks, 16, 8, 48),
            sizeTitle: asNumber(theme.sizeTitle, 20, 8, 64),
            sizeGreeting: asNumber(theme.sizeGreeting, 40, 12, 120),
            greetingName: asString(theme.greetingName, DEFAULTS.theme.greetingName, 40),
            greetingTemplate: asString(
                theme.greetingTemplate,
                DEFAULTS.theme.greetingTemplate,
                120,
            ),
        },
        panel: {
            opacity: asNumber(panel.opacity, 0.6, 0, 1),
            blur: asNumber(panel.blur, 7, 0, 40),
        },
        wallpaperDim: asNumber(source.wallpaperDim, 0, 0, 0.9),
        wallpaper: {
            // A "file" wallpaper whose blob went missing falls back to "none".
            mode,
            url,
        },
        widgets: {
            weather: {
                enabled: asBool(weather.enabled, true),
                city: asString(weather.city, DEFAULT_WEATHER.city, 100),
                lat: asNullableNumber(weather.lat, null, -90, 90),
                lon: asNullableNumber(weather.lon, null, -180, 180),
                apiKey: asString(weather.apiKey, DEFAULT_WEATHER.apiKey, 100),
            },
            clock: {
                enabled: asBool(clock.enabled, true),
                hourFormat: asEnum(clock.hourFormat, ["auto", "12", "24"], "auto"),
            },
        },
        bookmarks: sanitizeBookmarks(source.bookmarks),
    };
}

// --- applying settings to the page -----------------------------------------

const Settings = (() => {
    const root = document.documentElement;
    const listeners = new Set();

    let state = sanitize(DEFAULTS);
    let wallpaperObjectUrl = null;
    let ready;

    function setVar(name, value) {
        root.style.setProperty(name, value);
    }

    /** Wraps a URL in a CSS `url()` that cannot be broken out of. */
    function cssUrl(url) {
        return `url("${url.replace(/["\\\n\r]/g, "")}")`;
    }

    async function applyWallpaper() {
        const { mode, url } = state.wallpaper;
        let image = NO_WALLPAPER;

        if (mode === "url" && url) {
            image = cssUrl(url);
        } else if (mode === "file") {
            try {
                const blob = await assetGet(WALLPAPER_ASSET);
                if (blob) {
                    if (wallpaperObjectUrl) URL.revokeObjectURL(wallpaperObjectUrl);
                    wallpaperObjectUrl = URL.createObjectURL(blob);
                    image = cssUrl(wallpaperObjectUrl);
                }
            } catch (error) {
                console.error("Could not read the stored wallpaper:", error);
            }
        }

        setVar("--wallpaper", image);
        // Lets the settings button nudge the user until a wallpaper is picked.
        root.dataset.wallpaper = image === NO_WALLPAPER ? "none" : "image";
    }

    function applyTheme() {
        const { theme } = state;
        setVar("--color-fg", theme.colorFg);
        setVar("--color-title", theme.colorTitle);
        setVar("--color-link", theme.colorLink);
        setVar("--color-link-visited", theme.colorLinkVisited);
        setVar("--color-link-hover", theme.colorLinkHover);
        setVar("--color-widget", theme.colorWidget);
        setVar("--font-family", theme.fontFamily);
        setVar("--size-links", `${theme.sizeLinks}px`);
        setVar("--size-title", `${theme.sizeTitle}px`);
        setVar("--size-greeting", `${theme.sizeGreeting}px`);
        setVar("--panel-opacity", String(state.panel.opacity));
        setVar("--panel-blur", `${state.panel.blur}px`);
        setVar("--wallpaper-dim", String(state.wallpaperDim));
    }

    function notify() {
        for (const listener of listeners) listener(state);
    }

    async function apply() {
        applyTheme();
        await applyWallpaper();
    }

    async function load() {
        try {
            const stored = await storageRead();
            if (stored) state = sanitize(stored);
        } catch (error) {
            console.error("Could not read settings, using defaults:", error);
        }
        await apply();
        notify();
        return state;
    }

    ready = load();

    // Keep multiple start page tabs in sync.
    if (STORAGE_BACKEND === "browser" && browser.storage.onChanged) {
        browser.storage.onChanged.addListener((changes, area) => {
            if (area !== "local" || !changes[SETTINGS_KEY]) return;
            const next = changes[SETTINGS_KEY].newValue;
            if (!next) return;
            state = sanitize(next);
            apply().then(notify);
        });
    }

    return {
        /** Resolves once stored settings have been read and applied. */
        ready: ready,
        get defaults() {
            return sanitize(DEFAULTS);
        },
        get() {
            return state;
        },
        /** Describes the wallpaper currently in use, for the settings menu. */
        async wallpaperInfo() {
            let size = null;
            if (state.wallpaper.mode === "file") {
                try {
                    const blob = await assetGet(WALLPAPER_ASSET);
                    size = blob?.size ?? null;
                } catch {
                    size = null;
                }
            }
            return { ...state.wallpaper, size };
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        /** Merges a patch into the settings, saves and applies it. */
        async set(patch) {
            state = sanitize(merge(state, patch));
            await storageWrite(state);
            await apply();
            notify();
            return state;
        },
        async reset() {
            state = sanitize(DEFAULTS);
            await storageClear();
            await apply();
            notify();
            return state;
        },
        exportJson() {
            return JSON.stringify(state, null, 4);
        },
        async importJson(text) {
            const parsed = JSON.parse(text);
            state = sanitize(parsed);
            await storageWrite(state);
            await apply();
            notify();
            return state;
        },
        // --- wallpaper helpers ---
        async useWallpaperFile(file) {
            if (!file) return;
            if (!file.type.startsWith("image/")) {
                throw new Error("That file is not an image.");
            }
            await assetPut(WALLPAPER_ASSET, file);
            state = sanitize(merge(state, { wallpaper: { mode: "file" } }));
            await storageWrite(state);
            await apply();
            notify();
        },
        async useWallpaperUrl(url) {
            const normalized = normalizeUrl(url);
            if (!normalized) throw new Error("That does not look like a URL.");
            state = sanitize(
                merge(state, { wallpaper: { mode: "url", url: normalized } }),
            );
            await storageWrite(state);
            await apply();
            notify();
        },
        async clearWallpaper() {
            try {
                await assetDelete(WALLPAPER_ASSET);
            } catch (error) {
                console.error("Could not delete the stored wallpaper:", error);
            }
            if (wallpaperObjectUrl) {
                URL.revokeObjectURL(wallpaperObjectUrl);
                wallpaperObjectUrl = null;
            }
            state = sanitize(
                merge(state, { wallpaper: { mode: "none", url: "" } }),
            );
            await storageWrite(state);
            await apply();
            notify();
        },
    };
})();

// Also on window, so it can be poked at from the devtools console.
window.Settings = Settings;
