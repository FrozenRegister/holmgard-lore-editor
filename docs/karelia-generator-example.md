# Karelia 966 AD Map Generation — AI Assistant Instructions

This document contains copy-paste instructions for Claude, Cline, or other AI assistants to generate a hex map of Karelia in 966 AD.

---

## For Claude (or Claude Code)

Copy the prompt below into Claude Code or claude.ai/code:

```
You are helping generate a historical hex map for the Holmgard Lore Editor, a SvelteKit + Tauri 
desktop app for world-building lore.

TASK: Generate a hex map of Karelia in 966 AD.

CONTEXT:
The world generator system (scripts/build-earth-from-naturalearth.js) converts real-world 
geographic data (coastlines + cities) into hex grids the game engine understands.

Process:
1. Add historical cities for Karelia 966 AD to src/lib/data/earth-996-features.json
2. Add the region preset to scripts/build-earth-from-naturalearth.js
3. Run the generator: node scripts/build-earth-from-naturalearth.js karelia
4. Verify output with diagnostic scripts
5. Commit changes with conventional commit message

DETAILS:

Region definition for Karelia:
- Name: Karelia (966 AD)
- Longitude: 28.5°E (west) to 38°E (east)
- Latitude: 61°N (south) to 67°N (north)
- Vertical resolution: 160 rows
- Center latitude: 64 (auto-calculated; optimal for this northern region)

Historical cities to add to earth-996-features.json (within the features array):
Research and add ~8–12 significant settlements. Example entries:

{
  "name": "Novgorod",
  "description": "Major trading city on the Volkhov River",
  "type": "kingdom_capital",
  "region": "Novgorod Republic",
  "lat": 58.52,
  "lon": 31.27,
  "terrain": "forest"
},
{
  "name": "Ladoga",
  "description": "Ancient settlement, Lake Ladoga inlet",
  "type": "city",
  "region": "Karelia",
  "lat": 60.0,
  "lon": 32.3,
  "terrain": "forest"
},
{
  "name": "Arkhangelsk",
  "description": "Early settlement (small)",
  "type": "city",
  "region": "Karelia",
  "lat": 64.54,
  "lon": 40.54,
  "terrain": "forest"
}

Region preset to add to scripts/build-earth-from-naturalearth.js (in the REGIONS object):

karelia: {
  name: 'Karelia',
  lon: [28.5, 38],
  lat: [61, 67],
  rows: 160
},

WORKFLOW:
1. Research and add cities to src/lib/data/earth-996-features.json
   - Include ~5–8 major settlements historically known to exist in 966 AD
   - Lat/lon should be approximate (accurate to ~0.5–1.0 degree)
   - Type can be: city, kingdom_capital, settlement, mountain, landmark, etc.
   
2. Update scripts/build-earth-from-naturalearth.js
   - Add the karelia preset to the REGIONS object
   
3. Run generator:
   node scripts/build-earth-from-naturalearth.js karelia
   
   This generates: src/lib/data/earth-996-karelia.json
   
4. Verify with diagnostics:
   node scripts/preview-ascii.js karelia
   
   Output should show ASCII terrain map with forest (f), plains (p), water (w), mountains (m).
   
5. Commit changes:
   git add src/lib/data/earth-996-features.json scripts/build-earth-from-naturalearth.js src/lib/data/earth-996-*
   git commit -m "feat: add Karelia 966 AD hex map from Natural Earth coastlines"

CONSTRAINTS:
- Do NOT modify the generator algorithm itself (build-earth-from-naturalearth.js main logic).
- Do NOT edit static/hexmap/game.js or other external .js files in static/hexmap/.
- Terrain is auto-detected by latitude (66.5°+ = tundra, 55–66.5° = forest, etc.).
- City coordinates should be historically plausible for 966 AD Scandinavia/Russia.

OUTPUT:
- Hex map file: src/lib/data/earth-996-karelia.json (~5–15 MB)
- Updated manifest: src/lib/data/earth-996-regions.json
- Git commit with conventional-commit message

NEXT STEPS:
Once complete, the map loads in the Holmgard Lore Editor region selector and can be edited 
in the hex map UI.
```

---

## For Cline (VS Code Extension)

Use this prompt with Cline's edit capabilities:

```
Generate a hex map of Karelia 966 AD for the Holmgard Lore Editor.

Steps:
1. Open src/lib/data/earth-996-features.json
2. In the "features" array, add these city entries:
   - Novgorod (58.52°N, 31.27°E) — kingdom_capital, Novgorod Republic
   - Ladoga (60.0°N, 32.3°E) — city, Karelia
   - Arkhangelsk (64.54°N, 40.54°E) — city, Karelia
   - Kola Mountains (66.8°N, 33.6°E) — mountain, Karelia
   - Pskov (57.81°N, 28.35°E) — city, Pskov Republic (if within bounds)
   [Add 3–5 more based on historical research for 966 AD Scandinavia/Russia]

3. Open scripts/build-earth-from-naturalearth.js
4. In the REGIONS object (line ~31), add:
   karelia: {
     name: 'Karelia',
     lon: [28.5, 38],
     lat: [61, 67],
     rows: 160
   },

5. Run terminal command: node scripts/build-earth-from-naturalearth.js karelia
6. Run terminal command: node scripts/preview-ascii.js karelia
7. Verify output shows terrain and city stamps.
8. Commit with: feat: add Karelia 966 AD hex map from Natural Earth coastlines
```

---

## For Mistral, Deepseek, or Other LLMs

If using a web-based LLM that cannot run terminal commands, provide output step-by-step:

```
You are helping generate a historical world map in hex format.

REGION: Karelia, 966 AD
BOUNDS: 28.5°E to 38°E longitude, 61°N to 67°N latitude
ROWS: 160

TASK 1: Research and list cities
Research major settlements in Karelia region for the year 966 AD. Provide in this format:

City Name | Latitude | Longitude | Type | Region | Description
----------|----------|-----------|------|--------|-------------
Novgorod  | 58.52    | 31.27     | kingdom_capital | Novgorod Republic | Major trading hub
...

TASK 2: Format for JSON
Convert the city list into JSON entries for src/lib/data/earth-996-features.json:

{
  "name": "City Name",
  "description": "Historical description",
  "type": "city|kingdom_capital|settlement|mountain|landmark",
  "region": "Region name",
  "lat": latitude_decimal,
  "lon": longitude_decimal,
  "terrain": "forest|plains|tundra|mountain|water" (optional, or omit for auto-detection)
}

TASK 3: Add region preset
Provide code for scripts/build-earth-from-naturalearth.js REGIONS object:

karelia: {
  name: 'Karelia',
  lon: [28.5, 38],
  lat: [61, 67],
  rows: 160
},

TASK 4: Run generator (human executes in terminal)
The human will run:
  node scripts/build-earth-from-naturalearth.js karelia
  node scripts/preview-ascii.js karelia

This produces: src/lib/data/earth-996-karelia.json
```

---

## Useful Reference: Karelia Historical Context

When researching cities and settlements, note:

- **966 AD** is in the Viking Age / Medieval period
- **Novgorod** exists as a trading post (formally founded ~862 but established by 966)
- **Lake Ladoga** region was a key trade route (Varangian trade routes)
- **Finland** to the west; **Russia/Muscovy** to the east
- Terrain: dense forests (taiga), some tundra at northern edge, rivers and lakes
- Sea access: White Sea (north), Baltic Sea (west) via Gulf of Bothnia

Key geographic features:

- **Lake Ladoga** — Europe's largest freshwater lake
- **Volkhov River** — flows from Ladoga to Novgorod
- **Kola Peninsula** — mountainous, northern edge
- **Arkhangelsk Bay** — White Sea access point

---

## Quick Copy-Paste: City Data Template

Use this as a starting point. Research and add 8–12 entries:

```json
{
  "name": "Novgorod",
  "description": "Major Varangian trading post, Volkhov River",
  "type": "kingdom_capital",
  "region": "Novgorod Republic",
  "lat": 58.52,
  "lon": 31.27,
  "terrain": "forest"
},
{
  "name": "Ladoga",
  "description": "Fortified settlement, Lake Ladoga outlet",
  "type": "city",
  "region": "Karelia",
  "lat": 60.0,
  "lon": 32.3,
  "terrain": "forest"
},
{
  "name": "Pskov",
  "description": "Trading city, Velikaya River",
  "type": "city",
  "region": "Pskov Republic",
  "lat": 57.81,
  "lon": 28.35,
  "terrain": "forest"
},
{
  "name": "Arkhangelsk",
  "description": "Early settlement, White Sea trade",
  "type": "settlement",
  "region": "Karelia",
  "lat": 64.54,
  "lon": 40.54,
  "terrain": "forest"
},
{
  "name": "Kola Mountains",
  "description": "Elevated terrain, northern Karelia",
  "type": "mountain",
  "region": "Karelia",
  "lat": 66.8,
  "lon": 33.6,
  "terrain": "mountain"
},
{
  "name": "Staraya Ladoga",
  "description": "Ancient fortress, strategic river position",
  "type": "city",
  "region": "Karelia",
  "lat": 59.95,
  "lon": 32.35,
  "terrain": "forest"
}
```

---

## What the Output Looks Like

After running the generator, you'll have:

1. **earth-996-karelia.json** — hex map file (~5–15 MB)
   - Contains ~18,000–25,000 hexes describing terrain, cities, landmarks
   - Each hex has: q/r coordinates, terrain type, name/description (if city)

2. **ASCII preview** (from `preview-ascii.js`)

   ```
   f f f f w w w w f f f f
   f c f w w w w w f c f f
   f f f f w w w w f f f f
   ...
   ```

   Legend: `f` = forest, `p` = plains, `d` = desert, `t` = tundra, `w` = water, `m` = mountain, `c` = city

3. **Manifest entry** (in earth-996-regions.json)

   ```json
   {
     "id": "karelia",
     "name": "Karelia (966 AD)",
     "mapInstanceId": "earth-996-karelia",
     "file": "earth-996-karelia.json",
     "bounds": { "lon": [28.5, 38], "lat": [61, 67] },
     "hexes": 22847,
     "geo": { "lonMin": 28.5, "latMax": 67, "dLon": 0.313, "dLat": 0.0375, "qc": -18, "rc": 80 }
   }
   ```

---

## Verification Checklist

After generation, verify:

- [ ] File `src/lib/data/earth-996-karelia.json` exists and is > 1 MB
- [ ] ASCII preview shows forest (f) and water (w) in realistic pattern
- [ ] City names appear as `c` in the ASCII output
- [ ] Manifest `earth-996-regions.json` includes karelia entry
- [ ] No JSON syntax errors when parsing the output file
- [ ] Hex count is in expected range (~18k–25k for 160 rows)

---

## Commit Message

```
feat: add Karelia 966 AD hex map from Natural Earth coastlines

Add curated historical cities (Novgorod, Ladoga, Arkhangelsk, etc.) for the
Karelia region. Region bounds: 28.5°E–38°E, 61°N–67°N. Generator rasterizes
Natural Earth coastlines into 160-row hex grid with forest/tundra biomes.

Includes manifest metadata for viewport geotransform lookups.

Co-Authored-By: [AI Assistant Name] <noreply@anthropic.com>
```
