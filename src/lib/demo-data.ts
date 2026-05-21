/**
 * Demo topics seeded on first run.
 * Each uses the hybrid Markdown + JSON/XML pattern.
 */
import type { Topic } from './types';
import { saveTopic } from './storage';

const NOW = new Date().toISOString();

const DEMO_TOPICS: Topic[] = [
  // ── holmgard ──────────────────────────────────────────────────────────────
  {
    key: 'holmgard',
    text: `# Holmgard

## Overview
Holmgard is a frost-bitten city-state perched at the edge of the known world — where the Ironspine Mountains descend into the perpetual mist of the Greywash Sea. Founded by exiled jarls three centuries ago, it has grown into a labyrinthine port of desperate ambition, ancient grudges, and mercantile cunning.

> *"In Holmgard, every coin has blood on it, and every handshake hides a dagger."*
> — Traveller's proverb

## Districts

### The Longboard (Docks)
The beating heart of commerce. Ships from a dozen nations unload cargo under the eye of the Harbormaster's Guild, while rivermen and smugglers negotiate in the fog below the piers.

### Crowmark (Merchant Quarter)
Tall townhouses pressed shoulder-to-shoulder. Counting houses, auction halls, and the offices of the five great trading houses occupy every other building.

### The Undercity
A subterranean network of tunnels, flooded cellars, and forgotten catacombs beneath the old city wall. See: [undercity](/editor/undercity).

### Ashfield (Slums)
The outer ring where refugees, freed thralls, and the desperate poor crowd into tenements heated by burning peat.

## Factions
| Faction | Influence | Notes |
|---|---|---|
| Harbormaster's Guild | High | Controls all dock access and customs |
| The Amber Court | High | Merchant oligarchs, unofficial senate |
| The Strangers | Medium | Criminal network, eyes everywhere |
| Cult of the Pale Flame | Low | Growing, dangerous, apocalyptic theology |

## Location Data
\`\`\`json
{
  "profile_type": "location",
  "schema_version": "1.0",
  "name": "Holmgard",
  "region": "Ironspine Coast",
  "climate": "subarctic",
  "terrain": ["coastal", "urban", "mountainous"],
  "danger_level": "medium",
  "population": 42000,
  "government": "merchant-oligarchy",
  "tags": ["port", "city-state", "cold", "political", "starting-hub"],
  "connected_locations": ["undercity", "ironspine-pass", "greywash-sea"],
  "notable_npcs": ["lamia"]
}
\`\`\`

## GM Notes
- The Amber Court is fracturing over who controls the new trade route north.
- Cult of the Pale Flame has infiltrated at least one merchant house — players can investigate.
- The Harbormaster is on the Strangers' payroll; customs logs are unreliable.
`,
    meta: { updatedAt: NOW, version: 1 },
  },

  // ── lamia ─────────────────────────────────────────────────────────────────
  {
    key: 'lamia',
    text: `# Lamia Ashveil

## Overview
Lamia Ashveil is the current Speaker of the Amber Court and the most powerful merchant in Holmgard — a fact she wears lightly, preferring wool coats to silk and silence to declarations. She built her fortune in rare pigments and alchemical reagents before pivoting to political brokerage.

## Identity
- **Race**: Human (Northfolk)
- **Age**: 54
- **Pronouns**: she/her
- **Affiliation**: Amber Court (Speaker)
- **Current Location**: Holmgard — Crowmark, Ashveil Hall

## Appearance
Tall, lean, grey-haired and deliberate. She keeps her hands in ink-stained gloves even at formal dinners. Her left eye is glass — replaced after an assassination attempt seventeen years ago that she has never publicly attributed to anyone.

## Personality
Lamia is patient in the way that predators are patient. She speaks quietly, listens loudly, and remembers everything. She is not cruel, but she is ruthlessly pragmatic. She genuinely loves Holmgard and believes the city only survives through cold, clear calculation.

## Relationships
| Name | Relationship | Notes |
|---|---|---|
| Torven Blackmast | Rival | Harbormaster; she suspects his Guild ties to the Strangers |
| Eida | Unknown | A young thief who stole her personal cipher two years ago — she has not moved against them yet |
| The Pale Flame | Enemy | Has privately funded efforts to investigate the Cult |

## Goals
1. Secure the northern trade route before winter closes the mountain pass.
2. Identify which Amber Court member is leaking negotiation positions.
3. Find Eida before the Strangers do.

## Stat Block
\`\`\`json
{
  "profile_type": "character",
  "schema_version": "1.0",
  "name": "Lamia Ashveil",
  "race": "Human",
  "class": "Expert (Noble / Spymaster)",
  "level": 9,
  "alignment": "Lawful Neutral",
  "attributes": {
    "STR": 10, "DEX": 12, "CON": 11,
    "INT": 18, "WIS": 16, "CHA": 17
  },
  "hp": { "current": 52, "max": 52, "hit_dice": "9d8" },
  "armor_class": 11,
  "speed": 30,
  "skills": ["Deception", "History", "Insight", "Persuasion", "Investigation"],
  "special_abilities": [
    "Silver Tongue: advantage on Persuasion checks when negotiating contracts",
    "Read the Room: once per short rest, detect the most powerful person in the room and their mood"
  ],
  "equipment": ["Glass eye (minor arcane sensor)", "Cipher ring", "Personal ledger"],
  "notes": "Will not fight unless cornered; has three bodyguards within 60ft at all times in public."
}
\`\`\`

## XML Profile
\`\`\`xml
<character_profile version="1.0">
  <identity>
    <name>Lamia Ashveil</name>
    <race>Human</race>
    <class>Expert</class>
    <level>9</level>
    <alignment>Lawful Neutral</alignment>
  </identity>
  <narrative>
    <backstory>Rose from pigment-trade to political broker over thirty years.</backstory>
    <motivation>Holmgard's survival — on her terms.</motivation>
    <secret>She knows who ordered the assassination attempt. She is waiting for the right moment.</secret>
  </narrative>
</character_profile>
\`\`\`

## GM Notes
- Can be an ally, patron, or antagonist depending on player alignment.
- If players earn her trust she will share the Pale Flame intelligence dossier.
- Her glass eye can see through magical illusions — she will never reveal this.
`,
    meta: { updatedAt: NOW, version: 1 },
  },

  // ── undercity ─────────────────────────────────────────────────────────────
  {
    key: 'undercity',
    text: `# The Undercity

## Overview
Beneath the cobblestones of Holmgard lies a second city — older, darker, and far less interested in commerce. The Undercity is a network of pre-settlement catacombs, flooded drainage tunnels, collapsed trade vaults, and spaces that have no name in any map because the people who named them are gone.

## Atmosphere
The Undercity smells of brine, old smoke, and something metallic that players cannot quite identify. Sound behaves oddly — footsteps echo from the wrong direction, whispers carry further than shouting. Torchlight seems dimmer here, as if the dark is hungrier.

## Layers

### The Shallows (Depth 0–10m)
Old basements, connected cellars, and the tunnel system the Strangers use for smuggling. Relatively safe. The Strangers charge a toll.

### The Mid-Dark (Depth 10–40m)
Former catacombs of an earlier settlement. Flooded in places. Undead occasionally stir here, though nobody knows why or what wakes them.

### The Deep Veins (Depth 40m+)
Unexplored. Geothermal vents keep the temperature warm despite the depth. Something with many legs has been carving new passages. Players have not yet reached this layer.

## Key Locations
1. **The Brine Gate** — Strangers' main checkpoint into the Shallows. Pay the toll or fight your way through six very professional thugs.
2. **The Drowning Archives** — A partially flooded library from the old settlement. Half the books are ruined; the other half contain information that powerful people want destroyed.
3. **The Pale Altar** — A stone platform in the Mid-Dark, clearly ancient, with symbols that match the Cult of the Pale Flame's iconography. This predates the Cult by at least two centuries.

## Encounters
| Location | Encounter | CR |
|---|---|---|
| Shallows | Strangers patrol (4 veterans) | 5 |
| Mid-Dark | Wight + 8 skeletons | 6 |
| Mid-Dark | Gelatinous cube in flooded corridor | 2 |
| Deep Veins | Unknown — placeholder | ? |

## Location Data
\`\`\`json
{
  "profile_type": "location",
  "schema_version": "1.0",
  "name": "The Undercity",
  "region": "Holmgard (subsurface)",
  "climate": "underground",
  "terrain": ["dungeon", "flooded", "tunnels", "catacombs"],
  "danger_level": "high",
  "population": null,
  "tags": ["dungeon", "undead", "criminal", "mystery", "multi-level"],
  "connected_locations": ["holmgard", "deep-veins-unknown"],
  "notable_npcs": ["undercity-contact-tba"],
  "lore_keys": ["pale-flame", "strangers", "pre-settlement-ruins"]
}
\`\`\`

## XML Descriptor
\`\`\`xml
<location_profile version="1.0">
  <identity>
    <name>The Undercity</name>
    <region>Holmgard subsurface</region>
    <danger_level>high</danger_level>
  </identity>
  <geography>
    <climate>underground</climate>
    <terrain>tunnels, catacombs, flooded passages</terrain>
    <depth_layers>3</depth_layers>
  </geography>
  <narrative>
    <atmosphere>Dark, echoing, unsettling. The dark feels hungry.</atmosphere>
    <history>Pre-dates Holmgard by an unknown number of centuries.</history>
    <secrets>The Pale Altar predates the Cult. Something built the Deep Veins passages recently.</secrets>
  </narrative>
</location_profile>
\`\`\`

## GM Notes
- The Pale Altar is the key to the Cult of the Pale Flame arc — it proves the Cult is re-discovering something, not inventing it.
- The Deep Veins creature is an Umber Hulk colony. They are not hostile unless the players disturb the nest.
- The Drowning Archives contain the name of whoever ordered Lamia's assassination — she does not know this.
`,
    meta: { updatedAt: NOW, version: 1 },
  },
];

export async function loadDemoData(): Promise<Topic[]> {
  for (const topic of DEMO_TOPICS) {
    await saveTopic(topic);
  }
  return [...DEMO_TOPICS];
}

export { DEMO_TOPICS };
