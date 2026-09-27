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
| Presets | Your saved looks as a gallery: save the look on screen under a name, then click a card to bring it back, update it, rename it or delete it. Five starter looks sit below the gallery. |
| Appearance | Colours for text, category titles, bookmarks (normal, hover, visited) and the clock/weather widgets. Font family and sizes. Panel opacity and backdrop blur. Layout: columns, spacing, panel width, corner rounding. Your name and the greeting wording. |
| Wallpaper | Pick a local image or use an image URL, and remove it again. A picked image that something else has replaced can be brought back with one button. A slider darkens the wallpaper behind the text. |
| Widgets | Show/hide the clock and the weather, 12/24 hour format, weather city and OpenWeatherMap API key. |
| Bookmarks | Add, rename, delete, reorder and edit categories and bookmarks. Drag to reorder, or use the arrow buttons. Dropping a bookmark on another category moves it. |
| Data | Export/import the whole configuration as JSON, or reset to defaults. |

Colours, blur, opacity and font sizes apply live, so you can see the effect
while the menu is open.

**No wallpaper is bundled.** The whole extension is about 120 kB, and the page
starts on a flat background colour until you pick a picture in the Wallpaper
tab. While there is no wallpaper, the gear button pulses gently to point at it.

## Presets

The Presets tab is the first one you see, because switching between looks is the
thing you do most.

**Your own looks.** Set up a look you like, type a name above the gallery and
save it. It turns up as a card showing what that look actually looks like: its
background, the panel sitting on it, and a few words in its own colours. From
there a card is `Use it`, `Update` (overwrite it with the look on screen right
now), or `Delete`. The name field on the card is the rename, so there is no
dialog to keep in step with the gallery.

A preset captures the colours, the panel and the background, and deliberately
nothing else. Your fonts, sizes, greeting and bookmarks are not part of one and
are left alone, so a look can never drag your page out of shape.

**One picture, however many looks want it.** Every image you pick goes into a
library in IndexedDB under an id of its own, and a preset points at that id
rather than holding a copy. Two looks that share a wallpaper cost one file
between them. A picture nothing points at any more is deleted for you, so the
library does not grow quietly. The one exception is deliberate: applying a
preset only *sets aside* the picture you had, and the Wallpaper tab brings it
back with one button. Removing the wallpaper is how you really delete it.

A picture preset copied from another browser has no file here, so that card says
so and keeps the background you already have rather than blanking the page.

**Starter looks.** Nord, Dracula, Solarized dark, Solarized light and Amoled
black are the five looks that ship with the extension, drawn as chips of their
own backgrounds below the gallery. They are plain CSS gradients, not images, so
they cost the package nothing, ask for no permission and cannot fail to load.
Use one as it is, or change the colours and save the result as your own.

That list is data, not markup: add an entry to `PRESETS` in `presets.js` and a
chip appears. Starter looks and your own go through the same validation and the
same code to apply, so they behave identically.

Presets are stored in the settings JSON and travel with an export. The
pictures do not: an export carries the colours, the panel and *which* image each
preset used, and importing it on another browser leaves the cards marked as
missing their picture rather than failing.

## Layout

Appearance → Layout has four sliders:

- **Bookmark columns** — the categories wrap onto as many rows as they need.
  Left at `any` they stay in one row for as long as they fit, which is what the
  extension has always done.
- **Space between them** — the gap the column count is built from, so the two
  work together.
- **Panel width** — `fits` hugs the bookmarks as they are; a number pins the
  width however many bookmarks are in it. The padding is included, so the
  number is the width you actually see.
- **Corner rounding** — including `0` for square corners.

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
  An image URL is exported, the image behind it is not. A gradient background is
  plain text, so it exports like everything else.
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
| `settings-ui.js` | The settings menu: forms, preset buttons, bookmark editor, import/export. |
| `presets.js` | The theme presets: colours, panel and background for each one. Data only. |
| `bookmarks.js` | Bookmark model and rendering of the categories. |
| `filter.js` | Type to filter the bookmark list on the page. |
| `settings.css` | Styling for the settings menu. |
| `style.css` | The start page itself. Colours, fonts, opacities and layout are CSS variables with the defaults in `:root`. |
| `clock.js`, `weather.js`, `greeting.js` | Widgets. All three read the settings menu. |

To add a new setting: add the key to `DEFAULTS` and to `sanitize()` in
`settings.js`, add a `--variable` default to `:root` in `style.css`, apply it
in `applyTheme()`, then add an input with `data-setting="your.key"` in
`index.html`. No other wiring needed. A setting that is not a CSS variable (the
name, the clock format, whether a widget is on) is read by its widget through
`Settings.get()` and repainted through `Settings.subscribe`.

Values arriving from a settings file are all filtered by `sanitize()`, which is
why a bad value falls back to the default instead of reaching the page. The
wallpaper gradient is the one place a free-form string goes straight into a CSS
property, so it is checked against a whitelist of gradient functions first.
