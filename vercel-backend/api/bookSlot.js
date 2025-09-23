const db = require("../init");

module.exports = async (req, res) => {
  try {
    const payload = req.body;
    if (!payload || !payload.idNumber) return res.status(400).json({ success: false });

    const patientRef = db.collection("patients").doc(payload.idNumber);
    await patientRef.update({
      bookedSlot: payload.slotId,
      bookedSpecialty: payload.specialty,
      Status: "Checked",
      file: payload.file || null,
    });

    res.json({ success: true, slotLabel: payload.slotLabel || payload.slotId });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: err.message });
  }
};
