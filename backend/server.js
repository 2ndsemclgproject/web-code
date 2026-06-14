const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

const MONGO_URI = "mongodb+srv://unnamed:unnamed5625@cluster0.a2qb56r.mongodb.net/BreathIQ?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => {
console.error(err);
process.exit(1);
});

const readingSchema = new mongoose.Schema({
device_id: String,
temperature: Number,
humidity: Number,
mq135: Number,
dust: Number,
spo2: Number,
aqi: Number,
bqi: Number,
category: String,
riskLevel: String,
timestamp: {
type: Date,
default: Date.now
}
});

const Reading = mongoose.model("Reading", readingSchema);

let latestData = {};

let minuteBuffer = [];

function calculateAQI(pm)
{
if (pm <= 12.0)
return Math.round(((50 - 0) / (12.0 - 0.0)) * (pm - 0.0));

if (pm <= 35.4)
    return Math.round(((100 - 51) / (35.4 - 12.1)) * (pm - 12.1) + 51);

if (pm <= 55.4)
    return Math.round(((150 - 101) / (55.4 - 35.5)) * (pm - 35.5) + 101);

if (pm <= 150.4)
    return Math.round(((200 - 151) / (150.4 - 55.5)) * (pm - 55.5) + 151);

if (pm <= 250.4)
    return Math.round(((300 - 201) / (250.4 - 150.5)) * (pm - 150.5) + 201);

if (pm <= 350.4)
    return Math.round(((400 - 301) / (350.4 - 250.5)) * (pm - 250.5) + 301);

if (pm <= 500)
    return Math.round(((500 - 401) / (500 - 350.5)) * (pm - 350.5) + 401);

return 500;

}

function getTemperatureScore(temp)
{
if (temp >= 22 && temp <= 28)
return 0;

if (temp < 22)
    return Math.min(500, (22 - temp) * 20);

return Math.min(500, (temp - 28) * 20);

}

function getHumidityScore(humidity)
{
if (humidity >= 40 && humidity <= 60)
return 0;

if (humidity < 40)
    return Math.min(500, (40 - humidity) * 10);

return Math.min(500, (humidity - 60) * 10);

}

function getSpo2Score(spo2)
{
if (spo2 < 0)
return 250;

if (spo2 >= 98)
    return 0;

return Math.min(500, (100 - spo2) * 25);

}

function getMQ135Score(value)
{
return Math.round((value / 4095) * 500);
}

function calculateBQI(
aqi,
mq135Score,
humidityScore,
temperatureScore,
spo2Score
)
{
return Math.round(
(aqi * 0.50) +
(mq135Score * 0.25) +
(humidityScore * 0.10) +
(temperatureScore * 0.10) +
(spo2Score * 0.05)
);
}

function getCategory(value)
{
if (value <= 50) return "Good";
if (value <= 100) return "Satisfactory";
if (value <= 200) return "Moderate";
if (value <= 300) return "Poor";
if (value <= 400) return "Very Poor";
return "Severe";
}

function getRiskLevel(value)
{
if (value <= 50) return "Low Risk";
if (value <= 100) return "Minimal Risk";
if (value <= 200) return "Medium Risk";
if (value <= 300) return "High Risk";
if (value <= 400) return "Very High Risk";
return "Critical Risk";
}

app.post("/api/sensor-data", async (req, res) =>
{
try
{
const {
device_id,
temperature,
humidity,
mq135,
dust,
spo2
    } = req.body;

    const aqi = calculateAQI(dust);

    const mq135Score =
        getMQ135Score(mq135);

    const humidityScore =
        getHumidityScore(humidity);

    const temperatureScore =
        getTemperatureScore(temperature);

    const spo2Score =
        getSpo2Score(spo2);

    const bqi =
        calculateBQI(
            aqi,
            mq135Score,
            humidityScore,
            temperatureScore,
            spo2Score
        );

    const category =
        getCategory(bqi);

    const riskLevel =
        getRiskLevel(bqi);

    latestData = {
        device_id,
        temperature,
        humidity,
        mq135,
        dust,
        spo2,
          aqi,
        bqi,
        category,
        riskLevel,
        timestamp: new Date()
    };

    minuteBuffer.push(latestData);

    res.status(200).json({
        status: "success",
        aqi,
        bqi,
        category
    });
}
catch (err)
{
    res.status(500).json({
        error: err.message
    });
}

});

app.get("/api/live-metrics", (req, res) =>
{
res.json(latestData);
});

app.get("/api/history", async (req, res) =>
{
const history =
await Reading.find()
.sort({ timestamp: -1 })
.limit(100);

res.json(history);

});

setInterval(async () =>
{
try
{
if (minuteBuffer.length === 0)
return;

    const avgTemperature =
        minuteBuffer.reduce((s, i) => s + i.temperature, 0)
        / minuteBuffer.length;

    const avgHumidity =
        minuteBuffer.reduce((s, i) => s + i.humidity, 0)
        / minuteBuffer.length;

    const avgMQ135 =
        minuteBuffer.reduce((s, i) => s + i.mq135, 0)
        / minuteBuffer.length;

    const avgDust =
        minuteBuffer.reduce((s, i) => s + i.dust, 0)
        / minuteBuffer.length;

    const avgSpo2 =
        minuteBuffer.reduce((s, i) => s + i.spo2, 0)
        / minuteBuffer.length;

    const aqi =
        calculateAQI(avgDust);

    const bqi =
        calculateBQI(
            aqi,
            getMQ135Score(avgMQ135),
            getHumidityScore(avgHumidity),
            getTemperatureScore(avgTemperature),
            getSpo2Score(avgSpo2)
        );

    const reading =
        new Reading({
            device_id:
                minuteBuffer[0].device_id,

            temperature:
                Number(avgTemperature.toFixed(2)),

            humidity:
                Number(avgHumidity.toFixed(2)),

            mq135:
                Number(avgMQ135.toFixed(2)),

            dust:
                Number(avgDust.toFixed(2)),

            spo2:
                Number(avgSpo2.toFixed(2)),


            aqi,

            bqi,

            category:
                getCategory(bqi),

            riskLevel:
                getRiskLevel(bqi)
        });

    await reading.save();

    minuteBuffer = [];
}
catch (err)
{
    console.error(err.message);
}

}, 60000);

app.listen(PORT, () =>
{
console.log(
`Server Running On Port ${PORT}`
);
});
