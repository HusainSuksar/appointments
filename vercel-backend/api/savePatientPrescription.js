const db = require("../init");

module.exports = async (req, res) => {
  try {
    const { id, prescription } = req.body;
    if (!id) return res.status(400).json({ success: false, message: "ID required" });

    await db.collection("patients").doc(id).update({ prescription });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: err.message });
  }
};
