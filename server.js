  const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// Increase payload limit to allow camera snapshots (base64 images)
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Canonical Medical Waste Master Catalog (Strict BMW Rules Compliant)
const BMW_CATALOG = {
  "soiled_gauze": {
    id: "soiled_gauze",
    name: "Soiled Gauze & Cotton",
    bin: "Yellow",
    treatment: "Incineration / Deep Burial",
    hazard: "Pathological / Blood Contamination",
    icon: "fa-bandage",
    refImage: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=300&auto=format&fit=crop&q=60"
  },
  "blood_bag": {
    id: "blood_bag",
    name: "Blood Bag & Fluid Bags",
    bin: "Yellow",
    treatment: "Incineration / Autoclaving",
    hazard: "Infectious Body Fluids",
    icon: "fa-tint",
    refImage: "https://images.unsplash.com/photo-1615461066841-6116e61058f4?w=300&auto=format&fit=crop&q=60"
  },
  "iv_tubing": {
    id: "iv_tubing",
    name: "IV Line & Infusion Sets",
    bin: "Red",
    treatment: "Autoclaving followed by Shredding",
    hazard: "Contaminated Non-Sharps Plastic",
    icon: "fa-network-wired",
    refImage: "https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=300&auto=format&fit=crop&q=60"
  },
  "catheter": {
    id: "catheter",
    name: "Urine Bag & Catheters",
    bin: "Red",
    treatment: "Sterilization / Chemical Recycling",
    hazard: "Polymer Fluid Contamination",
    icon: "fa-vial",
    refImage: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=300&auto=format&fit=crop&q=60"
  },
  "hypodermic_needle": {
    id: "hypodermic_needle",
    name: "Hypodermic Needle / Scalpel",
    bin: "White",
    treatment: "Dry Heat / Puncture-proof Encapsulation",
    hazard: "Puncture & Sharps Injury Risk",
    icon: "fa-syringe",
    refImage: "https://images.unsplash.com/photo-1583912267670-6575ad472688?w=300&auto=format&fit=crop&q=60"
  },
  "glass_ampoule": {
    id: "glass_ampoule",
    name: "Glass Ampoule / Medicine Vial",
    bin: "Blue",
    treatment: "Disinfection & Glass Recycling",
    hazard: "Breakage / Chemical Residue",
    icon: "fa-prescription-bottle",
    refImage: "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=300&auto=format&fit=crop&q=60"
  }
};

// System State
let cartTelemetry = {
  cartId: "MEDICART-01",
  status: "OPERATIONAL",
  currentWard: "Trauma Ward - 2A",
  battery: 92,
  bins: {
    Yellow: { level: 25, currentKg: 3.75, maxKg: 15.0, count: 4 },
    Red: { level: 40, currentKg: 6.0, maxKg: 15.0, count: 6 },
    White: { level: 12, currentKg: 1.2, maxKg: 10.0, count: 2 },
    Blue: { level: 18, currentKg: 2.16, maxKg: 12.0, count: 3 }
  }
};

let wasteLogs = [];

// --- APIs ---

// 1. Fetch Waste Classification Catalog
app.get('/api/catalog', (req, res) => {
  res.json(Object.values(BMW_CATALOG));
});

// 2. Fetch Live Cart Telemetry
app.get('/api/cart', (req, res) => {
  res.json(cartTelemetry);
});

// 3. Process Medical Waste Deposit
app.post('/api/deposit', (req, res) => {
  const { catalogId, weight, ward, snapshot } = req.body;

  // Validation
  const item = BMW_CATALOG[catalogId];
  if (!item) {
    return res.status(400).json({ error: "Invalid classification identifier." });
  }

  const numWeight = parseFloat(weight);
  if (isNaN(numWeight) || numWeight <= 0 || numWeight > 10.0) {
    return res.status(400).json({ error: "Invalid weight. Value must be between 0.01 kg and 10.0 kg." });
  }

  const bin = cartTelemetry.bins[item.bin];
  if (!bin) {
    return res.status(500).json({ error: "Target bin not recognized." });
  }

  // Prevent Overfilling
  if (bin.currentKg + numWeight > bin.maxKg) {
    return res.status(409).json({ 
      error: `Bin capacity exceeded! ${item.bin} bin cannot accept ${numWeight} kg. Please empty the bin.` 
    });
  }

  // Update Telemetry
  bin.currentKg = +(bin.currentKg + numWeight).toFixed(2);
  bin.level = Math.min(100, Math.round((bin.currentKg / bin.maxKg) * 100));
  bin.count += 1;

  // Record Audit Entry
  const newLog = {
    id: `MED-${Date.now().toString().slice(-6)}`,
    catalogId: item.id,
    itemName: item.name,
    bin: item.bin,
    weightKg: numWeight,
    hazard: item.hazard,
    ward: ward || cartTelemetry.currentWard,
    hasImage: Boolean(snapshot),
    snapshot: snapshot || item.refImage,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    date: new Date().toISOString().split('T')[0]
  };

  wasteLogs.unshift(newLog);

  res.status(201).json({
    success: true,
    message: `Waste recorded into ${item.bin} Bin successfully.`,
    log: newLog,
    telemetry: cartTelemetry
  });
});

// 4. Fetch Logs
app.get('/api/logs', (req, res) => {
  res.json(wasteLogs);
});

// 5. Emergency Bin Reset (Discharge Cycle)
app.post('/api/bins/empty', (req, res) => {
  const { binType } = req.body;
  if (cartTelemetry.bins[binType]) {
    cartTelemetry.bins[binType].currentKg = 0.0;
    cartTelemetry.bins[binType].level = 0;
    cartTelemetry.bins[binType].count = 0;
    return res.json({ success: true, telemetry: cartTelemetry });
  }
  res.status(400).json({ error: "Invalid bin specified." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MEDISORT Server running at port ${PORT}`);
});
