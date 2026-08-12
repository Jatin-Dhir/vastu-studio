# Vastu Studio

A precision Vastu analysis studio for the browser. Import a floor plan, set the real-world
scale, trace the boundary, and the Brahmasthan, zones and entrances are located for you —
measured, centred, and to scale.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

## Workflow

1. **Import** — drop a PDF, AutoCAD DXF, or image; paste a screenshot (Ctrl+V); or capture
   straight from satellite/street maps. `.vastu` project files reopen where you left off.
2. **Scale** — draw a line over any known dimension and type its length (feet / metres /
   inches / cm). DXF files with drawing units and map captures calibrate themselves.
3. **Outline** — tap the plot corners (15°-angle snap keeps walls true; drag any vertex to
   refine, double-click an edge in Select mode to add one, right-click to delete). Click the
   first point to close.
4. **Analyse** — the centre (area centroid) and compass radius are computed automatically;
   closing the outline re-asserts the auto ratio. North is automatic for map captures
   (true north is up); for drawings use **Align north** (`N`) — tap the tail, then the tip
   of the plan's printed north arrow and the compass rotates itself. Pick an overlay and
   read the zone balance.

Works on phones and tablets too: the tools dock to the bottom, the control panel becomes a
slide-up sheet, and tracing/pinch-zoom are touch-native.

## Compasses

| Overlay | What it shows |
|---|---|
| 16 Zones | MahaVastu-style chakra, sector fills clipped to the plot, degree ring |
| 32 Gates | Entrance padas N1–W8 with their devtas (Roga … Papayakshma) |
| 8 Directions | Dik chakra with Sanskrit names and deities |
| Pada Grid | 9×9 Vastu Purusha Mandala fitted to the plot's oriented bounding box — all 45 devtas |
| Degree Dial | Plain 0–360° surveyor dial |
| Custom | Your own compass PNG, auto-sized to the plot and rotating with north |

Everything follows the centre: drag it to pin manually, reset to return to the centroid.
The compass diameter auto-fits the boundary; the Size slider scales it 40–170%.

## Notes

- **DWG** is a closed format — save as DXF from AutoCAD (`SAVEAS → DXF`) or convert with the
  free ODA File Converter, or print to PDF.
- Map captures bake in the imagery attribution (Esri / OpenStreetMap) and inherit
  metres-per-pixel from the zoom level.
- Work autosaves locally; **Save project** downloads a portable `.vastu` file.
- **Export PNG** renders a high-resolution composition of plan + overlay.

## Shortcuts

`V` select/pan · `C` scale · `T` trace · `M` pin centre · `N` align north · `F` fit view ·
`Enter` close outline · `Esc`/`Backspace` undo last point · `Ctrl+Z` / `Ctrl+Y` undo/redo
