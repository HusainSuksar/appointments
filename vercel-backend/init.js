// vercel-backend/api/getPatientById.js

const cors = require("micro-cors")(); // CORS wrapper
const db = require("../init"); // import Firestore instance

module.exports = cors(async (req, res) => {
  try {
    // Accept ID from query string
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: "ID is required" });
    }

    // Fetch patient document
    const docRef = db.collection("patients").doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ error: "Patient not found" });
    }

    // Return patient data
    res.status(200).json(docSnap.data());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
