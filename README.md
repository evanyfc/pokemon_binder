# Pokédex Binder

A browser-based placeholder card binder for all 1,025 National Pokédex entries (Generations I–IX).

![Pokédex Binder screenshot](https://github.com/user-attachments/assets/ef9ed237-d204-44bd-9d42-3299e96a3d57)

## Features

Each card displays:
- **National Pokédex number** (e.g. #0001)
- **Sprite** — loaded from the [PokéAPI sprites mirror](https://github.com/PokeAPI/sprites)
- **Name**
- **Type badge(s)** — colour-coded using the standard Pokémon type palette

Additional UI:
- Paginated grid (50 cards per page, 21 pages total)
- **Generation filter** — jump straight to Gen I–IX
- **Search** — filter by name or Pokédex number

## How to use

Open `index.html` in any modern web browser (or serve the folder with any static file server):

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

No build step or external dependencies required.

## Data sources

| Resource | Source |
|---|---|
| Pokémon names & types | Bundled in `data/pokemon.json` (generated from [PokeAPI](https://pokeapi.co/)) |
| Sprites | Loaded at runtime from `raw.githubusercontent.com/PokeAPI/sprites` |

### Regenerating `data/pokemon.json`

```bash
python3 generate_data.py
```

This downloads the latest CSV data from the [PokeAPI GitHub repo](https://github.com/PokeAPI/pokeapi) and writes `data/pokemon.json`.
