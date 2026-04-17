/*
 * Pokédex Binder – app.js
 *
 * Loads Pokémon data from the bundled data/pokemon.json and renders a
 * paginated grid of placeholder cards, each showing:
 *   – National Pokédex number
 *   – Official front sprite
 *   – Name
 *   – Type badge(s)
 */

'use strict';

// ── Configuration ──────────────────────────────────────────────────────────
const TOTAL_POKEMON = 1025;   // National Dex count through Gen 9
const PER_PAGE      = 50;     // Cards rendered per page
const SPRITE_BASE   =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
const API_BASE      = 'https://pokeapi.co/api/v2/pokemon/';
const DATA_URL      = 'data/pokemon.json';

/** Primary type used for the coloured card stripe */
const PRIMARY_TYPE_COLOURS = {
  normal:   '#A8A878', fire:     '#F08030', water:    '#6890F0',
  electric: '#F8D030', grass:    '#78C850', ice:      '#98D8D8',
  fighting: '#C03028', poison:   '#A040A0', ground:   '#E0C068',
  flying:   '#A890F0', psychic:  '#F85888', bug:      '#A8B820',
  rock:     '#B8A038', ghost:    '#705898', dragon:   '#7038F8',
  dark:     '#705848', steel:    '#B8B8D0', fairy:    '#EE99AC',
};

// Generation ID ranges (inclusive)
const GEN_RANGES = {
  1: [1,   151],
  2: [152, 251],
  3: [252, 386],
  4: [387, 493],
  5: [494, 649],
  6: [650, 721],
  7: [722, 809],
  8: [810, 905],
  9: [906, 1025],
};

const GEN_LABELS = {
  1: 'Gen I',
  2: 'Gen II',
  3: 'Gen III',
  4: 'Gen IV',
  5: 'Gen V',
  6: 'Gen VI',
  7: 'Gen VII',
  8: 'Gen VIII',
  9: 'Gen IX',
};

// ── State ──────────────────────────────────────────────────────────────────
let currentPage   = 1;
let activeIds     = [];      // The filtered/full list of dex IDs being paged
let searchQuery   = '';
let selectedGen   = 'all';
let isPrintMode   = false;

// Simple in-memory cache so navigating back/forward doesn't re-fetch
const cache = new Map();

// ── DOM references ─────────────────────────────────────────────────────────
const cardGrid       = document.getElementById('card-grid');
const paginationTop  = document.getElementById('pagination-top');
const paginationBot  = document.getElementById('pagination-bottom');
const searchInput    = document.getElementById('search');
const genSelect      = document.getElementById('gen-select');
const printBtn       = document.getElementById('print-btn');

// ── Boot ───────────────────────────────────────────────────────────────────
// Pre-load the bundled data file so all page navigations are instant.
let bundledData = null; // set once the JSON loads

loadBundledData().then(() => {
  buildActiveIds();
  renderPage();
});

// ── Event listeners ────────────────────────────────────────────────────────
searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  currentPage = 1;
  buildActiveIds();
  renderPage();
});

genSelect.addEventListener('change', () => {
  selectedGen = genSelect.value;
  currentPage = 1;
  buildActiveIds();
  renderPage();
});

printBtn.addEventListener('click', async () => {
  await printAllSelected();
});

window.addEventListener('afterprint', () => {
  if (isPrintMode) {
    isPrintMode = false;
    renderPage();
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────

/** Rebuild the list of active Pokémon IDs from the current filters. */
function buildActiveIds() {
  let ids = Array.from({ length: TOTAL_POKEMON }, (_, i) => i + 1);

  // Generation filter
  if (selectedGen !== 'all') {
    const [lo, hi] = GEN_RANGES[selectedGen];
    ids = ids.filter(id => id >= lo && id <= hi);
  }

  // Search filter (requires cached data for name searches)
  if (searchQuery) {
    const numeric = parseInt(searchQuery.replace('#', ''), 10);
    if (!isNaN(numeric)) {
      ids = ids.filter(id => id === numeric);
    } else {
      // Name match — only filter IDs we've already cached
      ids = ids.filter(id => {
        const p = cache.get(id) || (bundledData ? bundledData.get(id) : null);
        if (!p) return true; // keep uncached; fetch later
        return p.name.includes(searchQuery);
      });
    }
  }

  activeIds = ids;
}

/** Total number of pages given current filters. */
function totalPages() {
  return Math.max(1, Math.ceil(activeIds.length / PER_PAGE));
}

/** Return a readable generation label for a dex ID. */
function generationLabel(id) {
  for (const [gen, [lo, hi]] of Object.entries(GEN_RANGES)) {
    if (id >= lo && id <= hi) return GEN_LABELS[gen];
  }
  return 'Unknown';
}

/** IDs for the currently visible page. */
function pageIds() {
  const start = (currentPage - 1) * PER_PAGE;
  return activeIds.slice(start, start + PER_PAGE);
}

/** Wait until visible card sprites have loaded before printing. */
function waitForCardImages() {
  const images = Array.from(cardGrid.querySelectorAll('img'));
  return Promise.all(images.map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise(resolve => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    });
  }));
}

/** Render all currently selected Pokémon, then open the print dialog. */
async function printAllSelected() {
  const originalLabel = printBtn.textContent;
  printBtn.disabled = true;
  printBtn.textContent = 'Preparing print…';

  try {
    buildActiveIds();
    showLoading(`Preparing ${activeIds.length} selected Pokémon for print…`);

    const results = await Promise.all(activeIds.map(fetchPokemon));
    isPrintMode = true;
    paintCards(results);

    await new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    );
    await waitForCardImages();

    window.print();
  } catch {
    isPrintMode = false;
    showError('Failed to prepare the selected Pokémon for printing. Please try again.');
    renderPage();
  } finally {
    printBtn.disabled = false;
    printBtn.textContent = originalLabel;
  }
}

// ── Data loading ───────────────────────────────────────────────────────────

/**
 * Fetch and index the bundled data/pokemon.json file.
 * Falls back gracefully if the file cannot be loaded.
 */
async function loadBundledData() {
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();
    bundledData = new Map(list.map(p => [p.id, p]));
  } catch {
    bundledData = new Map(); // empty map — will fall back to PokeAPI
  }
}

// ── Fetch ──────────────────────────────────────────────────────────────────

/**
 * Return a single Pokémon by national dex ID.
 * Prefers the bundled JSON, then the in-memory cache, then PokeAPI.
 * Returns { id, name, types: string[], spriteUrl: string|null }.
 */
async function fetchPokemon(id) {
  if (cache.has(id)) return cache.get(id);

  // 1. Try the bundled data file
  if (bundledData && bundledData.has(id)) {
    const p = bundledData.get(id);
    const pokemon = {
      id,
      name: p.name,
      types: p.types,
      spriteUrl: `${SPRITE_BASE}${id}.png`,
    };
    cache.set(id, pokemon);
    return pokemon;
  }

  // 2. Fall back to the live PokeAPI
  try {
    const res = await fetch(`${API_BASE}${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const pokemon = {
      id,
      name: data.name,
      types: data.types.map(t => t.type.name),
      spriteUrl: data.sprites.front_default || `${SPRITE_BASE}${id}.png`,
    };

    cache.set(id, pokemon);
    return pokemon;
  } catch {
    // 3. Ultimate fallback: show number only
    const fallback = {
      id,
      name: `#${String(id).padStart(4, '0')}`,
      types: [],
      spriteUrl: `${SPRITE_BASE}${id}.png`,
    };
    cache.set(id, fallback);
    return fallback;
  }
}

// ── Render ─────────────────────────────────────────────────────────────────

/** Main render function — shows the loading state, fetches, then paints. */
async function renderPage() {
  showLoading();
  renderPagination();

  const ids = pageIds();

  // Fetch all Pokémon for this page concurrently
  let results;
  try {
    results = await Promise.all(ids.map(fetchPokemon));
  } catch {
    showError('Failed to load Pokémon data. Please check your connection and try again.');
    return;
  }

  // If a name-based search was active we now have the data — refilter
  if (searchQuery && isNaN(parseInt(searchQuery.replace('#', ''), 10))) {
    buildActiveIds();
    renderPagination();
    const refiltered = pageIds();
    results = refiltered.map(id => cache.get(id)).filter(Boolean);
  }

  paintCards(results);
}

/** Replace the card grid content with rendered cards. */
function paintCards(pokemons) {
  cardGrid.innerHTML = '';

  if (pokemons.length === 0) {
    cardGrid.innerHTML =
      '<p class="error-msg">No Pokémon found matching your search.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  pokemons.forEach(p => fragment.appendChild(buildCard(p)));
  cardGrid.appendChild(fragment);
}

/** Build a single card DOM element. */
function buildCard(pokemon) {
  const { id, name, types, spriteUrl } = pokemon;

  const primaryType   = types[0] || 'normal';
  const stripeColour  = PRIMARY_TYPE_COLOURS[primaryType] || '#ccc';
  const dexNumber     = `#${String(id).padStart(4, '0')}`;
  const displayName   = name.replace(/-/g, ' ');
  const genText       = generationLabel(id);

  const card = document.createElement('div');
  card.className = 'card';
  card.style.setProperty('--type-stripe', stripeColour);
  card.setAttribute('data-id', id);
  card.setAttribute('title', `${dexNumber} ${displayName}`);

  // Top metadata row
  const metaEl = document.createElement('div');
  metaEl.className = 'card-meta';

  const dexEl = document.createElement('span');
  dexEl.className = 'card-dex';
  dexEl.textContent = dexNumber;

  const metaRightEl = document.createElement('div');
  metaRightEl.className = 'card-meta-right';

  const genEl = document.createElement('span');
  genEl.className = 'card-gen';
  genEl.textContent = genText;

  const ballEl = document.createElement('span');
  ballEl.className = 'card-ball';
  ballEl.setAttribute('aria-hidden', 'true');

  metaRightEl.append(genEl, ballEl);
  metaEl.append(dexEl, metaRightEl);
  card.appendChild(metaEl);

  // Sprite art area
  const artEl = document.createElement('div');
  artEl.className = 'card-art';

  const artBallEl = document.createElement('span');
  artBallEl.className = 'card-ball card-ball-watermark';
  artBallEl.setAttribute('aria-hidden', 'true');
  artEl.appendChild(artBallEl);

  if (spriteUrl) {
    const img = document.createElement('img');
    img.className = 'card-sprite';
    img.src = spriteUrl;
    img.alt = displayName;
    img.loading = isPrintMode ? 'eager' : 'lazy';
    img.onerror = () => {
      img.replaceWith(missingSprite());
    };
    artEl.appendChild(img);
  } else {
    artEl.appendChild(missingSprite());
  }

  card.appendChild(artEl);

  // Name
  const nameEl = document.createElement('span');
  nameEl.className = 'card-name';
  nameEl.textContent = displayName;
  card.appendChild(nameEl);

  // Type badges
  if (types.length > 0) {
    const typesEl = document.createElement('div');
    typesEl.className = 'card-types';
    types.forEach(type => {
      const badge = document.createElement('span');
      badge.className = `type-badge type-${type}`;
      badge.textContent = type;
      typesEl.appendChild(badge);
    });
    card.appendChild(typesEl);
  }

  return card;
}

/** Fallback element shown when a sprite image fails to load. */
function missingSprite() {
  const el = document.createElement('div');
  el.className = 'card-sprite-missing';
  el.textContent = '?';
  return el;
}

/** Show the animated loading indicator. */
function showLoading(message = 'Loading Pokémon…') {
  cardGrid.innerHTML =
    '<div class="loading">' +
      '<div class="pokeball-spinner"></div>' +
      `<p>${message}</p>` +
    '</div>';
}

/** Show an error message inside the grid. */
function showError(msg) {
  cardGrid.innerHTML = `<p class="error-msg">${msg}</p>`;
}

// ── Pagination ─────────────────────────────────────────────────────────────

/** Render pagination controls in both nav elements. */
function renderPagination() {
  const pages = totalPages();
  const html  = buildPaginationHTML(pages);
  paginationTop.innerHTML = html;
  paginationBot.innerHTML = html;

  // Attach event listeners (both top and bottom navs)
  [paginationTop, paginationBot].forEach(nav => {
    nav.querySelectorAll('button[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = parseInt(btn.dataset.page, 10);
        if (!isNaN(p) && p !== currentPage) {
          currentPage = p;
          window.scrollTo({ top: 0, behavior: 'smooth' });
          renderPage();
        }
      });
    });
  });
}

/** Build the inner HTML for a pagination control set. */
function buildPaginationHTML(pages) {
  if (pages <= 1) return '';

  const parts = [];

  // Previous button
  parts.push(
    `<button data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>‹ Prev</button>`
  );

  // Page number buttons (show a window around current page)
  const surroundingPages = 2;
  let lo = Math.max(1, currentPage - surroundingPages);
  let hi = Math.min(pages, currentPage + surroundingPages);

  if (lo > 1) {
    parts.push(`<button data-page="1">1</button>`);
    if (lo > 2) parts.push(`<span class="page-info">…</span>`);
  }

  for (let p = lo; p <= hi; p++) {
    const activeClass = p === currentPage ? 'active' : '';
    parts.push(`<button data-page="${p}" class="${activeClass}">${p}</button>`);
  }

  if (hi < pages) {
    if (hi < pages - 1) parts.push(`<span class="page-info">…</span>`);
    parts.push(`<button data-page="${pages}">${pages}</button>`);
  }

  // Next button
  parts.push(
    `<button data-page="${currentPage + 1}" ${currentPage === pages ? 'disabled' : ''}>Next ›</button>`
  );

  parts.push(
    `<span class="page-info">Page ${currentPage} of ${pages} (${activeIds.length} Pokémon)</span>`
  );

  return parts.join('');
}
