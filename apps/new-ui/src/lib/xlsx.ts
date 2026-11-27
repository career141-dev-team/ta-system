// A one-sheet Excel file made in the browser (the TA System's server writer,
// src/lib/xlsx.ts, needs Node). Every cell is stored as text, so a phone number
// keeps its + and leading 0 and nothing typed into a CV can run as a formula.

const enc = new TextEncoder();
const esc = (s: string) =>
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (d: Uint8Array) => (d.reduce((c, b) => CRC[(c ^ b) & 255] ^ (c >>> 8), 0xffffffff) ^ 0xffffffff) >>> 0;

/** A ZIP with the files stored as they are. */
function zip(files: [name: string, text: string][]): Uint8Array<ArrayBuffer> {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  const head = (size: number, fields: [at: number, bytes: 2 | 4, value: number][]) => {
    const v = new DataView(new ArrayBuffer(size));
    for (const [at, bytes, value] of fields) v[bytes === 2 ? "setUint16" : "setUint32"](at, value, true);
    return new Uint8Array(v.buffer);
  };
  for (const [file, text] of files) {
    const name = enc.encode(file);
    const data = enc.encode(text);
    const crc = crc32(data);
    // 0x21 = 1 January 1980, the earliest ZIP date.
    const local = head(30, [[0, 4, 0x04034b50], [4, 2, 20], [12, 2, 0x21], [14, 4, crc], [18, 4, data.length], [22, 4, data.length], [26, 2, name.length]]);
    locals.push(local, name, data);
    centrals.push(head(46, [[0, 4, 0x02014b50], [4, 2, 20], [6, 2, 20], [14, 2, 0x21], [16, 4, crc], [20, 4, data.length], [24, 4, data.length], [28, 2, name.length], [42, 4, offset]]), name);
    offset += local.length + name.length + data.length;
  }
  const dirSize = centrals.reduce((n, p) => n + p.length, 0);
  const end = head(22, [[0, 4, 0x06054b50], [8, 2, files.length], [10, 2, files.length], [12, 4, dirSize], [16, 4, offset]]);
  const parts = [...locals, ...centrals, end];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG = "http://schemas.openxmlformats.org/package/2006/relationships";
const TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.";

/** A bold, frozen header row and the rows under it; web addresses are clickable. */
export function xlsx(sheet: string, headers: string[], rows: string[][]): Uint8Array<ArrayBuffer> {
  const links: { ref: string; url: string }[] = [];
  const widths = headers.map((h, i) => Math.min(60, Math.max(12, h.length, ...rows.map((r) => (r[i] ?? "").length)) + 3));
  const data = [headers, ...rows]
    .map((row, r) => {
      const cells = headers.map((_, c) => {
        const value = row[c] ?? "";
        const ref = String.fromCharCode(65 + c) + (r + 1); // shortcut: 26 columns at most
        const link = r > 0 && /^https?:\/\//i.test(value);
        if (link) links.push({ ref, url: value });
        return `<c r="${ref}" t="inlineStr" s="${r === 0 ? 1 : link ? 2 : 0}"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
      });
      return `<row r="${r + 1}">${cells.join("")}</row>`;
    })
    .join("");
  const name = esc(sheet.replace(/[:\\/?*[\]]/g, " ").slice(0, 31) || "Sheet");
  const files: [string, string][] = [
    ["[Content_Types].xml", `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${TYPE}sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="${TYPE}styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${TYPE}worksheet+xml"/></Types>`],
    ["_rels/.rels", `<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", `<styleSheet xmlns="${MAIN}"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><u/><sz val="11"/><color rgb="FF0563C1"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf fontId="0"/><xf fontId="1" applyFont="1"/><xf fontId="2" applyFont="1"/></cellXfs></styleSheet>`],
    ["xl/worksheets/sheet1.xml", `<worksheet xmlns="${MAIN}" xmlns:r="${REL}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols><sheetData>${data}</sheetData>${links.length ? `<hyperlinks>${links.map((l, i) => `<hyperlink ref="${l.ref}" r:id="rId${i + 1}"/>`).join("")}</hyperlinks>` : ""}</worksheet>`],
  ];
  if (links.length)
    files.push(["xl/worksheets/_rels/sheet1.xml.rels", `<Relationships xmlns="${PKG}">${links.map((l, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/hyperlink" Target="${esc(l.url)}" TargetMode="External"/>`).join("")}</Relationships>`]);
  return zip(files.map(([f, xml]) => [f, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + xml]));
}
