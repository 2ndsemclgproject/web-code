#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <DHT11.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"

const char* ssid = "vivo";
const char* password = "20072012";

const char* serverUrl =
"https://api.breathiq.qzz.io/api/sensor-data";

#define DHT11_PIN 7
#define MQ135_PIN 6

#define SDA_PIN 19
#define SCL_PIN 20

#define GP2Y10_LED_PIN 5
#define GP2Y10_ANALOG_PIN 4

#define BUFFER_SIZE 100

DHT11 dht11(DHT11_PIN);
MAX30105 particleSensor;

uint32_t irBuffer[BUFFER_SIZE];
uint32_t redBuffer[BUFFER_SIZE];

int32_t spo2;
int8_t validSPO2;


const int GP2Y10_DELAY_1 = 280;
const int GP2Y10_DELAY_2 = 40;

const float GP2Y10_OFF_TIME = 9680;

const float VOLTAGE_DIVIDER_FACTOR = 1.5;
const float DUST_CALIBRATION_FACTOR = 0.17;

const int DUST_SAMPLE_COUNT = 50;

int lastTemperature = 0;
int lastHumidity = 0;

void connectWiFi()
{
WiFi.begin(ssid, password);

Serial.print("Connecting to WiFi");

while (WiFi.status() != WL_CONNECTED)
{
    delay(500);
    Serial.print(".");
}

Serial.println();
Serial.println("WiFi Connected");
Serial.print("IP Address: ");
Serial.println(WiFi.localIP());

}

void initializeMAX30102()
{
if (!particleSensor.begin(Wire, I2C_SPEED_FAST))
{
Serial.println("MAX30102 not detected");

    while (true)
    {
        delay(1000);
    }
}

particleSensor.setup(
    60,
    4,
    2,
    100,
    411,
    4096
);

for (byte i = 0; i < BUFFER_SIZE; i++)
{
    while (!particleSensor.available())
    {
        particleSensor.check();
    }

    redBuffer[i] = particleSensor.getRed();
    irBuffer[i] = particleSensor.getIR();

    particleSensor.nextSample();
}

}

float readDustSensor()
{
float totalVoltage = 0;

for (int i = 0; i < DUST_SAMPLE_COUNT; i++)
{
    digitalWrite(GP2Y10_LED_PIN, LOW);

    delayMicroseconds(GP2Y10_DELAY_1);

    float milliVolts =
        analogReadMilliVolts(
            GP2Y10_ANALOG_PIN
        );

    delayMicroseconds(GP2Y10_DELAY_2);

    digitalWrite(GP2Y10_LED_PIN, HIGH);

    delayMicroseconds(GP2Y10_OFF_TIME);

    float voltage =
        (milliVolts / 1000.0)
        *
        VOLTAGE_DIVIDER_FACTOR;

    totalVoltage += voltage;
}

float averageVoltage =
    totalVoltage /
    DUST_SAMPLE_COUNT;

float dustDensityMg =
    (averageVoltage *
    DUST_CALIBRATION_FACTOR)
    -
    0.1;

float dustDensityUg =
    dustDensityMg * 1000.0;

if (dustDensityUg < 0)
{
    dustDensityUg = 0;
}

return dustDensityUg;

}

void readPulseOximeter()
{
for (byte i = 25; i < BUFFER_SIZE; i++)
{
redBuffer[i - 25] =
redBuffer[i];

    irBuffer[i - 25] =
        irBuffer[i];
}

for (byte i = 75; i < BUFFER_SIZE; i++)
{
    while (!particleSensor.available())
    {
        particleSensor.check();
    }

    redBuffer[i] =
        particleSensor.getRed();

    irBuffer[i] =
        particleSensor.getIR();

    particleSensor.nextSample();
}

int32_t heartRate;
int8_t validHeartRate;

maxim_heart_rate_and_oxygen_saturation(
    irBuffer,
    BUFFER_SIZE,
    redBuffer,
    &spo2,
    &validSPO2,
    &heartRate,
    &validHeartRate
);

}

void setup()
{
Serial.begin(115200);

analogReadResolution(12);

connectWiFi();

Wire.begin(
    SDA_PIN,
    SCL_PIN
);

pinMode(
    GP2Y10_LED_PIN,
    OUTPUT
);

digitalWrite(
    GP2Y10_LED_PIN,
    HIGH
);

analogSetAttenuation(
    ADC_11db
);

initializeMAX30102();

Serial.println(
    "BreathIQ Sensor Node Ready"
);

}

void loop()
{
if (WiFi.status() != WL_CONNECTED)
{
connectWiFi();
}

int temperature = 0;
int humidity = 0;

int dhtStatus =
    dht11.readTemperatureHumidity(
        temperature,
        humidity
    );

if (dhtStatus == 0)
{
    lastTemperature = temperature;
    lastHumidity = humidity;
}
else
{
    temperature = lastTemperature;
    humidity = lastHumidity;
}

int mq135Value =
    analogRead(
        MQ135_PIN
    );

float dustValue =
    readDustSensor();

readPulseOximeter();

int finalSpO2 =
    validSPO2 ?
    spo2 :
    -1;


StaticJsonDocument<512> payload;

payload["device_id"] =
    "BQI-ESP32-001";

payload["temperature"] =
    temperature;

payload["humidity"] =
    humidity;

payload["mq135"] =
    mq135Value;

payload["dust"] =
    round(dustValue * 100.0) / 100.0;

payload["spo2"] =
    finalSpO2;


String jsonPayload;

serializeJson(
    payload,
    jsonPayload
);

Serial.println();
Serial.println("========== BREATHIQ ==========");
Serial.println(jsonPayload);
Serial.println("==============================");

HTTPClient http;

http.begin(serverUrl);
http.setInsecure();

http.addHeader(
    "Content-Type",
    "application/json"
);

int responseCode =
    http.POST(
        jsonPayload
    );

String response =
    http.getString();

Serial.print("HTTP: ");
Serial.println(responseCode);

Serial.print("SERVER: ");
Serial.println(response);

http.end();

delay(5000);

}
