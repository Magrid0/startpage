# Startpage

Feel free to fork and make your own changes!

![screenshot](startpage-nocity.jpg)

A Firefox new tab / homepage override. Vanilla HTML, CSS and JavaScript, no
build step: the folder in `magrid-startpage-extension/` is the extension.

## Settings menu

The start page has a gear button in the bottom right corner, and `shift` + `s`
opens the same menu. Everything in it is stored by the browser
(`storage.local`) and the wallpaper image in IndexedDB, so **you never have to
edit code and resubmit to addons.mozilla.org to change how it looks**. Settings
survive extension updates.

| Tab | What it does |
| --- | --- |
| Appearance | Colours for text, category titles, bookmarks (normal, hover, visited) and the clock/weather widgets. Font family and sizes. Panel opacity and backdrop blur. Your name and the greeting wording. |
| Wallpaper | Pick a local image or use an image URL, and remove it again. A slider darkens the wallpaper behind the text. |
| Widgets | Show/hide the clock and the weather, 12/24 hour format, weather city and OpenWeatherMap API key. |
| Bookmarks | Add, rename, delete, reorder and edit categories and bookmarks. Drag to reorder, or use the arrow buttons. Dropping a bookmark on another category moves it. |
| Data | Export/import the whole configuration as JSON, or reset to defaults. |

Colours, blur, opacity and font sizes apply live, so you can see the effect
while the menu is open.

**No wallpaper is bundled.** The whole extension is about 120 kB, and the page
starts on a flat background colour until you pick a picture in the Wallpaper
tab. While there is no wallpaper, the gear button pulses gently to point at it.

## The greeting

Appearance → Greeting has your name and a wording template. `{greeting}` becomes
good morning, afternoon, evening or night, and `{name}` is the name:

```
{greeting}, {name}.        Good evening, Magrid.
Hi {name}, the time is {greeting}.    Hi Magrid, the time is Good evening.
Hello!                    Hello!  (constant, no time awareness)
                          (blank: no greeting at all)
```

## Filtering bookmarks

Start typing anywhere on the page, or press `/`, and the list narrows to the
bookmarks whose title or address matches, with the matched part highlighted and
a count beside the box. Categories with nothing left in them are hidden.
`escape` clears the filter, and a second `escape` puts the list back. Nothing is
stored, so a reload always starts whole.

Lower case letters are all free for this, which is why the settings menu is on
`shift` + `s` and not `s`.

Notes:

- Settings live in the browser profile. Uninstalling the extension deletes
  them, so use **Data → Export** to keep a copy (and to move your setup
  between a temporary install and a signed one).
- A picked wallpaper is stored as a blob in IndexedDB, not in the JSON export
  (`storage.local` only has a few MB to spend, and base64 inflates by a third).
  An image URL is exported, the image behind it is not.
- The weather city is looked up through OpenWeatherMap's geocoding API, so
  changing it needs a network connection. The first lookup is cached with its
  coordinates.

## Development

Load `magrid-startpage-extension/` as a temporary add-on
(`about:debugging` → *This Firefox* → *Load Temporary Add-on…*) and tick
**Allow access to file URLs** if you want to point the picker at local images.

`./update-zip.sh` zips the extension folder into
`magrid-startpage-extension.zip`, which is what gets uploaded to
addons.mozilla.org, then commits and pushes whatever changed.

Files:

| File | Role |
| --- | --- |
| `settings.js` | Settings schema, defaults, persistence, wallpaper storage, applying values as CSS variables. |
| `settings-ui.js` | The settings menu: forms, bookmark editor, import/export. |
| `bookmarks.js` | Bookmark model and rendering of the categories. |
| `filter.js` | Type to filter the bookmark list on the page. |
| `settings.css` | Styling for the settings menu. |
| `style.css` | The start page itself. Colours, fonts and opacities are CSS variables with the defaults in `:root`. |
| `clock.js`, `weather.js`, `greeting.js` | Widgets. All three read the settings menu. |

To add a new setting: add the key to `DEFAULTS` and to `sanitize()` in
`settings.js`, add a `--variable` default to `:root` in `style.css`, apply it
in `applyTheme()`, then add an input with `data-setting="your.key"` in
`index.html`. No other wiring needed. A setting that is not a CSS variable (the
name, the clock format, whether a widget is on) is read by its widget through
`Settings.get()` and repainted through `Settings.subscribe`.
