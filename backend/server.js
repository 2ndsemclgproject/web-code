const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// --- 1. DATABASE CONNECTION ---
// Ensure this string is correct. Do not share this password publicly!
const MONGO_URI = "mongodb+srv://unnamed:unnamed5625@cluster0.a2qb56r.mongodb.net/BreathIQ?retryWrites=true&w=majority&appName=Cluster0";

// Replace your old mongoose.connect block with this:
const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ Connected to MongoDB Atlas");
    } catch (err) {
        console.error("❌ MongoDB Connection Error:", err);
        process.exit(1); // Stop the server if the DB fails
    }
};

connectDB();

// --- 2. DATABASE SCHEMA ---
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

// --- 3. BQI CALCULATOR ---
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

// --- 4. API ROUTES ---
app.post('/api/sensor-data', async (req, res) => {
    try {
        const { co2, voc, oxygen, temperature, humidity, device_id } = req.body;
        const bqi = Math.min(
            calculateSubIndex(co2, co2Breakpoints),
            calculateSubIndex(voc, vocBreakpoints),
            calculateSubIndex(oxygen, o2Breakpoints)
        );

        const newReading = new Reading({ device_id, temperature, humidity, voc, co2, oxygen, bqi });
        await newReading.save();
        res.status(200).json({ status: "success", bqi });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/live-metrics', async (req, res) => {
    const latest = await Reading.findOne().sort({ timestamp: -1 });
    res.json(latest || { bqi: 0 });
});

app.get('/api/history', async (req, res) => {
    const history = await Reading.find().sort({ timestamp: -1 }).limit(50);
    res.json(history);
});

app.listen(PORT, () => console.log(`Server ready on port ${PORT}`));
