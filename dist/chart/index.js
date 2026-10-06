// Nexa UI — the charts (each its own module, on the chart core: ./core.js).
import "./line.js";
import "./state.js";
import "./bar.js";
import "./pie.js";
import "./gauge.js";
import "./area.js";
import "./sparkline.js";
import "./histogram.js";
// cartesian.js (the layered Chart) is NOT imported: hidden from the palette (user, 2026-10-06: one chart per type);
// its engine (rows.js, stack.js, curves.js) is reused by the per-type charts, its tests load it on their own
