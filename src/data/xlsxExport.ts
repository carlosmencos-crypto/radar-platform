import { strToU8, zipSync } from "fflate";

export type RadarWorkbookSheet = {
  name: string;
  brandTitle?: string;
  campaignLine?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  headers: string[];
  rows: Array<Array<string | number | boolean | null | undefined>>;
  widths?: number[];
  currencyColumns?: number[];
};

const xmlEscape = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

function excelColumn(index: number) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function safeSheetName(value: string, index: number) {
  const clean = value.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31);
  return clean || `Hoja ${index + 1}`;
}

function cell(value: string | number | boolean | null | undefined, column: number, row: number, style = 0) {
  const reference = `${excelColumn(column)}${row}`;
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
  if (typeof value === "boolean") return `<c r="${reference}" s="${style}" t="b"><v>${value ? 1 : 0}</v></c>`;
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function sheetXml(sheet: RadarWorkbookSheet) {
  const columns = sheet.headers.length;
  const widths = sheet.widths ?? sheet.headers.map((header) => Math.max(14, Math.min(42, header.length + 5)));
  const branded = Boolean(sheet.brandTitle);
  const titleRows = branded ? 5 : sheet.title ? (sheet.subtitle ? 2 : 1) : 0;
  const rows: string[] = [];
  if (branded) {
    rows.push(`<row r="1" ht="28" customHeight="1">${cell(sheet.brandTitle, 0, 1, 1)}</row>`);
    rows.push(`<row r="2" ht="22" customHeight="1">${cell(sheet.campaignLine ?? "CAMPAÑA", 0, 2, 2)}</row>`);
    rows.push(`<row r="3" ht="27" customHeight="1">${cell(sheet.title ?? sheet.name, 0, 3, 3)}</row>`);
    rows.push(`<row r="4" ht="20" customHeight="1">${cell(sheet.description ?? sheet.subtitle ?? "", 0, 4, 4)}</row>`);
    rows.push('<row r="5" ht="8" customHeight="1"></row>');
  } else {
    if (sheet.title) rows.push(`<row r="1" ht="28" customHeight="1">${cell(sheet.title, 0, 1, 3)}</row>`);
    if (sheet.subtitle) rows.push(`<row r="2" ht="22" customHeight="1">${cell(sheet.subtitle, 0, 2, 4)}</row>`);
  }
  const headerRow = titleRows + 1;
  rows.push(`<row r="${headerRow}" ht="24" customHeight="1">${sheet.headers.map((value, index) => cell(value, index, headerRow, 5)).join("")}</row>`);
  sheet.rows.forEach((values, rowIndex) => {
    const number = headerRow + rowIndex + 1;
    const alternate = rowIndex % 2 === 1;
    rows.push(`<row r="${number}" ht="22" customHeight="1">${values.map((value, column) => {
      const currency = typeof value === "number" && sheet.currencyColumns?.includes(column);
      const style = currency ? 7 : (alternate ? 8 : 6);
      return cell(value, column, number, style);
    }).join("")}</row>`);
  });
  const lastRow = headerRow + sheet.rows.length;
  const dimension = `A1:${excelColumn(Math.max(0, columns - 1))}${Math.max(1, lastRow)}`;
  const mergeRows = branded ? [1, 2, 3, 4] : sheet.title ? (sheet.subtitle ? [1, 2] : [1]) : [];
  const mergeCells = columns > 1 && mergeRows.length
    ? `<mergeCells count="${mergeRows.length}">${mergeRows.map((row) => `<mergeCell ref="A${row}:${excelColumn(columns - 1)}${row}"/>`).join("")}</mergeCells>`
    : "";
  const autoFilter = sheet.rows.length ? `<autoFilter ref="A${headerRow}:${excelColumn(columns - 1)}${lastRow}"/>` : "";
  const sheetView = branded
    ? '<sheetView workbookViewId="0" showGridLines="1"/>'
    : `<sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/><selection activeCell="A${headerRow + 1}" sqref="A${headerRow + 1}"/></sheetView>`;
  // OOXML is order-sensitive. In particular, autoFilter must precede
  // mergeCells in CT_Worksheet or desktop Excel repairs/rejects the file.
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${dimension}"/><sheetViews>${sheetView}</sheetViews><sheetFormatPr baseColWidth="8" defaultRowHeight="15"/><cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols><sheetData>${rows.join("")}</sheetData>${autoFilter}${mergeCells}<ignoredErrors><ignoredError numberStoredAsText="1" sqref="${dimension}"/></ignoredErrors><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
}

export function createRadarXlsx(sheets: RadarWorkbookSheet[]) {
  const names = sheets.map((sheet, index) => safeSheetName(sheet.name, index));
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`),
    "docProps/core.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>RADAR Electoral</dc:creator><cp:lastModifiedBy>RADAR Electoral</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`),
    "docProps/app.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Excel Compatible / RADAR Electoral</Application><AppVersion>16.0300</AppVersion></Properties>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr/><bookViews><workbookView activeTab="0"/></bookViews><sheets>${names.map((name, index) => `<sheet name="${xmlEscape(name)}" sheetId="${index + 1}" state="visible" r:id="rId${index + 1}"/>`).join("")}</sheets><calcPr calcId="191029"/></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;Q&quot; #,##0.00;[Red]-&quot;Q&quot; #,##0.00"/></numFmts><fonts count="6"><font><sz val="11"/><name val="Aptos"/><family val="2"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="13"/><name val="Aptos Display"/></font><font><b/><color rgb="FF2E343B"/><sz val="16"/><name val="Aptos Display"/></font><font><i/><color rgb="FF5B646C"/><sz val="10"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Aptos"/></font><font><b/><color rgb="FF09566C"/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF09566C"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF6F2EE"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF5A2973"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDF0EC"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD5D9D4"/></left><right style="thin"><color rgb="FFD5D9D4"/></right><top style="thin"><color rgb="FFD5D9D4"/></top><bottom style="thin"><color rgb="FFD5D9D4"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="9"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="5" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`),
  };
  sheets.forEach((sheet, index) => { files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(sheetXml(sheet)); });
  const zipped = zipSync(files, { level: 6 });
  return new Blob([zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
