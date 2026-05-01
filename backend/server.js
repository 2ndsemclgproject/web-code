const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// --- IN-MEMORY DATABASE ---
let latestSensorData = {
    device_id: "BQI-ESP32-001",
    temperature: 28.0,
    humidity: 50.0,
    voc: 1.0,
    co2: 400.0,
    oxygen: 21.0,
    bqi: 95, 
    timestamp: new Date().toISOString()
};

// Array to hold the last 24 hours of data
let historyData = [];

// GENERATE FAKE 24-HOUR HISTORY ON STARTUP
// GENERATE FAKE 24-HOUR HISTORY ON STARTUP
function generateInitialHistory() {
    let now = new Date();
    // Create 24 data points (one for each of the last 24 hours)
    for (let i = 24; i > 0; i--) {
        let pastTime = new Date(now.getTime() - (i * 60 * 60 * 1000));
        historyData.push({
            timestamp: pastTime.toISOString(), // <-- Sending raw time instead of text
            bqi: Math.round(70 + Math.random() * 25)
        });
    }
}
generateInitialHistory();

// --- ROUTE 1: Data Ingestion (Hardware Team hits this) ---
app.post('/api/sensor-data', (req, res) => {
    const data = req.body;
    let calculatedBqi = 100 - ((data.co2 - 400) / 10);
    if (calculatedBqi > 100) calculatedBqi = 100;
    if (calculatedBqi < 0) calculatedBqi = 0;

    latestSensorData = {
        ...data,
        bqi: Math.round(calculatedBqi),
        timestamp: new Date().toISOString()
    };
    res.status(200).json({ message: "Data received successfully" });
});

// --- ROUTE 2: Frontend Live Dashboard (Updates numbers) ---
app.get('/api/live-metrics', (req, res) => {
    res.status(200).json(latestSensorData);
});

// --- ROUTE 3: Frontend History Graph (Loads 24h Chart) ---
app.get('/api/history', (req, res) => {
    res.status(200).json(historyData);
});

// --- HARDWARE SIMULATOR ---
setInterval(() => {
    const fakeData = {
        device_id: "BQI-ESP32-001",
        temperature: (28.0 + (Math.random() * 2 - 1)).toFixed(1),
        humidity: (55.0 + (Math.random() * 5 - 2.5)).toFixed(1),
        voc: (1.2 + (Math.random() * 0.5 - 0.25)).toFixed(2),
        co2: Math.round(420 + (Math.random() * 50 - 25)),
        oxygen: (20.9 - (Math.random() * 0.2)).toFixed(1)
    };

    fetch(`http://localhost:${PORT}/api/sensor-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fakeData)
    }).catch(err => console.log("Simulator error:", err.message));

}, 5000); 

// Start the server
app.listen(PORT, () => {
    console.log(`🚀 BQI Backend Server running on port ${PORT}`);
});
