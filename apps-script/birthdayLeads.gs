/**
 * birthdayLeads.gs — Apps Script Web App endpoint for the "ימי הולדת" leads sheet.
 *
 * Setup:
 * 1. Open the Google Sheet named "ימי הולדת" (or the tab named "ימי הולדת"
 *    inside your leads spreadsheet) → Extensions → Apps Script.
 * 2. Paste this whole file, replacing any boilerplate.
 * 3. Deploy → New deployment → type "Web app" → Execute as "Me" →
 *    Who has access "Anyone" → Deploy. Copy the Web App URL.
 * 4. Send that URL back so the Velo code can be wired to it.
 *
 * Expected POST body (JSON), matching the sheet header A–I:
 *   {
 *     form_field:   string, // A — שם
 *     form_field_1: string, // B — דוא"ל
 *     form_field_2: string, // C — טלפון
 *     form_field_3: string, // D — תאריך מועדף
 *     form_field_4: string, // E — סוג סדנה
 *     num_of_kids:  number, // F — מספר ילדים
 *     melavim:      number, // G — מספר מבוגרים
 *     message:      string, // H — הערות
 *     inquiry_date: string, // I — תאריך פנייה (dd/MM/yyyy HH:mm, Asia/Jerusalem)
 *   }
 */

const SHEET_NAME = 'ימי הולדת';

const ROW_FIELD_ORDER = [
  'form_field',
  'form_field_1',
  'form_field_2',
  'form_field_3',
  'form_field_4',
  'num_of_kids',
  'melavim',
  'message',
  'inquiry_date',
];

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  try {
    const body = readBody(e);

    if (body.sheet && Array.isArray(body.values)) {
      const sheet = appendLabeledRow(body.sheet, body.headers, body.values);
      return jsonResponse({ ok: true, sheet: body.sheet, lastRow: sheet.getLastRow() });
    }

    if (!body.form_field && !body.inquiry_date) {
      return jsonResponse({ ok: false, error: 'empty body' });
    }

    if (!body.inquiry_date) body.inquiry_date = formatInquiryDate();
    const sheet = getSheet(SHEET_NAME);
    const row = ROW_FIELD_ORDER.map((key) => body[key] == null ? '' : body[key]);
    sheet.appendRow(row);

    return jsonResponse({ ok: true, sheet: SHEET_NAME, lastRow: sheet.getLastRow() });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.message || err) });
  }
}

function readBody(e) {
  const param = e && e.parameter && e.parameter.payload;
  if (param) return JSON.parse(param);

  const raw = (e && e.postData && e.postData.contents) || '';
  if (!raw) return {};
  if (raw.indexOf('payload=') === 0) {
    return JSON.parse(decodeURIComponent(raw.slice('payload='.length).replace(/\+/g, ' ')));
  }
  return JSON.parse(raw);
}

const COMPANY_EVENT_HEADERS = [
  'שם',
  'שם משפחה',
  'דוא"ל',
  'טלפון',
  'שם חברה',
  'תפקיד בחברה',
  'כמה משתתפים ?',
  'סוג סדנה רצוייה',
  'תאריך האירוע',
  'שעה',
  'איפה תרצו לעשות את הסדנה ?',
  'כתובת המשרדים',
  'הערות נוספות ?',
  'הסכמה לתנאי השימוש',
  'תאריך פנייה',
];

/** Run once from the Apps Script editor to add the header above existing leads. */
function fixCompanyEventHeader() {
  const sheet = getOrCreateSheet('אירועי חברה');
  ensureHeader(sheet, COMPANY_EVENT_HEADERS);
}

/** Creates the tab if needed, writes the header once, then appends the lead. */
function appendLabeledRow(sheetName, headers, values) {
  const sheet = getOrCreateSheet(sheetName);
  const headerRow = Array.isArray(headers) && headers.length ? headers : [];
  if (headerRow.length) ensureHeader(sheet, headerRow);
  sheet.appendRow(values);
  return sheet;
}

function ensureHeader(sheet, headerRow) {
  const width = headerRow.length;
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headerRow);
    sheet.setFrozenRows(1);
    return;
  }
  const current = sheet.getRange(1, 1, 1, width).getDisplayValues()[0];
  const same = headerRow.every(function (cell, i) { return String(current[i] || '') === String(cell); });
  if (same) {
    sheet.setFrozenRows(1);
    return;
  }
  const first = String(current[0] || '');
  if (first !== String(headerRow[0])) sheet.insertRowBefore(1);
  sheet.getRange(1, 1, 1, width).setValues([headerRow]);
  sheet.setFrozenRows(1);
}

function formatInquiryDate() {
  return Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'dd/MM/yyyy HH:mm');
}

function getSheet(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Sheet "' + name + '" not found');
  return sheet;
}

function getOrCreateSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function jsonResponse(obj, statusCode) {
  // Apps Script Web Apps always return HTTP 200 to the caller; statusCode is
  // kept in the payload for the caller's own logging/branching.
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
