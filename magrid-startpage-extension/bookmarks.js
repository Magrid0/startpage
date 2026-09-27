// ---------------------------------------------------------------------------
// Bookmarks: model helpers plus the renderer for the start page itself.
//
// The category/link list is rendered from the settings object, so the editor
// in the settings menu and the page always show the same data. The generated
// markup mirrors what used to be hardcoded in index.html so the layout is
// unchanged.
// ---------------------------------------------------------------------------

const Bookmarks = (() => {
    const getBookmarks = () => Settings.get().bookmarks;

    /** Persists a new bookmark list and lets listeners repaint. */
    function commit(bookmarks) {
        return Settings.set({ bookmarks });
    }

    function cloneBookmarks() {
        return getBookmarks().map((category) => ({
            name: category.name,
            links: category.links.map((link) => ({ ...link })),
        }));
    }

    // --- rendering ---------------------------------------------------------

    function buildLink(link) {
        const item = document.createElement("li");
        const anchor = document.createElement("a");
        anchor.href = link.url;
        anchor.textContent = link.title || link.url;
        anchor.title = link.url;
        item.append(anchor);
        return item;
    }

    function buildCategory(category) {
        const wrapper = document.createElement("div");
        wrapper.className = "category";

        const list = document.createElement("div");
        list.className = "links";

        const title = document.createElement("li");
        title.className = "title";
        title.textContent = category.name;
        list.append(title);

        // A bookmark still missing its URL is skipped rather than rendered as a
        // link back to this page.
        for (const link of category.links) {
            if (link.url) list.append(buildLink(link));
        }

        wrapper.append(list);
        return wrapper;
    }

    function render() {
        const host = document.getElementById("bookmarks");
        if (!host) return;
        host.textContent = "";
        for (const category of getBookmarks()) {
            host.append(buildCategory(category));
        }
    }

    // --- category operations ----------------------------------------------

    function addCategory(name = "new category") {
        const bookmarks = cloneBookmarks();
        bookmarks.push({ name, links: [] });
        return commit(bookmarks);
    }

    function renameCategory(index, name) {
        const bookmarks = cloneBookmarks();
        if (!bookmarks[index]) return Promise.resolve();
        bookmarks[index].name = name;
        return commit(bookmarks);
    }

    function removeCategory(index) {
        const bookmarks = cloneBookmarks();
        if (!bookmarks[index]) return Promise.resolve();
        bookmarks.splice(index, 1);
        return commit(bookmarks);
    }

    /** Moves a category from one position to another. */
    function moveCategory(from, to) {
        const bookmarks = cloneBookmarks();
        if (from < 0 || from >= bookmarks.length) return Promise.resolve();

        const [moved] = bookmarks.splice(from, 1);
        // Clamped, because a negative index would wrap around and move the
        // wrong category.
        const target = Math.min(Math.max(to, 0), bookmarks.length);
        if (target === from) return Promise.resolve();

        bookmarks.splice(target, 0, moved);
        return commit(bookmarks);
    }

    // --- link operations ---------------------------------------------------

    function addLink(categoryIndex, link = { title: "new link", url: "" }) {
        const bookmarks = cloneBookmarks();
        if (!bookmarks[categoryIndex]) return Promise.resolve();
        bookmarks[categoryIndex].links.push({ ...link });
        return commit(bookmarks);
    }

    function updateLink(categoryIndex, linkIndex, changes) {
        const bookmarks = cloneBookmarks();
        const target = bookmarks[categoryIndex]?.links[linkIndex];
        if (!target) return Promise.resolve();
        Object.assign(target, changes);
        return commit(bookmarks);
    }

    function removeLink(categoryIndex, linkIndex) {
        const bookmarks = cloneBookmarks();
        const links = bookmarks[categoryIndex]?.links;
        if (!links || !links[linkIndex]) return Promise.resolve();
        links.splice(linkIndex, 1);
        return commit(bookmarks);
    }

    /** Moves a link inside its own category. */
    function moveLink(categoryIndex, from, to) {
        const bookmarks = cloneBookmarks();
        const links = bookmarks[categoryIndex]?.links;
        if (!links || from < 0 || from >= links.length) return Promise.resolve();

        const [moved] = links.splice(from, 1);
        const target = Math.min(Math.max(to, 0), links.length);
        if (target === from) return Promise.resolve();

        links.splice(target, 0, moved);
        return commit(bookmarks);
    }

    return {
        render,
        addCategory,
        renameCategory,
        removeCategory,
        moveCategory,
        addLink,
        updateLink,
        removeLink,
        moveLink,
    };
})();

// Repaint whenever the stored bookmarks actually change, but ignore colour or
// slider tweaks that only touch the theme.
let snapshot = "";

Settings.subscribe((state) => {
    const next = JSON.stringify(state.bookmarks);
    if (next === snapshot) return;
    snapshot = next;
    Bookmarks.render();
});

Settings.ready.then(() => {
    snapshot = JSON.stringify(Settings.get().bookmarks);
    Bookmarks.render();
});
