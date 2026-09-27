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
// base64 inflates by a third) and only the id of that blob is stored here.
// ---------------------------------------------------------------------------

const SETTINGS_KEY = "startpage.settings";

// Image blobs, kept out of the settings object.
const DB_NAME = "magrid-startpage";
const DB_STORE = "assets";
// Where the single picked image used to live, before presets could point at
// images too. Read once, on load, and moved into the library.
const LEGACY_WALLPAPER_ASSET = "wallpaper";
// Every picked image gets an id of its own under this prefix, so two presets
// that share a wallpaper share one copy of it on disk.
const IMAGE_PREFIX = "wallpaper-image:";

// The wallpaper, cached in localStorage so a new tab can put it on screen before
// the first paint. localStorage is the one thing a page can read while it is
// still parsing, which is the only way to beat the frame of flat colour that
// opens a tab today. It is a cache, not the store: the picture itself still
// lives in IndexedDB, and this is rewritten every time it changes.
const WALLPAPER_CACHE_KEY = "startpage.wallpaper";

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

    // How the categories are arranged. Every value keeps the look it has today
    // at 0, apart from the spacing, which starts at a readable 20px.
    layout: {
        // 0 lays the categories out in as many columns as fit.
        columns: 0,
        // Pixels between categories, and the gap the column count is built from.
        gap: 20,
        // 0 fits the panel to its content, anything else is a fixed width.
        panelWidth: 0,
        // Corner rounding of the panel.
        radius: 16,
    },

    // Darkening layer on top of the wallpaper, 0 to 1.
    wallpaperDim: 0,

    wallpaper: {
        // "none" (flat background colour), "image" (a picked picture in the
        // image library), "url" or "gradient" (a CSS gradient, which is what
        // the presets use).
        mode: "none",
        // Which library image, when the mode is "image".
        image: "",
        // The last picture you picked, so a preset or a URL that put it aside
        // can be undone with one button.
        lastImage: "",
        url: "",
        gradient: "",
    },

    // Looks you saved yourself: the colours, the panel and the background of
    // the moment you hit save. They travel with the JSON export; the pictures
    // they point at do not, because those live in IndexedDB.
    presets: [],

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

const DB_VERSION = 1;

// Remembered once a database has been opened: a repair below raises the version
// for good, and asking for an older one than the file has is an error.
let dbVersion = DB_VERSION;

function openDatabase() {
    return new Promise((resolve, reject) => {
        const open = (version) => {
            const request = indexedDB.open(DB_NAME, version);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(DB_STORE)) {
                    db.createObjectStore(DB_STORE);
                }
            };
            request.onsuccess = () => {
                const db = request.result;
                if (db.objectStoreNames.contains(DB_STORE)) {
                    dbVersion = db.version;
                    resolve(db);
                    return;
                }
                // A database can sit at the right version and still have no
                // store, if an earlier build created it differently. Asking for
                // the next version is the only thing that runs an upgrade, so
                // that is what puts the store back.
                const next = db.version + 1;
                db.close();
                open(next);
            };
            request.onerror = () => reject(request.error);
        };
        open(dbVersion);
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
const assetKeys = () =>
    withStore("readonly", (store) => store.getAllKeys());

// --- the image library ------------------------------------------------------
// One copy of each picture you have picked, under an id of its own. The
// wallpaper and every preset point at an id, so a look you save twice, or two
// looks that share a wallpaper, cost one file between them.

const imageKey = (id) => `${IMAGE_PREFIX}${id}`;

/**
 * How big a picture is allowed to be before it is made smaller.
 *
 * A wallpaper is scaled to fill the screen, so an 8 MB picture from a phone is
 * mostly pixels nobody ever sees, and every one of them is decoded again on
 * every new tab. Anything at or below this is stored exactly as you picked it,
 * so an ordinary image is never touched.
 */
const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/**
 * The longest edge a stored picture may have, in CSS pixels at 1×.
 *
 * 2560 covers a 1440p screen and a 4K screen at 1.5×, which is as sharp as a
 * background ever looks: it is scaled up and softened either way, and a photo
 * has no detail to lose above the size of the display.
 */
const IMAGE_MAX_EDGE = 2560;

/**
 * What the last pick was made smaller from and to, so the settings menu can say
 * so. Null when the last picture was stored exactly as it was picked, which is
 * the normal case. It remembers which picture it is about, so it stops being
 * relevant the moment something else is on screen.
 */
let lastShrink = null;

/**
 * Re-encodes a picture that is too big, and returns the file to store.
 *
 * The original comes back untouched whenever there is nothing to gain: a
 * picture already under the size limit, or one that cannot be decoded or
 * re-encoded at all. A wallpaper that fails to shrink is still a wallpaper, and
 * losing your picture to save space would be a bad trade.
 *
 * WebP first, because it is the smaller of the two at the quality a background
 * needs, and JPEG as the fallback for a build or a decoder without it. Both
 * keep the alpha channel a screenshot may rely on, which is the reason not to
 * reach for JPEG as the only option.
 */
async function shrinkImage(file) {
    if (!file || file.size <= IMAGE_MAX_BYTES) return file;
    let bitmap;
    try {
        bitmap = await createImageBitmap(file);
    } catch (error) {
        // Not something this browser can decode, so not something it can
        // re-encode either.
        console.warn("Could not read the picture, storing it as it is:", error);
        return file;
    }
    try {
        // A picture already within the screen keeps its own size: making it
        // smaller would only throw away detail the screen can still show.
        const longest = Math.max(bitmap.width, bitmap.height);
        const scale = Math.min(1, IMAGE_MAX_EDGE / longest);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext("2d");
        // Some wallpapers are cut-out PNGs, so the transparency has to survive
        // the trip through a canvas.
        context.imageSmoothingQuality = "high";
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

        const encoded = await new Promise((resolve) =>
            canvas.toBlob(resolve, "image/webp", 0.85),
        );
        const fallback = encoded?.type === "image/webp"
            ? encoded
            : await new Promise((resolve) =>
                  canvas.toBlob(resolve, "image/jpeg", 0.85),
              );
        // A re-encode that came out bigger, which a picture of flat colour can
        // do, is not an improvement. Keep what you picked.
        if (!fallback || fallback.size >= file.size) return file;
        return fallback;
    } catch (error) {
        console.warn("Could not make the picture smaller, storing it as it is:", error);
        return file;
    } finally {
        bitmap.close();
    }
}

const assetExists = (id) =>
    assetGet(imageKey(id)).then((blob) => Boolean(blob), () => false);

/** Deletes a picture, ignoring the failure rather than losing the whole action. */
async function deleteImage(id) {
    if (!id) return;
    try {
        await assetDelete(imageKey(id));
    } catch (error) {
        console.error("Could not delete the stored picture:", error);
    }
}

/** Every id in the library, so a reset can empty it. */
const imageIds = () =>
    assetKeys()
        .then((keys) =>
            keys
                .filter((key) => String(key).startsWith(IMAGE_PREFIX))
                .map((key) => String(key).slice(IMAGE_PREFIX.length)),
        )
        .catch(() => []);

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

/**
 * Accepts a bare CSS gradient such as "linear-gradient(160deg, #2e3440, #436)".
 * Only the gradient functions and a short argument list get through, so a
 * gradient can never carry a url(), a semicolon or anything else into the
 * background-image.
 */
const GRADIENT = /^(?:linear|radial|conic)-gradient\([^()]*\)$/i;

const asGradient = (value) => {
    if (typeof value !== "string" || value.length > 240) return "";
    const trimmed = value.trim();
    return GRADIENT.test(trimmed) ? trimmed : "";
};

const asBool = (value, fallback) =>
    typeof value === "boolean" ? value : fallback;

/** The shape of an id handed out by `newImageId`, and nothing else. */
const IMAGE_ID = /^img-[0-9a-f]{8}$/;

const newImageId = () =>
    `img-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;

/** How many looks you can keep. Each is a handful of strings, so this is roomy. */
const MAX_PRESETS = 24;

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

/**
 * The wallpaper rules, in one place: the live wallpaper and every preset
 * background are filtered the same way, so a preset can never hold something
 * the wallpaper itself would have refused.
 */
function sanitizeWallpaper(input) {
    const source = isPlainObject(input) ? input : {};
    // "file" was the single picked image before the image library, and
    // "default" was the bundled wallpaper, which no longer exists. Anything but
    // a mode this build knows means "no wallpaper".
    const wanted = asEnum(
        source.mode,
        ["none", "image", "url", "gradient"],
        "none",
    );
    const image = asString(source.image, "", 40);
    // A gradient that is not a gradient falls back to no wallpaper, and so
    // does an image id that could not have come from the library.
    const mode =
        wanted === "gradient" && !asGradient(source.gradient)
            ? "none"
            : wanted === "image" && !IMAGE_ID.test(image)
              ? "none"
              : wanted;
    // "lastImage" is the one field that survives a mode change: a preset or a
    // URL puts your picture aside without forgetting which one it was.
    const lastImage = asString(source.lastImage, "", 40);
    return {
        mode,
        image: mode === "image" ? image : "",
        lastImage: IMAGE_ID.test(lastImage) ? lastImage : "",
        url: mode === "url" ? normalizeUrl(source.url) : "",
        gradient: mode === "gradient" ? asGradient(source.gradient) : "",
    };
}

/** A preset is a saved look: colours, panel and background, nothing else. */
function sanitizePreset(input) {
    const source = isPlainObject(input) ? input : {};
    const theme = isPlainObject(source.theme) ? source.theme : {};
    const panel = isPlainObject(source.panel) ? source.panel : {};
    return {
        name: asString(source.name, "", 30).trim() || "Untitled",
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
        },
        panel: {
            opacity: asNumber(panel.opacity, DEFAULTS.panel.opacity, 0, 1),
            blur: asNumber(panel.blur, DEFAULTS.panel.blur, 0, 40),
        },
        // A preset remembers the background it was saved with, never which
        // picture you had picked before it: applying one puts your picture
        // aside, it does not claim that picture as your last pick.
        wallpaper: { ...sanitizeWallpaper(source.wallpaper), lastImage: "" },
    };
}

function sanitize(input) {
    const source = isPlainObject(input) ? input : {};
    const theme = isPlainObject(source.theme) ? source.theme : {};
    const panel = isPlainObject(source.panel) ? source.panel : {};
    const widgets = isPlainObject(source.widgets) ? source.widgets : {};
    const weather = isPlainObject(widgets.weather) ? widgets.weather : {};
    const clock = isPlainObject(widgets.clock) ? widgets.clock : {};
    const layout = isPlainObject(source.layout) ? source.layout : {};

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
        layout: {
            columns: asNumber(layout.columns, 0, 0, 6),
            gap: asNumber(layout.gap, 20, 0, 80),
            panelWidth: asNumber(layout.panelWidth, 0, 0, 1600),
            radius: asNumber(layout.radius, 16, 0, 60),
        },
        wallpaperDim: asNumber(source.wallpaperDim, 0, 0, 0.9),
        wallpaper: sanitizeWallpaper(source.wallpaper),
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
        presets: Array.isArray(source.presets)
            ? source.presets.slice(0, MAX_PRESETS).map(sanitizePreset)
            : [],
        bookmarks: sanitizeBookmarks(source.bookmarks),
    };
}

// --- applying settings to the page -----------------------------------------

const Settings = (() => {
    const root = document.documentElement;
    const listeners = new Set();

    let state = sanitize(DEFAULTS);
    let wallpaperObjectUrl = null;
    let wallpaperObjectImage = "";
    let ready;
    // Told about every write this tab makes, so the storage listener can pick
    // its own echo out from a change made by another tab. Only set when that
    // listener is in use.
    let onWrite = null;

    /**
     * Sets a custom property, and does nothing at all if it already holds that
     * value. Writing a property the value it already has is not free: it dirties
     * the property and the browser recalculates the style of everything that
     * reads it, which for the properties below is the whole page.
     */
    function setVar(name, value) {
        if (root.style.getPropertyValue(name) === value) return;
        root.style.setProperty(name, value);
    }

    /** Wraps a URL in a CSS `url()` that cannot be broken out of. */
    function cssUrl(url) {
        return `url("${url.replace(/["\\\n\r]/g, "")}")`;
    }

    /**
     * Caches the wallpaper in localStorage, as a data URL, so the next tab can
     * paint it before the first paint rather than a frame of flat colour first.
     *
     * The read is fire-and-forget: if it does not land in time, the picture
     * still arrives the ordinary way, one frame later. Nothing depends on it.
     */
    function cacheWallpaper(blob) {
        try {
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    localStorage.setItem(WALLPAPER_CACHE_KEY, cssUrl(reader.result));
                } catch {
                    // Too big for localStorage, or storage is blocked: the cache
                    // is a nicety, so there is nothing to recover from.
                }
            };
            reader.readAsDataURL(blob);
        } catch {
            // No FileReader: nothing cached, nothing lost.
        }
    }

    /** Drops the cached wallpaper, so a tab does not open on a stale picture. */
    function clearWallpaperCache() {
        try {
            localStorage.removeItem(WALLPAPER_CACHE_KEY);
        } catch {
            // Storage is blocked: nothing to clear.
        }
    }

    /**
     * The CSS value for a wallpaper, or an empty string when the picture it
     * points at is not in the library (a preset imported from another profile,
     * or an image deleted by hand).
     */
    async function wallpaperImage(wallpaper) {
        const { mode, url, gradient, image } = wallpaper;
        if (mode === "url" && url) return cssUrl(url);
        if (mode === "gradient" && gradient) return gradient;
        if (mode !== "image" || !image) return "";
        // The picture is already in hand and the URL made for it is still live,
        // so there is nothing to read again. Dragging a slider writes the
        // settings many times a second and none of it is about the picture.
        if (image === wallpaperObjectImage && wallpaperObjectUrl) {
            return cssUrl(wallpaperObjectUrl);
        }
        try {
            const blob = await assetGet(imageKey(image));
            if (!blob) {
                // Gone from the library, so the URL made for it is dead weight.
                if (wallpaperObjectUrl) URL.revokeObjectURL(wallpaperObjectUrl);
                wallpaperObjectUrl = null;
                wallpaperObjectImage = "";
                return "";
            }
            if (wallpaperObjectUrl) URL.revokeObjectURL(wallpaperObjectUrl);
            wallpaperObjectImage = image;
            wallpaperObjectUrl = URL.createObjectURL(blob);
            cacheWallpaper(blob);
            return cssUrl(wallpaperObjectUrl);
        } catch (error) {
            console.error("Could not read the stored wallpaper:", error);
            return "";
        }
    }

    async function applyWallpaper() {
        const image = (await wallpaperImage(state.wallpaper)) || NO_WALLPAPER;
        setVar("--wallpaper", image);
        // Lets the settings button nudge the user until a wallpaper is picked.
        root.dataset.wallpaper = image === NO_WALLPAPER ? "none" : "image";
        // The localStorage cache holds the picture, so it is only worth keeping
        // while a picture is what is on screen. Otherwise the next tab would
        // open on the last picture rather than on what is actually set.
        if (state.wallpaper.mode !== "image" || image === NO_WALLPAPER) {
            clearWallpaperCache();
        }
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
        setVar("--layout-gap", `${state.layout.gap}px`);
        setVar("--layout-radius", `${state.layout.radius}px`);
        // Zero columns means as many as fit, which is no maximum at all.
        setVar(
            "--layout-columns",
            state.layout.columns > 0
                ? `calc(${state.layout.columns} * (var(--category-width) + var(--layout-gap)) - var(--layout-gap))`
                : "none",
        );
        // Zero width lets the panel shrink to whatever the bookmarks need.
        setVar(
            "--layout-panel-width",
            state.layout.panelWidth > 0 ? `${state.layout.panelWidth}px` : "fit-content",
        );
    }

    function notify() {
        for (const listener of listeners) listener(state);
    }

    /** The look on screen, in the shape a preset is saved in. */
    function currentLook() {
        return {
            theme: {
                colorFg: state.theme.colorFg,
                colorTitle: state.theme.colorTitle,
                colorLink: state.theme.colorLink,
                colorLinkHover: state.theme.colorLinkHover,
                colorLinkVisited: state.theme.colorLinkVisited,
                colorWidget: state.theme.colorWidget,
            },
            panel: { ...state.panel },
            wallpaper: { ...state.wallpaper },
        };
    }

    const cleanName = (name) => {
        const text = typeof name === "string" ? name : "";
        return text.replace(/\s+/g, " ").trim().slice(0, 30);
    };

    /** Everything that could still be pointing at a picture. */
    function imageIsUsed(id) {
        if (!id) return false;
        if (state.wallpaper.image === id) return true;
        if (state.wallpaper.lastImage === id) return true;
        return state.presets.some((preset) => preset.wallpaper.image === id);
    }

    /**
     * Deletes a picture nothing points at any more. Call it after the settings
     * have been saved, so "nothing points at it" is judged against the new
     * state rather than the old one.
     */
    async function collectImage(id) {
        if (!id || imageIsUsed(id)) return;
        await deleteImage(id);
    }

    /**
     * Empties the library of pictures nothing points at. Pictures are the only
     * part of your settings that take real space, so a settings file that stops
     * mentioning one should not leave the file itself behind for ever.
     */
    async function collectUnusedImages() {
        for (const id of await imageIds()) await collectImage(id);
    }

    /** The one way this module changes the settings: merge, save, apply, tell. */
    async function commit(patch) {
        state = sanitize(merge(state, patch));
        onWrite?.(state);
        await storageWrite(state);
        await apply();
        notify();
        return state;
    }

    async function apply() {
        applyTheme();
        await applyWallpaper();
    }

    /**
     * Older builds kept the picked image under one fixed key, with no way for a
     * preset to point at it. Moves that image into the library once, on load,
     * so an existing wallpaper survives the upgrade and every preset can
     * reference it.
     */
    async function adoptLegacyWallpaper(stored) {
        if (stored?.wallpaper?.mode !== "file") return stored;
        let blob = null;
        try {
            blob = await assetGet(LEGACY_WALLPAPER_ASSET);
        } catch (error) {
            console.error("Could not read the stored wallpaper:", error);
        }
        const image = blob ? newImageId() : "";
        if (blob) await assetPut(imageKey(image), blob);
        try {
            await assetDelete(LEGACY_WALLPAPER_ASSET);
        } catch (error) {
            console.error("Could not remove the old wallpaper key:", error);
        }
        return merge(stored, {
            wallpaper: {
                mode: blob ? "image" : "none",
                image,
                lastImage: image,
            },
        });
    }

    async function load() {
        try {
            const stored = await storageRead();
            if (stored) {
                const adopted = await adoptLegacyWallpaper(stored);
                state = sanitize(adopted);
                // Only write back if the picture actually moved.
                if (adopted !== stored) await storageWrite(state);
            }
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
        // Every write this tab makes comes back as a change event of its own, and
        // those events do not arrive in the order the writes were made. Adopting
        // the one that started a slider drag puts the settings back to where the
        // drag began, so a change that is exactly something this tab has already
        // written is an echo of our own and is dropped.
        //
        // Another tab writing the very same settings is ignored too, which costs
        // nothing: this tab already holds that state and has already drawn it.
        const mine = new Set();
        const remember = (value) => {
            mine.add(JSON.stringify(value));
            // Only the last few are needed: an echo follows its own write
            // closely, and this is not a history of everything ever saved.
            while (mine.size > 24) {
                mine.delete(mine.values().next().value);
            }
        };
        onWrite = remember;
        browser.storage.onChanged.addListener((changes, area) => {
            if (area !== "local" || !changes[SETTINGS_KEY]) return;
            const next = changes[SETTINGS_KEY].newValue;
            if (!next) return;
            if (mine.has(JSON.stringify(next))) return;
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
            const wallpaper = state.wallpaper;
            let size = null;
            if (wallpaper.mode === "image" && wallpaper.image) {
                try {
                    size = (await assetGet(imageKey(wallpaper.image)))?.size ?? null;
                } catch {
                    size = null;
                }
            }
            // The picture you picked last, if it is still in the library and is
            // not the one already on screen: that is what a preset or a URL put
            // aside, and what the "use my image again" button brings back.
            const restore = Boolean(
                wallpaper.lastImage &&
                    wallpaper.lastImage !== wallpaper.image &&
                    (await assetExists(wallpaper.lastImage)),
            );
            // What the last pick was made smaller from and to, so the menu can
            // say so rather than let the size change quietly. Remembered
            // against the picture it is about, so it stops being relevant the
            // moment something else is on screen.
            const shrink =
                lastShrink?.image === wallpaper.image ? lastShrink : null;
            return { ...wallpaper, size, restore, shrink };
        },
        /**
         * An object URL for a picture in the library, for a preview in the
         * settings menu. Empty when the picture is not there. The caller owns
         * the URL and should revoke it, since the wallpaper's own URL is
         * revoked whenever the wallpaper changes.
         */
        async imageUrl(id) {
            if (!IMAGE_ID.test(id)) return "";
            try {
                const blob = await assetGet(imageKey(id));
                return blob ? URL.createObjectURL(blob) : "";
            } catch {
                return "";
            }
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        /** Merges a patch into the settings, saves and applies it. */
        set(patch) {
            return commit(patch);
        },
        async reset() {
            state = sanitize(DEFAULTS);
            await storageClear();
            // A reset is meant to be a clean slate, so every picture goes with
            // it. Applying a preset is the way to set one aside instead.
            await collectUnusedImages();
            if (wallpaperObjectUrl) {
                URL.revokeObjectURL(wallpaperObjectUrl);
                wallpaperObjectUrl = null;
            }
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
            // An export carries no pictures, so a file that came from another
            // browser leaves the library here to be cleaned out rather than
            // sitting on disk for ever.
            await collectUnusedImages();
            return state;
        },
        // --- wallpaper helpers ---
        /**
         * Stores a picked picture in the image library and puts it on screen.
         * Every pick gets its own id, so two presets that share a wallpaper
         * share one copy of it rather than each keeping their own.
         *
         * A picture far bigger than the screen is made smaller first, so what
         * is stored is what is worth showing rather than every pixel of a phone
         * photo. A normal picture is stored exactly as you picked it.
         */
        async useWallpaperFile(file) {
            if (!file) return;
            if (!file.type.startsWith("image/")) {
                throw new Error("That file is not an image.");
            }
            const picture = await shrinkImage(file);
            const previous = state.wallpaper.image;
            const image = newImageId();
            await assetPut(imageKey(image), picture);
            // What actually got stored, so a large picture that was made
            // smaller can say so instead of quietly changing size.
            lastShrink =
                picture === file
                    ? null
                    : { image, from: file.size, to: picture.size };
            state = sanitize(
                merge(state, {
                    wallpaper: { mode: "image", image, lastImage: image },
                }),
            );
            await storageWrite(state);
            await apply();
            notify();
            await collectImage(previous);
        },
        async useWallpaperUrl(url) {
            const normalized = normalizeUrl(url);
            if (!normalized) throw new Error("That does not look like a URL.");
            const previous = state.wallpaper.image;
            state = sanitize(
                merge(state, { wallpaper: { mode: "url", url: normalized } }),
            );
            await storageWrite(state);
            await apply();
            notify();
            await collectImage(previous);
        },
        /**
         * Takes the current background away, and forgets the picture behind it,
         * so the file is deleted once no preset needs it any more. Applying a
         * preset is the way to set your picture aside instead of losing it.
         */
        async clearWallpaper() {
            const previous = state.wallpaper.image;
            state = sanitize(
                merge(state, {
                    wallpaper: {
                        mode: "none",
                        image: "",
                        lastImage: "",
                        url: "",
                        gradient: "",
                    },
                }),
            );
            await storageWrite(state);
            await apply();
            notify();
            if (wallpaperObjectUrl) {
                URL.revokeObjectURL(wallpaperObjectUrl);
                wallpaperObjectUrl = null;
            }
            await collectImage(previous);
        },
        /**
         * Puts the picture you picked last back on screen. Applying a preset or
         * switching to a URL only sets it aside, so this brings it back without
         * re-picking the file.
         */
        async restoreWallpaper() {
            const image = state.wallpaper.lastImage;
            if (!image) throw new Error("There is no image to bring back.");
            state = sanitize(merge(state, { wallpaper: { mode: "image", image } }));
            await storageWrite(state);
            await apply();
            notify();
        },
        // --- presets ---
        /**
         * Saves the look on screen as a preset: the six colours, how much the
         * panel shows through, and the background. Everything else you have set
         * up, fonts and bookmarks included, is left as it is.
         */
        async savePreset(name) {
            if (state.presets.length >= MAX_PRESETS) {
                throw new Error(
                    `There is room for ${MAX_PRESETS} presets. Delete one first.`,
                );
            }
            const preset = { ...currentLook(), name: cleanName(name) };
            await commit({ presets: [...state.presets, preset] });
            return preset;
        },
        /** Overwrites a preset with the look on screen, keeping its name. */
        async updatePreset(index) {
            const existing = state.presets[index];
            if (!existing) throw new Error("There is no preset at that position.");
            const presets = state.presets.slice();
            presets[index] = { ...currentLook(), name: existing.name };
            const previous = existing.wallpaper.image;
            await commit({ presets });
            await collectImage(previous);
            return presets[index];
        },
        async renamePreset(index, name) {
            const existing = state.presets[index];
            if (!existing) throw new Error("There is no preset at that position.");
            const presets = state.presets.slice();
            presets[index] = { ...existing, name: cleanName(name) };
            await commit({ presets });
            return presets[index];
        },
        async deletePreset(index) {
            const existing = state.presets[index];
            if (!existing) throw new Error("There is no preset at that position.");
            const presets = state.presets.slice();
            presets.splice(index, 1);
            const forgotten = existing.wallpaper.image;
            await commit({ presets });
            await collectImage(forgotten);
        },
        /**
         * Applies a preset: every colour, the panel and the background it was
         * saved with, so the two can never drift apart. Anything a preset does
         * not mention, such as the font sizes or the bookmarks, is left alone.
         *
         * Your own picture is only set aside, never deleted, and the wallpaper
         * tab can still bring it back. A preset whose picture is not in the
         * library, one imported from another browser for instance, keeps the
         * background already on screen rather than blanking it.
         */
        async applyPreset(preset) {
            const look = preset?.theme ? sanitizePreset(preset) : null;
            if (!look) throw new Error("That is not a theme preset.");
            const wallpaper =
                look.wallpaper.mode === "image" &&
                !(await assetExists(look.wallpaper.image))
                    ? state.wallpaper
                    : look.wallpaper;
            await commit({
                theme: look.theme,
                panel: look.panel,
                // The preset brings back the background it was saved with, while
                // the pointer to the picture you picked last is yours and stays.
                wallpaper: {
                    ...wallpaper,
                    lastImage: state.wallpaper.lastImage,
                },
            });
            return look;
        },
    };
})();

// Also on window, so it can be poked at from the devtools console.
window.Settings = Settings;
