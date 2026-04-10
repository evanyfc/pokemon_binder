#!/usr/bin/env python3
"""
generate_data.py
----------------
Downloads Pokémon names and type data from the PokeAPI CSV files hosted on
GitHub and writes them to data/pokemon.json.

Run this script to refresh the bundled data whenever new Pokémon are added:

    python3 generate_data.py
"""

import csv
import json
import os
import urllib.request

# National Dex range to include
MIN_ID = 1
MAX_ID = 1025

BASE_URL = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/"


def fetch_csv(filename: str) -> str:
    url = BASE_URL + filename
    print(f"Fetching {url} …")
    with urllib.request.urlopen(url) as response:
        return response.read().decode("utf-8")


def main() -> None:
    # Type id → name mapping
    types_csv = fetch_csv("types.csv")
    type_map: dict[int, str] = {}
    for row in csv.DictReader(types_csv.splitlines()):
        type_map[int(row["id"])] = row["identifier"]

    # Pokemon id → identifier (base forms only)
    pokemon_csv = fetch_csv("pokemon.csv")
    pokemon_map: dict[int, str] = {}
    for row in csv.DictReader(pokemon_csv.splitlines()):
        pid = int(row["id"])
        if MIN_ID <= pid <= MAX_ID and row["is_default"] == "1":
            pokemon_map[pid] = row["identifier"]

    # Pokemon id → list of type names ordered by slot
    pokemon_types_csv = fetch_csv("pokemon_types.csv")
    pokemon_types: dict[int, dict[int, str]] = {}
    for row in csv.DictReader(pokemon_types_csv.splitlines()):
        pid = int(row["pokemon_id"])
        if pid not in pokemon_map:
            continue
        tid = int(row["type_id"])
        if tid not in type_map:
            continue
        slot = int(row["slot"])
        pokemon_types.setdefault(pid, {})[slot] = type_map[tid]

    # Build the output list
    data = []
    for pid in sorted(pokemon_map.keys()):
        types_dict = pokemon_types.get(pid, {})
        types_list = [types_dict[s] for s in sorted(types_dict.keys())]
        data.append({"id": pid, "name": pokemon_map[pid], "types": types_list})

    # Write output
    output_dir = os.path.join(os.path.dirname(__file__), "data")
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "pokemon.json")

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))

    print(f"Wrote {len(data)} Pokémon entries to {output_path}")


if __name__ == "__main__":
    main()
