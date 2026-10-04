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

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    if (body.sheet && Array.isArray(body.values)) {
      appendLabeledRow(body.sheet, body.headers, body.values);
      return jsonResponse({ ok: true });
    }

    if (!body.inquiry_date) body.inquiry_date = formatInquiryDate();
    const sheet = getSheet(SHEET_NAME);
    const row = ROW_FIELD_ORDER.map((key) => body[key] == null ? '' : body[key]);
    sheet.appendRow(row);

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.message || err) }, 500);
  }
}

/** Creates the tab if needed, writes the header once, then appends the lead. */
function appendLabeledRow(sheetName, headers, values) {
  const sheet = getOrCreateSheet(sheetName);
  const headerRow = Array.isArray(headers) ? headers : [];
  if (headerRow.length && sheet.getLastRow() === 0) {
    sheet.appendRow(headerRow);
    sheet.setFrozenRows(1);
  }
  sheet.appendRow(values);
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
