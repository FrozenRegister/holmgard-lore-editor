# External Files

These files are sourced externally and are excluded from the public repo via `.gitignore`.
Do not edit them directly. If a change is required, document it here with a reason and date.

## Files

| File | SHA256 (last verified) | Last Verified | Notes |
|------|----------------------|---------------|-------|
| `game.js` | `4A45EF761DE4B82D94A13A93E7D3D273153A97C36DD6FE38FA4C69E350EC5CD6` | 2026-06-05 | Core hex map rendering engine |
| `auth.js` | `6D0E1369025D21AEE37937362F988C9C5D2AA5A6270B10D9A3DE4A0E8DEC99CC` | 2026-06-05 | Authentication helpers |
| `cloud-storage.js` | `DABFF13E3D05430FEF3813AB9EA1098E934EF1D1801C2A94FC6B631D60F1DF6A` | 2026-06-05 | Cloud storage integration |
| `compendium.js` | `CF88CE8846790776373A44CDC2D5E4C45F1DFA897F3904F962F40A53A0EF3982` | 2026-06-05 | Compendium panel |
| `map-worker.js` | `847B16F0BB06B7C63057F5BDF6BFDE7DFAD614EBC028AC026FB991F657DDB1BE` | 2026-06-05 | Web worker for map processing |
| `mobile-companion.js` | `6349EE14C6C5C2C43B0409F5DA3A2B8D8A152EA6E3FB1FCE8580FED0B7BF83E6` | 2026-06-05 | Mobile companion UI |
| `style.css` | `ECE403EE2C0B19177B93D1FF9E0A56A40E8D412978288A829BC53ED617DCD71B` | 2026-06-05 | Game map styles |
| `mobile-companion.css` | `35949A63E378A6B6BA35CC95056B7FD91DE7516923331B59BA3CDA2767018491` | 2026-06-05 | Mobile companion styles |
| `small_logo.svg` | `7443E13DAB10A5545B1738E769053628645D425F156B1C0A5F467E21F49E5C49` | 2026-06-05 | Logo asset |

## How to verify files haven't changed

Run from the repo root (PowerShell):
```powershell
Get-FileHash static/hexmap/game.js, static/hexmap/auth.js, static/hexmap/cloud-storage.js, static/hexmap/compendium.js, static/hexmap/map-worker.js, static/hexmap/mobile-companion.js, static/hexmap/style.css, static/hexmap/mobile-companion.css, static/hexmap/small_logo.svg -Algorithm SHA256 | Select-Object Hash, @{N='File';E={Split-Path $_.Path -Leaf}}
```

## Change log

| Date | File | Reason |
|------|------|--------|
| — | — | No changes yet |
