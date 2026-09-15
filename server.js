const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let cartTelemetry = {
  cartId: "MEDICART-01",
  currentWard: "ICU - 3rd Floor",
  battery: 84,
  bins: {
    yellow: { name: "Yellow (Infectious)", level: 45, maxKg: 15, currentKg: 6.8 },
    red: { name: "Red (Plastics/Catheters)", level: 68, maxKg: 15, currentKg: 10.2 },
    white: { name: "White (Needles/Sharps)", level: 25, maxKg: 10, currentKg: 2.5 },
    blue: { name: "Blue (Glassware/Vials)", level: 30, maxKg: 12, currentKg: 3.6 }
  }
};

let wasteLogs = [
  { id: "LOG-1001", ward: "Emergency", binType: "Yellow", weight: 2.4, item: "Soiled Dressings", timestamp: new Date(Date.now() - 3600000).toLocaleTimeString() },
  { id: "LOG-1002", ward: "Surgery OT-2", binType: "White", weight: 0.8, item: "Scalpels & Syringes", timestamp: new Date(Date.now() - 1800000).toLocaleTimeString() }
];

const segregationRules = {
  "syringe": { bin: "White", note: "Sharps: Puncture-proof container" },
  "needle": { bin: "White", note: "Sharps: Cut needle before discarding" },
  "scalpel": { bin: "White", note: "Sharps/Blades: White translucent bin" },
  "iv tube": { bin: "Red", note: "Contaminated plastic: Autoclaved & recycled" },
  "catheter": { bin: "Red", note: "Rubber/Plastic waste: Red bin" },
  "gloves": { bin: "Red", note: "Latex/Nitrile gloves: Red bin" },
  "cotton": { bin: "Yellow", note: "Soiled cotton/gauze: Yellow incineration bin" },
  "bandage": { bin: "Yellow", note: "Anatomical/pathological waste: Yellow bin" },
  "blood bag": { bin: "Yellow", note: "Infectious body fluid container: Yellow bin" },
  "vial": { bin: "Blue", note: "Glass ampoules/vials: Disinfection & Blue bin" },
  "medicine bottle": { bin: "Blue", note: "Glass medicine bottles: Blue bin" }
};

app.get('/api/cart', (req, res) => {
  res.json(cartTelemetry);
});

app.post('/api/classify', (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: "Item description required" });

  const cleanQuery = query.toLowerCase();
  let matchedRule = null;
  let detectedItem = query;

  for (const [key, val] of Object.entries(segregationRules)) {
    if (cleanQuery.includes(key)) {
      matchedRule = val;
      detectedItem = key.toUpperCase();
      break;
    }
  }

  if (!matchedRule) {
    matchedRule = { bin: "Yellow", note: "Unrecognized medical item. Default to Yellow (Infectious/Incineration) for safety." };
  }

  res.json({
    item: detectedItem,
    recommendedBin: matchedRule.bin,
    protocolNote: matchedRule.note,
    timestamp: new Date().toISOString()
  });
});

app.post('/api/log-waste', (req, res) => {
  const { ward, binType, weight, item } = req.body;

  const newLog = {
    id: `LOG-${Math.floor(1000 + Math.random() * 9000)}`,
    ward: ward || cartTelemetry.currentWard,
    binType,
    weight: parseFloat(weight) || 1.0,
    item: item || "General Medical Waste",
    timestamp: new Date().toLocaleTimeString()
  };

  wasteLogs.unshift(newLog);

  const binKey = binType.toLowerCase();
  if (cartTelemetry.bins[binKey]) {
    cartTelemetry.bins[binKey].currentKg = +(cartTelemetry.bins[binKey].currentKg + newLog.weight).toFixed(2);
    cartTelemetry.bins[binKey].level = Math.min(100, Math.round((cartTelemetry.bins[binKey].currentKg / cartTelemetry.bins[binKey].maxKg) * 100));
  }

  res.status(201).json({ success: true, log: newLog, updatedCart: cartTelemetry });
});

app.get('/api/logs', (req, res) => {
  res.json(wasteLogs);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MEDISORT Server running at port ${PORT}`);
});

