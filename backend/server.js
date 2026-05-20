const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// --- 1. CONNECT TO DATABASE ---
// REPLACE THIS STRING WITH YOUR ACTUAL MONGODB CONNECTION STRING!
// Make sure to replace <password> with your actual database password.
const MONGO_URI = "mongodb+srv://unnamed:unnamed5625@cluster0.a2qb56r.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Connected to MongoDB Atlas"))
    .catch(err => console.log("❌ MongoDB Connection Error:", err));

// --- 2. DEFINE THE DATABASE SCHEMA ---
const readingSchema = new mongoose.Schema({
    device_id: String,
    temperature: Number,
    humidity: Number,
    voc: Number,
    co2: Number,
    oxygen: Number,
    bqi: Number,
    timestamp: { type: Date, default: Date.now }
});

const Reading = mongoose.model('Reading', readingSchema);

// --- 3. MEDICAL ELECTRONICS BREAKPOINT TABLES ---
const co2Breakpoints = [
    { bpLo: 400, bpHi: 600, iLo: 100, iHi: 81 },   
    { bpLo: 601, bpHi: 1000, iLo: 80, iHi: 61 },   
    { bpLo: 1001, bpHi: 1500, iLo: 60, iHi: 41 },  
    { bpLo: 1501, bpHi: 5000, iLo: 40, iHi: 0 }    
];
const vocBreakpoints = [
    { bpLo: 0.0, bpHi: 0.5, iLo: 100, iHi: 81 },   
    { bpLo: 0.51, bpHi: 1.0, iLo: 80, iHi: 61 },   
    { bpLo: 1.01, bpHi: 2.0, iLo: 60, iHi: 41 },   
    { bpLo: 2.01, bpHi: 10.0, iLo: 40, iHi: 0 }    
];
const o2Breakpoints = [
    { bpLo: 20.5, bpHi: 21.0, iLo: 81, iHi: 100 }, 
    { bpLo: 19.5, bpHi: 20.4, iLo: 61, iHi: 80 },  
    { bpLo: 18.0, bpHi: 19.4, iLo: 41, iHi: 60 },  
    { bpLo: 0.0, bpHi: 17.9, iLo: 0, iHi: 40 }     
];

function calculateSubIndex(cp, bpTable) {
    for (let tier of bpTable) {
        if (cp >= tier.bpLo && cp <= tier.bpHi) {
            let ip = ((tier.iHi - tier.iLo) / (tier.bpHi - tier.bpLo)) * (cp - tier.bpLo) + tier.iLo;
            return Math.round(ip);
        }
    }
    return 0; 
}

function calculateFinalBQI(co2, voc, o2) {
    let co2Score = calculateSubIndex(co2, co2Breakpoints);
    let vocScore = calculateSubIndex(voc, vocBreakpoints);
    let o2Score = calculateSubIndex(o2, o2Breakpoints);
    return Math.min(co2Score, vocScore, o2Score);
}

// --- 4. API ROUTES ---

// Hardware Team hits this to upload data
app.post('/api/sensor-data', async (req, res) => {
    try {
        const data = req.body;
        const calculatedBqi = calculateFinalBQI(data.co2, data.voc, data.oxygen);

        // Save data permanently to MongoDB
        const newReading = new Reading({
            ...data,
            bqi: calculatedBqi
        });
        await newReading.save();

        res.status(200).json({ message: "Data received and stored in database" });
    } catch (error) {
        res.status(500).json({ error: "Failed to save data" });
    }
});

// Dashboards hit this to read the single newest pulse
app.get('/api/live-metrics', async (req, res) => {
    try {
        // Find the absolute newest row in the database
        const latest = await Reading.findOne().sort({ timestamp: -1 });
        res.status(200).json(latest || { bqi: 0 }); // Send 0 if database is empty
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch live data" });
    }
});

// Dashboards hit this to load the graph and history table
app.get('/api/history', async (req, res) => {
    try {
        // Grab the last 100 readings, sorted newest to oldest
        const history = await Reading.find().sort({ timestamp: -1 }).limit(100);
        res.status(200).json(history);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch history" });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`🚀 BQI Database API running on port ${PORT}`);
});
