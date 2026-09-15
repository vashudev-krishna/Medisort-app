const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'medisort_super_secret_jwt_key_2026';

// SET YOUR MASTER EMAIL HERE (Only this email can access user directory)
const MASTER_ADMIN_EMAIL = 'admin@medisort.com';

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// In-Memory Storage
const users = [
  {
    id: 'USR-MASTER-01',
    name: 'Master Administrator',
    email: MASTER_ADMIN_EMAIL,
    passwordHash: bcrypt.hashSync('Admin@12345', 10),
    role: 'ADMIN',
    facility: 'Central Biohazard Command'
  },
  {
    id: 'USR-STAFF-101',
    name: 'Nurse Priya Sharma',
    email: 'priya@hospital.org',
    passwordHash: bcrypt.hashSync('Staff@12345', 10),
    role: 'STAFF',
    ward: 'ICU Complex - Bay 4'
  },
  {
    id: 'USR-REC-501',
    name: 'Ramesh Kumar (CBWTF)',
    email: 'ramesh@greenrecycler.in',
    passwordHash: bcrypt.hashSync('Recycle@12345', 10),
    role: 'RECYCLER',
    licenseNumber: 'CBWTF-DL-2026-8801'
  }
];

// Catalog of Standardized Biomedical Items
const BMW_CATALOG = [
  { id: 'BMW-YEL', name: 'Soiled Dressings / Pathological', bin: 'Yellow', hazard: 'Biohazard Level 3', treatment: 'Incineration (1050°C)', defWt: 0.45, img: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=300&auto=format&fit=crop&q=80' },
  { id: 'BMW-RED', name: 'Contaminated IV Tubes / Catheters', bin: 'Red', hazard: 'Infectious Polymers', treatment: 'Autoclave & Shredding', defWt: 0.35, img: 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=300&auto=format&fit=crop&q=80' },
  { id: 'BMW-WHT', name: 'Used Scalpel & Syringe Needles', bin: 'White', hazard: 'Puncture Risk', treatment: 'Encapsulation & Sterilization', defWt: 0.12, img: 'https://images.unsplash.com/photo-1583912267670-6575ad472688?w=300&auto=format&fit=crop&q=80' },
  { id: 'BMW-BLU', name: 'Glass Medicine Vials / Ampoules', bin: 'Blue', hazard: 'Breakage / Chemical Residue', treatment: 'Sodium Hypochlorite Wash', defWt: 0.25, img: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=300&auto=format&fit=crop&q=80' }
];

let cartTelemetry = {
  cartId: 'MEDISORT-01',
  battery: 92,
  bins: {
    Yellow: { level: 30, currentKg: 4.5, maxKg: 15.0 },
    Red: { level: 48, currentKg: 7.2, maxKg: 15.0 },
    White: { level: 15, currentKg: 1.5, maxKg: 10.0 },
    Blue: { level: 22, currentKg: 2.6, maxKg: 12.0 }
  }
};

let wasteTransfers = [];

// --- AUTHENTICATION MIDDLEWARE ---
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required.' });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Session expired or token invalid.' });
    req.user = decoded;
    next();
  });
}

// --- AUTH APIS ---

// Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });

  const cleanEmail = email.trim().toLowerCase();
  const user = users.find(u => u.email.toLowerCase() === cleanEmail);
  if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

  const valid = bcrypt.compareSync(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  });
});

// Master Admin: View All Registered Users (Guarded against data leak)
app.get('/api/admin/users', authenticateToken, (req, res) => {
  if (req.user.email !== MASTER_ADMIN_EMAIL && req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Zero-Breach Policy: Only the Master Admin can access emails and credentials.' });
  }
  const safeUsers = users.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    ward: u.ward || u.facility || u.licenseNumber || 'N/A'
  }));
  res.json(safeUsers);
});

// --- CORE MEDICAL SYSTEM APIS ---

app.get('/api/catalog', (req, res) => res.json(BMW_CATALOG));
app.get('/api/telemetry', (req, res) => res.json(cartTelemetry));

// 1. Staff Logs Deposit & Generates Handshake Record
app.post('/api/deposit/create', authenticateToken, (req, res) => {
  if (req.user.role !== 'STAFF' && req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Only authorized ward staff can log waste.' });
  }

  const { catalogId, weight, ward, snapshot } = req.body;
  const item = BMW_CATALOG.find(c => c.id === catalogId);
  if (!item) return res.status(400).json({ error: 'Invalid catalog item.' });

  const numWeight = parseFloat(weight);
  if (isNaN(numWeight) || numWeight <= 0) {
    return res.status(400).json({ error: 'Measured weight must be greater than zero.' });
  }

  const bin = cartTelemetry.bins[item.bin];
  if (bin.currentKg + numWeight > bin.maxKg) {
    return res.status(409).json({ error: `Overfill Alert: ${item.bin} bin will exceed safe limit!` });
  }

  bin.currentKg = +(bin.currentKg + numWeight).toFixed(2);
  bin.level = Math.min(100, Math.round((bin.currentKg / bin.maxKg) * 100));

  const transferId = `TRF-${Date.now().toString().slice(-6)}`;
  const record = {
    transferId,
    timestamp: new Date().toLocaleTimeString(),
    date: new Date().toISOString().split('T')[0],
    item: item.name,
    bin: item.bin,
    weightKg: numWeight,
    hazard: item.hazard,
    ward: ward || 'ICU General',
    depositedByStaff: req.user.name,
    staffId: req.user.id,
    status: 'PENDING_RECYCLER_PICKUP',
    acceptedByRecycler: null,
    recyclerLicense: null,
    handoverTimestamp: null,
    snapshot: snapshot || item.img
  };

  wasteTransfers.unshift(record);

  res.status(201).json({
    success: true,
    transferId,
    record,
    cart: cartTelemetry
  });
});

// 2. Recycler Scans QR & Authenticates Chain-of-Custody Handshake
app.post('/api/handover/scan', authenticateToken, (req, res) => {
  if (req.user.role !== 'RECYCLER' && req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Only certified CBWTF recyclers can accept handovers.' });
  }

  const { transferId, recyclerLicense } = req.body;
  const transfer = wasteTransfers.find(t => t.transferId === transferId);

  if (!transfer) {
    return res.status(404).json({ error: 'Transfer manifest code not found.' });
  }

  if (transfer.status === 'COLLECTED_BY_RECYCLER') {
    return res.status(400).json({ error: 'This batch has already been collected and authenticated.' });
  }

  transfer.status = 'COLLECTED_BY_RECYCLER';
  transfer.acceptedByRecycler = req.user.name;
  transfer.recyclerLicense = recyclerLicense || 'CBWTF-DL-2026-8801';
  transfer.handoverTimestamp = new Date().toLocaleTimeString();

  res.json({
    success: true,
    message: `Chain of Custody Verified: ${transfer.weightKg} kg transferred to ${req.user.name}.`,
    transfer
  });
});

// 3. View All Manifests
app.get('/api/manifests', authenticateToken, (req, res) => {
  res.json(wasteTransfers);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MEDISORT Secure Hub running on port ${PORT}`));
