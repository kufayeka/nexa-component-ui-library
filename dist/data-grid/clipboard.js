// Data Grid: the clipboard. Pure (no DOM).
//
// What is copied from the grid goes out in two forms: a text of tab-separated cells (what Excel and any text field understand, with quotes around a cell
// that holds a tab, a new line or a quote, as Excel writes it), and a JSON of the cells with their values and styles (what another grid, or this one,
// pastes without losing the styles). What is pasted is either of them.

export const GRID_MIME = "application/x-nexa-grid";

const asText = (v) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** A matrix of texts as tab-separated text: a cell with a tab, a new line or a quote is put in quotes (a quote inside is doubled). */
export function formatTsv(matrix) {
    return matrix.map((row) => row.map((v) => {
        const s = asText(v);
        return /[\t\n\r"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join("\t")).join("\n");
}

/** Tab-separated text as a matrix of texts: quotes are read as Excel writes them; rows end with a new line (a final empty one is not a row). */
export function parseTsv(text) {
    const s = String(text === undefined || text === null ? "" : text);
    const rows = [];
    let row = [], cell = "", quoted = false, i = 0, started = false;
    while (i < s.length) {
        const ch = s[i];
        if (quoted) {
            if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i += 2; continue; } quoted = false; i++; continue; }
            cell += ch; i++; continue;
        }
        if (ch === '"' && cell === "") { quoted = true; started = true; i++; continue; }
        if (ch === "\t") { row.push(cell); cell = ""; started = true; i++; continue; }
        if (ch === "\r" || ch === "\n") {
            row.push(cell); rows.push(row); row = []; cell = ""; started = false;
            if (ch === "\r" && s[i + 1] === "\n") i++;
            i++; continue;
        }
        cell += ch; started = true; i++;
    }
    if (started || cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows;
}

/** The JSON a grid copy carries: { v: 1, cells: [[{ v: value, f: fields }]] } for the cells of a range (rows of cells). */
export function packCells(rows) { return JSON.stringify({ v: 1, cells: rows }); }

/** The cells of a grid copy, or null when the text is not one. */
export function unpackCells(text) {
    try {
        const o = JSON.parse(text);
        return o && o.v === 1 && Array.isArray(o.cells) && o.cells.every((r) => Array.isArray(r)) ? o.cells : null;
    } catch (e) { return null; }
}

/**
 * What goes where when a copy of `h` x `w` cells is pasted at a cell: [{ r, c, i, j }] (the cell of the sheet, and the cell of the copy it gets), cut at the
 * sheet's size. A copy of one cell pasted over a bigger selection fills the selection with it, as in a sheet.
 */
export function pasteTargets(at, h, w, selection, limits) {
    const out = [];
    const fillSel = h === 1 && w === 1 && selection && (selection.r2 > selection.r1 || selection.c2 > selection.c1);
    if (fillSel) {
        for (let r = selection.r1; r <= selection.r2 && r < limits.rows; r++) for (let c = selection.c1; c <= selection.c2 && c < limits.cols; c++) out.push({ r, c, i: 0, j: 0 });
        return out;
    }
    for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) { const r = at.r + i, c = at.c + j; if (r < limits.rows && c < limits.cols) out.push({ r, c, i, j }); }
    return out;
}
