const db = require("../init");

module.exports = async (req, res) => {
  try {
    const { specialty } = req.query;
    if (!specialty) return res.status(400).json({ error: "Specialty is required" });

    const snap = await db.collection("patients")
      .where("specialties", "array-contains", specialty)
      .get();

    const patients = [];
    snap.forEach(doc => patients.push(doc.data()));

    res.json(patients);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
