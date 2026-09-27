# Startpage

Feel free to fork and make your own changes!

![screenshot](startpage-nocity.jpg)

A Firefox new tab / homepage override. Vanilla HTML, CSS and JavaScript, no
build step: the folder in `magrid-startpage-extension/` is the extension.

## Settings menu

The start page has a gear button in the bottom right corner, and pressing `s`
opens the same menu. Everything in it is stored by the browser
(`storage.local`) and the wallpaper image in IndexedDB, so **you never have to
edit code and resubmit to addons.mozilla.org to change how it looks**. Settings
survive extension updates.

| Tab | What it does |
| --- | --- |
| Appearance | Colours for text, category titles, bookmarks (normal, hover, visited) and the clock/weather widgets. Font family and sizes. Panel opacity and backdrop blur. |
| Wallpaper | Pick a local image, use an image URL, or go back to the bundled `wallpaper.png`. A slider darkens the wallpaper behind the text. |
| Widgets | Show/hide the clock and the weather, 12/24 hour format, weather city and OpenWeatherMap API key. |
| Bookmarks | Add, rename, delete, reorder and edit categories and bookmarks. Drag to reorder, or use the arrow buttons. Dropping a bookmark on another category moves it. |
| Data | Export/import the whole configuration as JSON, or reset to defaults. |

Colours, blur, opacity and font sizes apply live, so you can see the effect
while the menu is open.

Notes:

- Settings live in the browser profile. Uninstalling the extension deletes
  them, so use **Data → Export** to keep a copy (and to move your setup
  between a temporary install and a signed one).
- A picked wallpaper is stored as a blob, not in the JSON export. An image URL
  is exported, the image behind it is not.
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
| `settings.css` | Styling for the settings menu. |
| `style.css` | The start page itself. Colours, fonts and opacities are CSS variables with the defaults in `:root`. |
| `clock.js`, `weather.js`, `greeting.js` | Widgets. Clock and weather read the settings menu. |

To add a new setting: add the key to `DEFAULTS` and to `sanitize()` in
`settings.js`, add a `--variable` default to `:root` in `style.css`, apply it
in `applyTheme()`, then add an input with `data-setting="your.key"` in
`index.html`. No other wiring needed.
