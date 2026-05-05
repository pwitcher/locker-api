const express = require('express');
const app = express();
app.use(express.json());

// In-memory "database"
let lockers = [
  { id: "L-101", size: "S", status: "available", code: null },
  { id: "L-102", size: "M", status: "available", code: null },
  { id: "L-103", size: "L", status: "available", code: null },
];

// GET /lockers - List all lockers
app.get('/lockers', (req, res) => {
  res.json(lockers);
});

// POST /lockers/reserve - Reserve a locker
app.post('/lockers/reserve', (req, res) => {
  const { size, packageId } = req.body;
  const locker = lockers.find(l => l.size === size && l.status === 'available');

  if (!locker) {
    return res.status(404).json({ error: `No available ${size} lockers.` });
  }

  locker.status = 'reserved';
  locker.code = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit code
  res.json({ 
    message: "Locker reserved successfully", 
    lockerId: locker.id, 
    accessCode: locker.code 
  });
});

// GET /lockers/{id}/access-code - Get access code (Security check)
app.get('/lockers/:id/access-code', (req, res) => {
  const locker = lockers.find(l => l.id === req.params.id);
  if (!locker || !locker.code) {
    return res.status(404).json({ error: "Locker not reserved or not found." });
  }
  res.json({ lockerId: locker.id, code: locker.code });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Smart Locker API running on http://localhost:${PORT}`));