// ---------- Code.gs ----------
// CONFIG
const SLOTS_SHEET_NAME = 'Slots';
const BOOKINGS_SHEET_NAME = 'Bookings';
const DEFAULT_UPLOAD_FOLDER_ID = ''; // optional folder ID in Drive for uploads (leave blank = root)

function doGet(e) {
  const type = e.parameter.type || 'patient'; // default to patient
  if (type === 'doctor') {
    const template = HtmlService.createTemplateFromFile('DoctorIndex');
    return template.evaluate()
      .setTitle('Doctor Dashboard')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else {
    const template = HtmlService.createTemplateFromFile('Index');
    template.params = e.parameter || {};
    return template.evaluate()
      .setTitle('Appointment Booking')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}


function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// Ensure slotIds exist
function ensureSlotIds() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SLOTS_SHEET_NAME);
  const last = sh.getLastRow();
  if (last < 2) return;
  const vals = sh.getRange(2, 1, last - 1, 8).getValues();
  let changed = false;
  for (let i = 0; i < vals.length; i++) {
    if (!vals[i][0]) {
      vals[i][0] = 'SLOT_' + (i + 2);
      changed = true;
    }
  }
  if (changed) {
    sh.getRange(2, 1, vals.length, 8).setValues(vals);
  }
}

// Return unique specialties
function getSpecialties() {
  ensureSlotIds();
  const sh = SpreadsheetApp.getActive().getSheetByName(SLOTS_SHEET_NAME);
  const vals = sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues().flat();
  const uniq = [...new Set(vals.filter(v => v && v.toString().trim() !== ''))];
  return uniq.sort();
}

// Return slots for a specialty
function getSlotsForSpecialty(specialty) {
  ensureSlotIds();
  const sh = SpreadsheetApp.getActive().getSheetByName(SLOTS_SHEET_NAME);
  const data = sh.getRange(2, 1, Math.max(0, sh.getLastRow() - 1), 8).getValues();
  const out = [];
  data.forEach((row, idx) => {
    const slotId = row[0];
    const sp = row[1];
    const date = row[2];
    const timeRange = row[3];
    const capacity = Number(row[4]) || 0;
    const booked = Number(row[5]) || 0;
    const label = row[6] || `${date} | ${timeRange}`;
    if (String(sp) === String(specialty)) {
      out.push({
        slotId,
        date,
        timeRange,
        capacity,
        booked,
        available: capacity - booked,
        label: `${formatDateHuman(date)} | ${timeRange} (${booked}/${capacity})`,
        rowIndex: idx + 2
      });
    }
  });
  out.sort((a, b) => new Date(a.date) - new Date(b.date));
  return out;
}

function formatDateHuman(dateStr) {
  try {
    let d = (dateStr instanceof Date) ? dateStr : new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'EEE, dd MMM yyyy');
  } catch (e) {
    return dateStr;
  }
}

// Book slot
function bookSlot(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActive();
    const slotsSh = ss.getSheetByName(SLOTS_SHEET_NAME);
    const bookingsSh = ss.getSheetByName(BOOKINGS_SHEET_NAME);
    const rowIndex = Number(payload.rowIndex);
    if (!rowIndex || rowIndex < 2) throw new Error('Invalid slot row.');

    const row = slotsSh.getRange(rowIndex, 1, 1, 8).getValues()[0];
    const slotId = row[0];
    const capacity = Number(row[4]) || 0;
    let booked = Number(row[5]) || 0;
    if (slotId !== payload.slotId) {
      throw new Error('Slot mismatch. Refresh and try again.');
    }
    if (booked >= capacity) {
      return { success: false, message: 'Slot already full.' };
    }

    // Prevent duplicate booking by same ID
    // Prevent duplicate booking by same ID for same specialty
const existing = bookingsSh.getDataRange().getValues().slice(1).find(r => {
  return String(r[1]) == String(payload.idNumber) && String(r[4]) == String(payload.specialty);
});
if (existing) {
  return { success: false, message: 'You already booked a slot for this specialty.' };
}


    // Handle file upload
    let fileUrl = '', fileId = '';
    if (payload.file && payload.file.base64) {
      try {
        const folderId = row[7] || DEFAULT_UPLOAD_FOLDER_ID;
        const bytes = Utilities.base64Decode(payload.file.base64);
        const blob = Utilities.newBlob(bytes, payload.file.mimeType, payload.file.name);
        let file;
        if (folderId) {
          file = DriveApp.getFolderById(folderId).createFile(blob);
        } else {
          file = DriveApp.createFile(blob);
        }
        fileUrl = file.getUrl();
        fileId = file.getId();
      } catch (e) {
        Logger.log('Upload error: ' + e);
      }
    }

    // Increment booked
    booked++;
    slotsSh.getRange(rowIndex, 6).setValue(booked);

    // Add booking
    const stamp = new Date();
    const slotLabel = `${formatDateHuman(row[2])} | ${row[3]}`;
    bookingsSh.appendRow([stamp, payload.idNumber, payload.phone, payload.name || '', payload.specialty, slotId, slotLabel, fileUrl, fileId, payload.notes || '']);

    return { success: true, message: 'Booked', slotLabel, fileUrl };
  } finally {
    lock.releaseLock();
  }
}
const PATIENTS_SHEET_NAME = 'PatientMaster';

function getPatientById(idNumber) {
  const sh = SpreadsheetApp.getActive().getSheetByName(PATIENTS_SHEET_NAME);
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  
  const idxId = headers.indexOf("its_id");
  const idxName = headers.indexOf("name");
  const idxPhone = headers.indexOf("Phone Number");
  const idxAge = headers.indexOf("Age");
  const idxPhase = headers.indexOf("Phase Details");
  const idxSpec = headers.indexOf("Specialty");

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idxId]) === String(idNumber)) {
      return {
        idNumber: data[i][idxId],
        name: data[i][idxName],
        phone: data[i][idxPhone],
        age: data[i][idxAge],
        phase: data[i][idxPhase],
        specialties: String(data[i][idxSpec]).split(",").map(s => s.trim())
      };
    }
  }
  return null;
}

// Get all patients for a given specialty
function getPatientsBySpecialty(specialty) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Bookings");
    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];

    const headers = data[0];
    const specialtyCol = headers.indexOf("specialty");
    if (specialtyCol === -1) {
      throw new Error("Column 'specialty' not found in Bookings sheet");
    }

    const patients = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][specialtyCol]) continue;

      if (String(data[i][specialtyCol]).trim().toLowerCase() === specialty.trim().toLowerCase()) {
        const row = {};
        headers.forEach((h, idx) => row[h] = data[i][idx]);
        row.rowIndex = i + 1;
        patients.push(row);
      }
    }

    Logger.log("Returning patients (raw): " + JSON.stringify(patients));

    // ✅ Force safe JSON return
    return JSON.parse(JSON.stringify(patients));

  } catch (err) {
    Logger.log("❌ Error in getPatientsBySpecialty: " + err);
    return [];
  }
}


// Save notes (col 9)
function savePatientNotes(idNumber, notes) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Bookings");
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) === String(idNumber)) { // col 1 = idNumber
      sheet.getRange(i + 1, 10).setValue(notes); // col 9 → index 10 in .getRange
      return { success: true };
    }
  }
  return { success: false, message: "Patient not found" };
}

// Save prescription (col 10)
function savePatientPrescription(idNumber, prescription) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Bookings");
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) === String(idNumber)) { // col 1 = idNumber
      sheet.getRange(i + 1, 11).setValue(prescription); // col 10 → index 11
      return { success: true };
    }
  }
  return { success: false, message: "Patient not found" };
}

// Mark as checked (col 11)
function markPatientChecked(idNumber) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Bookings");
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) === String(idNumber)) { // col 1 = idNumber
      sheet.getRange(i + 1, 12).setValue("Checked"); // col 11 → index 12
      return { success: true };
    }
  }
  return { success: false, message: "Patient not found" };
}

// Get unique specialties (col 4)
function getAllSpecialties() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Bookings");
  const data = sheet.getDataRange().getValues();

  const set = new Set();
  for (let i = 1; i < data.length; i++) {
    if (data[i][4]) set.add(String(data[i][4]).trim());
  }
  return Array.from(set);
}
