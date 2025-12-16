from flask import Flask, render_template, request, jsonify, send_file
import json
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
import io
from collections import deque

app = Flask(__name__)

# -------------------------------
# Data Storage
# -------------------------------
class SensorDataStore:
    def __init__(self):
        # SEPARATE sensor values
        self.sensor_values = {
            "manual": {
                "red_signal": 0.6,
                "ir_signal": 0.7,
                "temperature": 36.5,
                "motion": 0.3
            },
            "esp32": {
                "red_signal": 0.6,
                "ir_signal": 0.7,
                "temperature": 36.5,
                "motion": 0.3,
                "last_esp32_time": None  # Track when ESP32 last sent data
            }
        }

        # SEPARATE buffers
        self.data_buffers = {
            "manual": deque(maxlen=30),
            "esp32": deque(maxlen=30)
        }

        # Current active buffer
        self.active_buffer = "manual"

        # Last update time for each buffer
        self.last_update = {
            "manual": datetime.now(),
            "esp32": datetime.now()
        }

sensor_store = SensorDataStore()

# -------------------------------
# Glucose Calculation
# -------------------------------
def calculate_glucose(red, ir, temp, motion, prev_glucose=None):
    optical_effect = (2 - (red + ir)) * 90
    temp_effect = (temp - 36.5) * 3
    motion_effect = -motion * 40

    current_second = datetime.now().second
    circadian_effect = 3 * np.sin(current_second / 30 * np.pi)

    noise = np.random.normal(0, 1.0)

    glucose = optical_effect + temp_effect + motion_effect + circadian_effect + noise

    if prev_glucose is not None:
        glucose = 0.9 * prev_glucose + 0.1 * glucose

    return np.clip(glucose, 20, 200)

# -------------------------------
# Routes
# -------------------------------
@app.route('/')
def index():
    return render_template('index.html')

# Serve static files
@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory('static', filename)

@app.route('/api/get-current-data', methods=['GET'])
def get_current_data():
    """Always returns current data"""
    try:
        current_time = datetime.now()
        buffer_name = sensor_store.active_buffer

        # Check if we need to generate a new point (1 second intervals)
        time_diff = (current_time - sensor_store.last_update[buffer_name]).total_seconds()

        if time_diff >= 1.0:  # Generate new point every 1 second
            # Get sensor values for this buffer
            sensor_data = sensor_store.sensor_values[buffer_name]

            # Get previous glucose for smoothing
            prev_glucose = None
            if sensor_store.data_buffers[buffer_name]:
                prev_glucose = sensor_store.data_buffers[buffer_name][-1]["Glucose"]

            # Calculate new glucose
            glucose = calculate_glucose(
                sensor_data["red_signal"],
                sensor_data["ir_signal"],
                sensor_data["temperature"],
                sensor_data["motion"],
                prev_glucose
            )

            # Create data point
            timestamp = current_time.strftime("%H:%M:%S")
            point = {
                "Time": timestamp,
                "Glucose": round(glucose, 1),
                "Red": sensor_data["red_signal"],
                "IR": sensor_data["ir_signal"],
                "Temperature": sensor_data["temperature"],
                "Motion": sensor_data["motion"]
            }

            # Add to buffer
            sensor_store.data_buffers[buffer_name].append(point)
            sensor_store.last_update[buffer_name] = current_time

            # Log
            if buffer_name == "esp32":
                print(f"📡 ESP32 point: {glucose:.1f} mg/dL")
            else:
                print(f"📱 Manual point: {glucose:.1f} mg/dL")

        # Get current buffer data
        buffer_data = list(sensor_store.data_buffers[buffer_name])
        sensor_data = sensor_store.sensor_values[buffer_name]

        # Calculate Y-axis range
        y_min, y_max = 50, 150
        if buffer_data:
            glucose_values = [p["Glucose"] for p in buffer_data]
            min_glucose = min(glucose_values)
            max_glucose = max(glucose_values)

            padding = max(5, (max_glucose - min_glucose) * 0.15)
            y_min = max(20, min_glucose - padding)
            y_max = min(200, max_glucose + padding)

            if y_max - y_min < 20:
                center = (y_max + y_min) / 2
                y_min = center - 10
                y_max = center + 10

        # Determine ESP32 connection status
        esp32_connected = False
        if buffer_name == "esp32" and sensor_store.sensor_values["esp32"]["last_esp32_time"]:
            time_since_esp32 = (current_time - sensor_store.sensor_values["esp32"]["last_esp32_time"]).total_seconds()
            esp32_connected = time_since_esp32 < 10  # Connected if data < 10 seconds old

        return jsonify({
            "status": "success",
            "data_source": buffer_name,
            "sensor_values": {
                **sensor_data,
                "device_connected": esp32_connected if buffer_name == "esp32" else False
            },
            "glucose_data": buffer_data,
            "data_count": len(buffer_data),
            "y_range": {"min": y_min, "max": y_max},
            "timestamp": current_time.strftime("%H:%M:%S")
        })

    except Exception as e:
        print(f"❌ Error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/set-data-source', methods=['POST'])
def set_data_source():
    """Switch data source"""
    try:
        data = request.get_json()
        new_source = data.get('data_source', 'manual')

        if new_source not in ['manual', 'esp32']:
            return jsonify({"status": "error", "message": "Invalid source"}), 400

        sensor_store.active_buffer = new_source

        return jsonify({
            "status": "success",
            "message": f"Switched to {new_source}",
            "data_source": new_source
        }), 200

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/api/sensor-data', methods=['POST'])
def receive_sensor_data():
    """Receive ESP32 data"""
    try:
        data = request.get_json()
        current_time = datetime.now()

        print(f"📡 ESP32 Data Received!")
        print(f"   Red: {data.get('red_signal', 'N/A')}")
        print(f"   IR: {data.get('ir_signal', 'N/A')}")
        print(f"   Temp: {data.get('temperature', 'N/A')}")
        print(f"   Motion: {data.get('motion', 'N/A')}")

        # Update ESP32 sensor values
        sensor_store.sensor_values["esp32"].update({
            "red_signal": float(data.get('red_signal', 0.6)),
            "ir_signal": float(data.get('ir_signal', 0.7)),
            "temperature": float(data.get('temperature', 36.5)),
            "motion": float(data.get('motion', 0.3)),
            "last_esp32_time": current_time  # Update timestamp
        })

        # Force immediate update for ESP32 buffer
        sensor_store.last_update["esp32"] = current_time - timedelta(seconds=2)

        print(f"✅ ESP32 data saved (last seen: {current_time.strftime('%H:%M:%S')})")

        # IMPORTANT: Return device_connected = True so frontend knows
        return jsonify({
            "status": "success",
            "message": "ESP32 data received",
            "timestamp": current_time.isoformat(),
            "device_connected": True,
            "last_update": current_time.isoformat()
        }), 200

    except Exception as e:
        print(f"❌ ESP32 Error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/api/update-sensors', methods=['POST'])
def update_sensors():
    """Update manual sensors"""
    try:
        data = request.get_json()
        current_time = datetime.now()

        # Update manual sensor values
        sensor_store.sensor_values["manual"].update({
            "red_signal": float(data.get('red_signal', 0.6)),
            "ir_signal": float(data.get('ir_signal', 0.7)),
            "temperature": float(data.get('temperature', 36.5)),
            "motion": float(data.get('motion', 0.3))
        })

        # Force immediate update for manual buffer
        sensor_store.last_update["manual"] = current_time - timedelta(seconds=2)

        return jsonify({
            "status": "success",
            "message": "Manual sensors updated"
        }), 200

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/api/clear-buffer', methods=['POST'])
def clear_buffer():
    """Clear buffer"""
    try:
        data = request.get_json()
        buffer_name = data.get('buffer_name', sensor_store.active_buffer)

        if buffer_name in sensor_store.data_buffers:
            sensor_store.data_buffers[buffer_name].clear()

            # Reset sensor values
            if buffer_name == "manual":
                sensor_store.sensor_values["manual"] = {
                    "red_signal": 0.6, "ir_signal": 0.7,
                    "temperature": 36.5, "motion": 0.3
                }
            else:
                sensor_store.sensor_values["esp32"] = {
                    "red_signal": 0.6, "ir_signal": 0.7,
                    "temperature": 36.5, "motion": 0.3,
                    "last_esp32_time": None
                }

            return jsonify({
                "status": "success",
                "message": f"Cleared {buffer_name} buffer"
            }), 200

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/api/download-csv')
def download_csv():
    """Download CSV"""
    buffer_name = sensor_store.active_buffer
    buffer_data = sensor_store.data_buffers[buffer_name]

    if buffer_data:
        df = pd.DataFrame(list(buffer_data))
        csv_data = df.to_csv(index=False)

        return send_file(
            io.BytesIO(csv_data.encode()),
            mimetype='text/csv',
            as_attachment=True,
            download_name=f'glucose_{buffer_name}.csv'
        )
    else:
        return jsonify({"status": "error", "message": "No data"}), 400

# -------------------------------
# PythonAnywhere
# -------------------------------
if __name__ == '__main__':
    app.run(debug=True)
else:
    application = app