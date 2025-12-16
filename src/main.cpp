#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include "MAX30105.h"

// WiFi credentials
const char* ssid = "HIFIAIR_ADVAN V1 PRO_D916";
const char* password = "2FC5F887";

// PythonAnywhere URL
const char* flaskURL = "http://yudhistiramisu9.pythonanywhere.com/api/sensor-data";

// MAX30102 Sensor
MAX30105 particleSensor;

// Variables for sensor readings
long redValue = 0;
long irValue = 0;
float temperature = 0.0;
float motion = 0.0;  // You'll need to add accelerometer for real motion data

unsigned long lastSendTime = 0;
const unsigned long sendInterval = 2000;  // Send every 2 seconds

// Moving average buffers for smoothing
const int SMOOTHING_SAMPLES = 10;
long redBuffer[SMOOTHING_SAMPLES] = {0};
long irBuffer[SMOOTHING_SAMPLES] = {0};
int bufferIndex = 0;

void connectToWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi Connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n❌ WiFi Connection Failed!");
  }
}

void initializeMAX30102() {
  Serial.println("Initializing MAX30102 sensor...");
  
  // Initialize I2C with custom pins for ESP32
  Wire.begin(21, 22);  // SDA=GPIO21, SCL=GPIO22 for most ESP32 boards
  
  // Try to initialize MAX30102
  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("❌ MAX30102 not found! Check wiring:");
    Serial.println("   - VCC to 3.3V");
    Serial.println("   - GND to GND");
    Serial.println("   - SDA to GPIO21");
    Serial.println("   - SCL to GPIO22");
    Serial.println("   - INT (optional)");
    
    while (1) {
      Serial.println("Stuck here because sensor not found!");
      delay(1000);
    }
  }
  
  Serial.println("✅ MAX30102 found!");
  
  // Configure sensor
  byte ledBrightness = 0x1F;  // Options: 0=Off to 255=50mA
  byte sampleAverage = 4;     // Options: 1, 2, 4, 8, 16, 32
  byte ledMode = 2;           // Options: 1 = Red only, 2 = Red + IR
  int sampleRate = 100;       // Options: 50, 100, 200, 400, 800, 1000, 1600, 3200
  int pulseWidth = 411;       // Options: 69, 118, 215, 411
  int adcRange = 4096;        // Options: 2048, 4096, 8192, 16384
  
  particleSensor.setup(
    ledBrightness, 
    sampleAverage, 
    ledMode, 
    sampleRate, 
    pulseWidth, 
    adcRange
  );
  
  // Enable temperature sensor
  particleSensor.enableDIETEMPRDY();
  
  Serial.println("MAX30102 configured!");
  Serial.println("Place your finger on the sensor...");
  
  // Wait for sensor to stabilize (look for finger)
  while (particleSensor.getIR() < 50000) {
    Serial.print(".");
    delay(100);
  }
  Serial.println("\n✅ Finger detected! Sensor ready.");
}

float calculateSimulatedMotion() {
  // Simulate motion based on IR signal variation
  // In a real system, use an accelerometer like MPU6050
  
  static long lastIR = 0;
  static float motionValue = 0.3;
  
  if (lastIR > 0) {
    // Calculate variation
    float variation = abs(irValue - lastIR) / 10000.0;
    
    // Smooth the motion value
    motionValue = 0.8 * motionValue + 0.2 * variation;
    
    // Constrain
    if (motionValue > 1.0) motionValue = 1.0;
    if (motionValue < 0.0) motionValue = 0.0;
  }
  
  lastIR = irValue;
  return motionValue;
}

void readSensors() {
  // Read raw values from MAX30102
  long currentRed = particleSensor.getRed();
  long currentIR = particleSensor.getIR();
  
  // Store in buffers for smoothing
  redBuffer[bufferIndex] = currentRed;
  irBuffer[bufferIndex] = currentIR;
  bufferIndex = (bufferIndex + 1) % SMOOTHING_SAMPLES;
  
  // Calculate moving averages
  redValue = 0;
  irValue = 0;
  for (int i = 0; i < SMOOTHING_SAMPLES; i++) {
    redValue += redBuffer[i];
    irValue += irBuffer[i];
  }
  redValue /= SMOOTHING_SAMPLES;
  irValue /= SMOOTHING_SAMPLES;
  
  // Read temperature (only when available to avoid slowing down)
  static unsigned long lastTempRead = 0;
  if (millis() - lastTempRead > 5000) {  // Read temp every 5 seconds
    temperature = particleSensor.readTemperature();
    lastTempRead = millis();
  }
  
  // For motion, you would need to add an accelerometer like MPU6050
  // For now, simulate some motion based on IR variation
  motion = calculateSimulatedMotion();
}

float calculateNormalizedRed() {
  // Normalize red value to 0.0-1.0 range
  // These ranges might need adjustment based on your actual readings
  long minRed = 5000;    // Adjust based on your sensor
  long maxRed = 100000;  // Adjust based on your sensor
  
  float normalized = (float)(redValue - minRed) / (maxRed - minRed);
  
  // Constrain to 0-1 range
  if (normalized < 0.0) normalized = 0.0;
  if (normalized > 1.0) normalized = 1.0;
  
  return normalized;
}

float calculateNormalizedIR() {
  // Normalize IR value to 0.0-1.0 range
  // These ranges might need adjustment based on your actual readings
  long minIR = 10000;    // Adjust based on your sensor
  long maxIR = 150000;   // Adjust based on your sensor
  
  float normalized = (float)(irValue - minIR) / (maxIR - minIR);
  
  // Constrain to 0-1 range
  if (normalized < 0.0) normalized = 0.0;
  if (normalized > 1.0) normalized = 1.0;
  
  return normalized;
}

void sendSensorData(float red, float ir, float temp, float motion) {
  HTTPClient http;
  
  http.begin(flaskURL);
  http.addHeader("Content-Type", "application/json");
  
  // Create JSON payload
  JsonDocument doc;
  doc["red_signal"] = red;
  doc["ir_signal"] = ir;
  doc["temperature"] = temp;
  doc["motion"] = motion;
  doc["device_id"] = "esp32_max30102";
  doc["raw_red"] = redValue;      // Send raw values for debugging
  doc["raw_ir"] = irValue;        // Send raw values for debugging
  doc["timestamp"] = millis() / 1000;
  
  String jsonPayload;
  serializeJson(doc, jsonPayload);
  
  Serial.print("📤 Sending to Flask: ");
  Serial.println(jsonPayload);
  
  int httpResponseCode = http.POST(jsonPayload);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.print("✅ HTTP Response: ");
    Serial.println(httpResponseCode);
    
    if (httpResponseCode != 200) {
      Serial.print("⚠️ Response: ");
      Serial.println(response);
    }
  } else {
    Serial.print("❌ Error: ");
    Serial.println(httpResponseCode);
  }
  
  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("=== BLINKBand ESP32 with MAX30102 ===");
  
  // Connect to WiFi
  connectToWiFi();
  
  // Initialize MAX30102 sensor
  initializeMAX30102();
}

void loop() {
  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected! Reconnecting...");
    connectToWiFi();
  }
  
  // Read sensors continuously
  readSensors();
  
  // Send data every interval
  if (millis() - lastSendTime >= sendInterval) {
    lastSendTime = millis();
    
    // Calculate normalized values (0.0 to 1.0 range)
    float normalizedRed = calculateNormalizedRed();
    float normalizedIR = calculateNormalizedIR();
    
    Serial.print("Raw - Red: ");
    Serial.print(redValue);
    Serial.print(" | IR: ");
    Serial.print(irValue);
    Serial.print(" | Temp: ");
    Serial.print(temperature, 1);
    Serial.print("°C");
    Serial.print(" | Norm - Red: ");
    Serial.print(normalizedRed, 3);
    Serial.print(" | IR: ");
    Serial.print(normalizedIR, 3);
    Serial.println();
    
    // Send data to Flask server
    sendSensorData(normalizedRed, normalizedIR, temperature, motion);
  }
  
  // Small delay
  delay(100);
}