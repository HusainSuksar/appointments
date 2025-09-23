const cors = require('cors')({ origin: true });
const db = require('../init');

module.exports = async (req, res) => {
  cors(req, res, async () => {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: "ID is required" });

      const doc = await db.collection("patients").doc(id).get();
      if (!doc.exists) return res.json(null);

      res.json(doc.data());
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });
};
