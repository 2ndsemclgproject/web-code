const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// This will temporarily act as our database until we plug in PostgreSQL
let latestSensorData = {
    device_id: "BQI-ESP32-001",
    temperature: 28.0,
    humidity: 50.0,
    voc: 1.0,
    co2: 400.0,
    oxygen: 21.0,
    bqi: 100, // Calculated Breath Quality Index
    timestamp: new Date().toISOString()
};

// --- ROUTE 1: Data Ingestion (Hardware Team hits this) ---
app.post('/api/sensor-data', (req, res) => {
    const data = req.body;
    
    // Simple BQI Calculation Logic (Can be refined later)
    // Example: High CO2 lowers the score
    let calculatedBqi = 100 - ((data.co2 - 400) / 10);
    if (calculatedBqi > 100) calculatedBqi = 100;
    if (calculatedBqi < 0) calculatedBqi = 0;

    latestSensorData = {
        ...data,
        bqi: Math.round(calculatedBqi),
        timestamp: new Date().toISOString()
    };

    console.log("New data received and BQI updated:", latestSensorData);
    res.status(200).json({ message: "Data received successfully" });
});

// --- ROUTE 2: Frontend Dashboard (Your Website hits this) ---
app.get('/api/live-metrics', (req, res) => {
    res.status(200).json(latestSensorData);
});

// --- HARDWARE SIMULATOR (Runs while waiting for actual components) ---
setInterval(() => {
    // Generate slight fluctuations to simulate real breathing/air changes
    const fakeData = {
        device_id: "BQI-ESP32-001",
        temperature: (28.0 + (Math.random() * 2 - 1)).toFixed(1),
        humidity: (55.0 + (Math.random() * 5 - 2.5)).toFixed(1),
        voc: (1.2 + (Math.random() * 0.5 - 0.25)).toFixed(2),
        co2: Math.round(450 + (Math.random() * 100 - 50)),
        oxygen: (20.9 - (Math.random() * 0.2)).toFixed(1)
    };

    // Simulate sending data to our own POST route
    fetch(`http://localhost:${PORT}/api/sensor-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fakeData)
    }).catch(err => console.log("Simulator error:", err.message));

}, 5000); // Runs every 5 seconds

// Start the server
app.listen(PORT, () => {
    console.log(`🚀 BQI Backend Server running on http://localhost:${PORT}`);
    console.log(`📡 Hardware Simulator is active and generating data...`);
});
