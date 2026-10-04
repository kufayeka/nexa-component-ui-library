// ---- export: CSV and a real .xlsx (a stored zip, no library) -----------------------------------
let CRC_TABLE = null;
export function crc32(bytes) {
    if (!CRC_TABLE) {
        CRC_TABLE = new Uint32Array(256);
        for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; }
    }
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
export function zipStore(files) {
    const enc = new TextEncoder(), chunks = [], central = [];
    let offset = 0;
    const u16 = (v) => [v & 255, (v >>> 8) & 255], u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    for (const f of files) {
        const name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
        const head = [].concat(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
        chunks.push(new Uint8Array(head), name, data);
        central.push({ name, crc, size: data.length, offset });
        offset += head.length + name.length + data.length;
    }
    let cdSize = 0;
    for (const c of central) {
        const rec = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0x21), u32(c.crc), u32(c.size), u32(c.size), u16(c.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset));
        chunks.push(new Uint8Array(rec), c.name);
        cdSize += rec.length + c.name.length;
    }
    chunks.push(new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(cdSize), u32(offset), u16(0))));
    return new Blob(chunks, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
export const xmlEsc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);
export function colName(i) { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
// a colour as Excel's ARGB, lightened (a cell's fill: its text stays readable)
export function fillArgb(color, mix) {
    let hex = String(color || "").trim();
    const m = /^rgba?\(([^)]+)\)/.exec(hex);
    let r, g, b;
    if (m) { [r, g, b] = m[1].split(",").map((x) => parseInt(x, 10)); }
    else {
        hex = hex.replace("#", "");
        if (hex.length === 3) hex = hex.split("").map((ch) => ch + ch).join("");
        const n = parseInt(hex.slice(0, 6), 16);
        if (!/^[0-9a-f]{6}/i.test(hex) || isNaN(n)) { r = 239; g = 68; b = 68; } else { r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255; }
    }
    const t = (v) => Math.round(v + (255 - v) * mix).toString(16).padStart(2, "0");
    return ("FF" + t(r) + t(g) + t(b)).toUpperCase();
}

/**
 * A real .xlsx (a stored zip). The Data sheet: header + rows; opts:
 *   timeCols   the columns holding times in ms (Excel date-times to the ms; default [0])
 *   textCols   the columns holding text
 *   fills      a colour (or null) per cell: its background, lightened
 *   sheets     more sheets: [{ name, header, rows, timeCols, textCols }] (a summary…)
 *   info       [[label, value]]: an Info sheet, last
 */
export function xlsxBlob(header, rows, utc, opts) {
    opts = opts || {};
    // time cells: Excel serial days, a date-time format to the millisecond (style 1)
    const toSerial = (ts) => { const d = new Date(ts); const off = utc ? 0 : d.getTimezoneOffset() * 60000; return (ts - off) / 86400000 + 25569; };
    // styles: 0 plain, 1 date-time, 2 bold (the header), 3… a fill per colour
    const colors = [], colorAt = {};
    const styleOf = (color) => { if (!color) return 0; if (!(color in colorAt)) { colorAt[color] = colors.length; colors.push(color); } return 3 + colorAt[color]; };
    const str = (ref, text, st) => `<c r="${ref}" t="inlineStr"${st ? ` s="${st}"` : ""}><is><t xml:space="preserve">${xmlEsc(text)}</t></is></c>`;
    const sheetXml = (hd, rs, o) => {
        const timeCols = new Set(o.timeCols || [0]), textCols = new Set(o.textCols || []);
        const widths = hd.map((h, c) => (timeCols.has(c) ? 26 : textCols.has(c) ? 30 : 16));
        let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>'
            + widths.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join("") + '</cols><sheetData>';
        x += '<row r="1">' + hd.map((h, c) => str(colName(c) + "1", h, 2)).join("") + "</row>";
        rs.forEach((r, ri) => {
            const n = ri + 2, f = o.fills && o.fills[ri];
            x += `<row r="${n}">` + r.map((v, c) => {
                const ref = colName(c) + n;
                if (v === null || v === undefined || v === "") return "";
                if (timeCols.has(c) && typeof v === "number") return `<c r="${ref}" s="1"><v>${toSerial(v)}</v></c>`;
                if (textCols.has(c) || typeof v !== "number") return str(ref, v, styleOf(f && f[c]));
                const st = styleOf(f && f[c]);
                return `<c r="${ref}"${st ? ` s="${st}"` : ""}><v>${v}</v></c>`;
            }).join("") + "</row>";
        });
        return x + "</sheetData></worksheet>";
    };
    const sheets = [{ name: "Data", xml: sheetXml(header, rows, opts) }]
        .concat((opts.sheets || []).map((sh) => ({ name: sh.name, xml: sheetXml(sh.header, sh.rows, sh) })));
    const info = opts.info || [];
    if (info.length) {
        sheets.push({ name: "Info", xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="14" customWidth="1"/><col min="2" max="2" width="70" customWidth="1"/></cols><sheetData>'
            + info.map((kv, i) => `<row r="${i + 1}">${str("A" + (i + 1), kv[0], 2)}${str("B" + (i + 1), kv[1], 0)}</row>`).join("") + "</sheetData></worksheet>" });
    }
    const fills = colors.map((c) => `<fill><patternFill patternType="solid"><fgColor rgb="${fillArgb(c, 0.55)}"/><bgColor indexed="64"/></patternFill></fill>`).join("");
    const xfs = colors.map((c, k) => `<xf numFmtId="0" fontId="0" fillId="${2 + k}" borderId="0" xfId="0" applyFill="1"/>`).join("");
    const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm:ss.000"/></numFmts>'
        + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
        + `<fills count="${2 + colors.length}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${fills}</fills>`
        + '<borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        + `<cellXfs count="${3 + colors.length}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>${xfs}</cellXfs></styleSheet>`;
    const WS = "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";
    return zipStore([
        { name: "[Content_Types].xml", text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            + sheets.map((sh, k) => `<Override PartName="/xl/worksheets/sheet${k + 1}.xml" ContentType="${WS}"/>`).join("") + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
        { name: "_rels/.rels", text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
        { name: "xl/workbook.xml", text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
            + sheets.map((sh, k) => `<sheet name="${xmlEsc(sh.name)}" sheetId="${k + 1}" r:id="rId${k + 10}"/>`).join("") + '</sheets></workbook>' },
        { name: "xl/_rels/workbook.xml.rels", text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            + sheets.map((sh, k) => `<Relationship Id="rId${k + 10}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${k + 1}.xml"/>`).join("") + '</Relationships>' },
        { name: "xl/styles.xml", text: styles }
    ].concat(sheets.map((sh, k) => ({ name: `xl/worksheets/sheet${k + 1}.xml`, text: sh.xml }))));
}
