const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// --- 1. MEDICAL ELECTRONICS BREAKPOINT TABLES ---
// Your hardware team can easily adjust these values once the physical sensors arrive.

const co2Breakpoints = [
    { bpLo: 400, bpHi: 600, iLo: 100, iHi: 81 },   // Excellent
    { bpLo: 601, bpHi: 1000, iLo: 80, iHi: 61 },   // Good
    { bpLo: 1001, bpHi: 1500, iLo: 60, iHi: 41 },  // Moderate
    { bpLo: 1501, bpHi: 5000, iLo: 40, iHi: 0 }    // Poor
];

const vocBreakpoints = [
    { bpLo: 0.0, bpHi: 0.5, iLo: 100, iHi: 81 },   // Excellent
    { bpLo: 0.51, bpHi: 1.0, iLo: 80, iHi: 61 },   // Good
    { bpLo: 1.01, bpHi: 2.0, iLo: 60, iHi: 41 },   // Moderate
    { bpLo: 2.01, bpHi: 10.0, iLo: 40, iHi: 0 }    // Poor
];

// O2 is inverted: Lower concentration = Worse score
const o2Breakpoints = [
    { bpLo: 20.5, bpHi: 21.0, iLo: 81, iHi: 100 }, // Excellent (21% is perfect 100)
    { bpLo: 19.5, bpHi: 20.4, iLo: 61, iHi: 80 },  // Good
    { bpLo: 18.0, bpHi: 19.4, iLo: 41, iHi: 60 },  // Moderate
    { bpLo: 0.0, bpHi: 17.9, iLo: 0, iHi: 40 }     // Poor
];

// --- 2. BQI INTERPOLATION ALGORITHM ---
function calculateSubIndex(cp, bpTable) {
    for (let tier of bpTable) {
        if (cp >= tier.bpLo && cp <= tier.bpHi) {
            // The official Piecewise Linear Interpolation Formula
            let ip = ((tier.iHi - tier.iLo) / (tier.bpHi - tier.bpLo)) * (cp - tier.bpLo) + tier.iLo;
            return Math.round(ip);
        }
    }
    // Fallback if sensor goes completely out of normal bounds
    return 0; 
}

function calculateFinalBQI(co2, voc, o2) {
    let co2Score = calculateSubIndex(co2, co2Breakpoints);
    let vocScore = calculateSubIndex(voc, vocBreakpoints);
    let o2Score = calculateSubIndex(o2, o2Breakpoints);
    
    // "Worst Pollutant Dictates" Method
    return Math.min(co2Score, vocScore, o2Score);
}

// --- 3. DATABASE STATE ---
let latestSensorData = {
    device_id: "BQI-ESP32-001", temperature: 28.0, humidity: 50.0, voc: 0.2, co2: 450, oxygen: 20.9, bqi: 98, 
    timestamp: new Date().toISOString()
};

let historyData = [];

// GENERATE FAKE 24-HOUR HISTORY ON STARTUP
function generateInitialHistory() {
    let now = new Date();
    for (let i = 24; i > 0; i--) {
        let pastTime = new Date(now.getTime() - (i * 60 * 60 * 1000));
        historyData.push({
            timestamp: pastTime.toISOString(),
            bqi: Math.round(70 + Math.random() * 25)
        });
    }
}
generateInitialHistory();

// --- 4. API ROUTES ---

// Hardware Team hits this to upload data
app.post('/api/sensor-data', (req, res) => {
    const data = req.body;
    
    // Run the medical algorithm on the incoming data
    const calculatedBqi = calculateFinalBQI(data.co2, data.voc, data.oxygen);

    latestSensorData = {
        ...data,
        bqi: calculatedBqi,
        timestamp: new Date().toISOString()
    };
    res.status(200).json({ message: "Data received successfully" });
});

// Dashboards hit these to read data
app.get('/api/live-metrics', (req, res) => { res.status(200).json(latestSensorData); });
app.get('/api/history', (req, res) => { res.status(200).json(historyData); });


// --- 5. HARDWARE SIMULATOR ---
setInterval(() => {
    // Generate realistic fluctuating values
    const simCo2 = Math.round(420 + (Math.random() * 200));
    const simVoc = parseFloat((0.2 + (Math.random() * 0.8)).toFixed(2));
    const simO2 = parseFloat((20.9 - (Math.random() * 0.5)).toFixed(1));

    const fakeData = {
        device_id: "BQI-ESP32-001",
        temperature: (28.0 + (Math.random() * 2 - 1)).toFixed(1),
        humidity: (55.0 + (Math.random() * 5 - 2.5)).toFixed(1),
        voc: simVoc,
        co2: simCo2,
        oxygen: simO2
    };

    fetch(`http://localhost:${PORT}/api/sensor-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fakeData)
    }).catch(err => console.log("Simulator error:", err.message));

}, 5000); 

// Start the server
app.listen(PORT, () => {
    console.log(`🚀 Advanced BQI Server running on port ${PORT}`);
});
