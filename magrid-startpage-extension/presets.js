// ---------------------------------------------------------------------------
// Theme presets.
//
// Each one is a complete look: the six colours, how much the frosted panel
// shows through, and the background it was designed for. Picking one sets all
// of it at once, instead of nudging six colour pickers and hoping they agree.
//
// The backgrounds are plain CSS gradients rather than images, which keeps the
// package small, needs no network and no extra permission, and never shows up
// as a broken picture. A preset never deletes an image you picked yourself: it
// only sets it aside, and the Wallpaper tab offers to bring it back.
//
// Fonts, sizes, the greeting and the bookmarks are not part of a preset, so
// applying one leaves your own settings for those alone.
// ---------------------------------------------------------------------------

const Presets = [
    {
        id: "nord",
        name: "Nord",
        theme: {
            colorFg: "#d8dee9",
            colorTitle: "#88c0d0",
            colorLink: "#81a1c1",
            colorLinkHover: "#ebcb8b",
            colorLinkVisited: "#b48ead",
            colorWidget: "#eceff4",
        },
        panel: { opacity: 0.5, blur: 10 },
        wallpaper: "linear-gradient(160deg, #2e3440 0%, #3b4252 55%, #434c5e 100%)",
    },
    {
        id: "dracula",
        name: "Dracula",
        theme: {
            colorFg: "#f8f8f2",
            colorTitle: "#bd93f9",
            colorLink: "#8be9fd",
            colorLinkHover: "#ffb86c",
            colorLinkVisited: "#ff79c6",
            colorWidget: "#f1fa8c",
        },
        panel: { opacity: 0.45, blur: 12 },
        wallpaper: "linear-gradient(160deg, #282a36 0%, #35384a 55%, #44475a 100%)",
    },
    {
        id: "solarized-dark",
        name: "Solarized dark",
        theme: {
            colorFg: "#93a1a1",
            colorTitle: "#268bd2",
            colorLink: "#2aa198",
            colorLinkHover: "#b58900",
            colorLinkVisited: "#6c71c4",
            colorWidget: "#eee8d5",
        },
        panel: { opacity: 0.6, blur: 8 },
        wallpaper: "linear-gradient(160deg, #002b36 0%, #04303c 55%, #073642 100%)",
    },
    {
        id: "solarized-light",
        name: "Solarized light",
        theme: {
            colorFg: "#657b83",
            colorTitle: "#268bd2",
            colorLink: "#2aa198",
            colorLinkHover: "#b58900",
            colorLinkVisited: "#6c71c4",
            colorWidget: "#586e75",
        },
        panel: { opacity: 0.82, blur: 8 },
        wallpaper: "linear-gradient(160deg, #fdf6e3 0%, #f5efdc 55%, #eee8d5 100%)",
    },
    {
        id: "amoled",
        name: "Amoled black",
        theme: {
            colorFg: "#d0d0d0",
            colorTitle: "#ffffff",
            colorLink: "#7aa2f7",
            colorLinkHover: "#bb9af7",
            colorLinkVisited: "#9ece6a",
            colorWidget: "#ffffff",
        },
        panel: { opacity: 0.3, blur: 6 },
        wallpaper: "linear-gradient(180deg, #000000 0%, #070709 60%, #0a0a0c 100%)",
    },
];

window.Presets = Presets;
