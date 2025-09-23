// api/getSlotsBySpecialty.js
const db = require("../init");

module.exports = async (req, res) => {
  try {
    const { specialty } = req.query;
    if (!specialty) return res.status(400).json({ error: "Specialty is required" });

    // Mock slots data - replace with your actual slot logic
    const slots = [
      { slotId: "slot1", label: "Monday 9:00 AM", specialty: specialty },
      { slotId: "slot2", label: "Monday 10:00 AM", specialty: specialty },
      { slotId: "slot3", label: "Tuesday 2:00 PM", specialty: specialty }
    ];

    // Filter by specialty if needed
    const filteredSlots = slots.filter(slot => slot.specialty === specialty);
    
    res.json(filteredSlots);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
