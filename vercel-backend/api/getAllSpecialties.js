const cors = require('cors')({ origin: true });
const db = require('../init');

module.exports = async (req, res) => {
  cors(req, res, async () => {
    try {
      const patientsSnap = await db.collection("patients").get();
      const specialties = new Set();
      patientsSnap.forEach(doc => {
        const data = doc.data();
        if (data.specialties && Array.isArray(data.specialties)) {
          data.specialties.forEach(s => specialties.add(s));
        }
      });
      res.json(Array.from(specialties));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });
};
