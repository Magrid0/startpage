// Runs while the page is still parsing, before the first paint.
//
// A new tab otherwise opens on a frame of flat colour: the stylesheet's
// --wallpaper is a transparent layer until the settings and the picture come
// back from storage, which is a frame or two after the page has already
// painted. The picture is cached in localStorage (see settings.js) precisely so
// it can be read this early, which lets the first paint be the wallpaper.
//
// This is a cache read, not a load: if it is missing or storage is blocked,
// the picture still arrives the ordinary way, one frame later.
try {
    const cached = localStorage.getItem("startpage.wallpaper");
    if (cached) {
        document.documentElement.style.setProperty("--wallpaper", cached);
    }
} catch {
    // No localStorage (private mode, or storage blocked): nothing to apply.
}
