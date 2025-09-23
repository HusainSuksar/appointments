// ---------- firebaseFunctions.js ----------
// Firebase setup
const admin = require("firebase-admin");
const { v4: uuidv4 } = require("uuid");

admin.initializeApp();
const db = admin.firestore();
const storage = admin.storage();

// COLLECTIONS
const SLOTS = db.collection("slots");
const BOOKINGS = db.collection("bookings");
const PATIENTS = db.collection("patients");

// ---------- UTILITIES ----------
function formatDateHuman(dateStr) {
  try {
    let d = dateStr instanceof Date ? dateStr : new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch (e) {
    return dateStr;
  }
}

// ---------- STORAGE UPLOAD ----------
async function uploadFile(base64, mimeType, filename) {
  try {
    const bucket = storage.bucket(); // default bucket
    const buffer = Buffer.from(base64, "base64");
    const uniqueName = `${Date.now()}_${uuidv4()}_${filename}`;
    const file = bucket.file(uniqueName);

    await file.save(buffer, {
      metadata: { contentType: mimeType },
    });

    // Generate signed URL (valid till 2030)
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: "03-01-2030",
    });

    return { success: true, url, filePath: uniqueName };
  } catch (err) {
    console.error("❌ Upload error:", err);
    return { success: false, message: "Upload failed" };
  }
}

// ---------- CORE FUNCTIONS ----------

// Ensure slotIds exist (generate if missing)
async function ensureSlotIds() {
  const snap = await SLOTS.get();
  const batch = db.batch();
  let changed = false;
  snap.forEach((doc, idx) => {
    if (!doc.data().slotId) {
      batch.update(doc.ref, { slotId: `SLOT_${idx + 1}` });
      changed = true;
    }
  });
  if (changed) await batch.commit();
}

// Get unique specialties
async function getSpecialties() {
  await ensureSlotIds();
  const snap = await SLOTS.get();
  const specialties = new Set();
  snap.forEach((doc) => {
    const sp = doc.data().specialty;
    if (sp && sp.trim()) specialties.add(sp.trim());
  });
  return Array.from(specialties).sort();
}

// Get slots for a specialty
async function getSlotsForSpecialty(specialty) {
  await ensureSlotIds();
  const snap = await SLOTS.where("specialty", "==", specialty).get();
  const out = [];
  snap.forEach((doc) => {
    const row = doc.data();
    const capacity = Number(row.capacity || 0);
    const booked = Number(row.booked || 0);
    out.push({
      slotId: row.slotId,
      date: row.date,
      timeRange: row.timeRange,
      capacity,
      booked,
      available: capacity - booked,
      label: `${formatDateHuman(row.date)} | ${row.timeRange} (${booked}/${capacity})`,
      docId: doc.id,
    });
  });
  return out.sort((a, b) => new Date(a.date) - new Date(b.date));
}

// Book a slot (with optional file upload)
async function bookSlot(payload) {
  const slotRef = SLOTS.doc(payload.slotId);
  const bookingRef = BOOKINGS;

  return db.runTransaction(async (t) => {
    const slotDoc = await t.get(slotRef);
    if (!slotDoc.exists) throw new Error("Slot not found");

    const slot = slotDoc.data();
    const capacity = Number(slot.capacity || 0);
    let booked = Number(slot.booked || 0);

    if (booked >= capacity) {
      return { success: false, message: "Slot already full." };
    }

    // Prevent duplicate booking
    const existing = await bookingRef
      .where("idNumber", "==", payload.idNumber)
      .where("specialty", "==", payload.specialty)
      .limit(1)
      .get();

    if (!existing.empty) {
      return { success: false, message: "You already booked a slot for this specialty." };
    }

    // ✅ File Upload
    let fileUrl = "";
    if (payload.file && payload.file.base64) {
      const uploaded = await uploadFile(
        payload.file.base64,
        payload.file.mimeType,
        payload.file.name
      );
      if (uploaded.success) fileUrl = uploaded.url;
    }

    // Update booked count
    booked++;
    t.update(slotRef, { booked });

    // Save booking
    const slotLabel = `${formatDateHuman(slot.date)} | ${slot.timeRange}`;
    t.set(bookingRef.doc(), {
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      idNumber: payload.idNumber,
      phone: payload.phone,
      name: payload.name || "",
      specialty: payload.specialty,
      slotId: payload.slotId,
      slotLabel,
      fileUrl,
      notes: payload.notes || "",
      prescription: "",
      status: "Pending",
    });

    return { success: true, message: "Booked", slotLabel, fileUrl };
  });
}

// Get patient by ID
async function getPatientById(idNumber) {
  const doc = await PATIENTS.doc(String(idNumber)).get();
  if (!doc.exists) return null;
  const p = doc.data();
  return {
    idNumber: doc.id,
    name: p.name,
    phone: p.phone,
    age: p.age,
    phase: p.phase,
    specialties: (p.specialties || "").split(",").map((s) => s.trim()),
  };
}

// Get all patients for a given specialty
async function getPatientsBySpecialty(specialty) {
  const snap = await BOOKINGS.where("specialty", "==", specialty).get();
  const patients = [];
  snap.forEach((doc) => {
    patients.push({ ...doc.data(), docId: doc.id });
  });
  return patients;
}

// Save notes
async function savePatientNotes(idNumber, notes) {
  const snap = await BOOKINGS.where("idNumber", "==", idNumber).limit(1).get();
  if (snap.empty) return { success: false, message: "Patient not found" };

  const ref = snap.docs[0].ref;
  await ref.update({ notes });
  return { success: true };
}

// Save prescription
async function savePatientPrescription(idNumber, prescription) {
  const snap = await BOOKINGS.where("idNumber", "==", idNumber).limit(1).get();
  if (snap.empty) return { success: false, message: "Patient not found" };

  const ref = snap.docs[0].ref;
  await ref.update({ prescription });
  return { success: true };
}

// Mark as checked
async function markPatientChecked(idNumber) {
  const snap = await BOOKINGS.where("idNumber", "==", idNumber).limit(1).get();
  if (snap.empty) return { success: false, message: "Patient not found" };

  const ref = snap.docs[0].ref;
  await ref.update({ status: "Checked" });
  return { success: true };
}

// Get all specialties (from bookings)
async function getAllSpecialties() {
  const snap = await BOOKINGS.get();
  const set = new Set();
  snap.forEach((doc) => {
    if (doc.data().specialty) set.add(doc.data().specialty.trim());
  });
  return Array.from(set);
}

// ---------- EXPORT ----------
module.exports = {
  getSpecialties,
  getSlotsForSpecialty,
  bookSlot,
  getPatientById,
  getPatientsBySpecialty,
  savePatientNotes,
  savePatientPrescription,
  markPatientChecked,
  getAllSpecialties,
};
