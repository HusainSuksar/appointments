const cors = require("micro-cors")();
const db = require("../init");

module.exports = cors(async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "ID is required" });

    const docRef = db.collection("patients").doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) return res.status(404).json({ error: "Patient not found" });

    res.status(200).json(docSnap.data());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
