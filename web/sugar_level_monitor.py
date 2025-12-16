from flask import Flask, render_template, request, jsonify, send_file
import json
import time
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
import io
from collections import deque

app = Flask(__name__)

# -------------------------------
# Data Storage with Dual Buffers
# -------------------------------
class SensorDataStore:
    def __init__(self):
        # Current sensor values
        self.sensor_values = {
            "red_signal": 0.6,
            "ir_signal": 0.7,
            "temperature": 36.5,
            "motion": 0.3,
            "last_update": None,
            "device_connected": False,
            "data_source": "manual"  # manual or esp32
        }
        
        # Dual buffers for data sources (max 30 points each)
        self.data_buffers = {
            "manual": deque(maxlen=30),  # Manual input data
            "esp32": deque(maxlen=30)    # ESP32 live data
        }
        
        # Current active buffer
        self.active_buffer = "manual"
        
        # Last update timestamps
        self.last_updates = {
            "manual": None,
            "esp32": None
        }

sensor_store = SensorDataStore()

# -------------------------------
# Glucose Calculation Function
# -------------------------------
def calculate_glucose(red, ir, temp, motion, prev_glucose=None):
    optical_effect = (2 - (red + ir)) * 90
    temp_effect = (temp - 36.5) * 3
    motion_effect = -motion * 40
    
    # Use time-based variation instead of simulation time
    current_time = datetime.now()
    seconds_of_day = current_time.hour * 3600 + current_time.minute * 60 + current_time.second
    circadian_effect = 5 * np.sin(seconds_of_day / 3600 * np.pi / 12)  # 24-hour cycle
    
    noise = np.random.normal(0, 1.5)  # Reduced noise for smoother graph

    glucose = optical_effect + temp_effect + motion_effect + circadian_effect + noise

    if prev_glucose is not None:
        glucose = 0.8 * prev_glucose + 0.2 * glucose  # Strong smoothing for stability

    return np.clip(glucose, 20, 200)

def get_previous_glucose(buffer_name):
    """Get the previous glucose value from buffer"""
    buffer = sensor_store.data_buffers[buffer_name]
    if buffer:
        return buffer[-1]["Glucose"]
    return None

def generate_glucose_point(buffer_name):
    """Generate a glucose data point for the specified buffer"""
    # Get previous glucose for smoothing
    prev_glucose = get_previous_glucose(buffer_name)
    
    # Calculate new glucose based on current sensor values
    glucose = calculate_glucose(
        sensor_store.sensor_values["red_signal"],
        sensor_store.sensor_values["ir_signal"],
        sensor_store.sensor_values["temperature"],
        sensor_store.sensor_values["motion"],
        prev_glucose
    )
    
    # Create data point
    timestamp = datetime.now().strftime("%H:%M:%S")
    point = {
        "Time": timestamp,
        "Glucose": round(glucose, 1),
        "Red": sensor_store.sensor_values["red_signal"],
        "IR": sensor_store.sensor_values["ir_signal"],
        "Temperature": sensor_store.sensor_values["temperature"],
        "Motion": sensor_store.sensor_values["motion"]
    }
    
    return point

# -------------------------------
# Routes
# -------------------------------
@app.route('/')
def index():
    """Main dashboard page"""
    return render_template('index.html')

@app.route('/api/health')
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "data_sources": {
            "active": sensor_store.active_buffer,
            "manual_count": len(sensor_store.data_buffers["manual"]),
            "esp32_count": len(sensor_store.data_buffers["esp32"]),
            "last_manual": sensor_store.last_updates["manual"],
            "last_esp32": sensor_store.last_updates["esp32"]
        }
    })

@app.route('/api/get-current-data', methods=['GET'])
def get_current_data():
    """Get current data from active buffer (for continuous updates)"""
    try:
        # Generate new point for active buffer
        current_time = datetime.now()
        buffer_name = sensor_store.active_buffer
        
        # Check if we should generate a new point (every 1 second)
        should_generate = False
        if sensor_store.last_updates[buffer_name] is None:
            should_generate = True
        else:
            time_diff = (current_time - sensor_store.last_updates[buffer_name]).total_seconds()
            if time_diff >= 1.0:  # Generate every 1 second
                should_generate = True
        
        if should_generate:
            new_point = generate_glucose_point(buffer_name)
            sensor_store.data_buffers[buffer_name].append(new_point)
            sensor_store.last_updates[buffer_name] = current_time
        
        # Get current buffer data
        buffer_data = list(sensor_store.data_buffers[buffer_name])
        
        # Calculate Y-axis range from data
        y_min, y_max = 50, 150  # Default range
        
        if buffer_data:
            glucose_values = [p["Glucose"] for p in buffer_data]
            min_glucose = min(glucose_values)
            max_glucose = max(glucose_values)
            
            # Add padding to range
            padding = max(5, (max_glucose - min_glucose) * 0.1)
            y_min = max(20, min_glucose - padding)
            y_max = min(200, max_glucose + padding)
            
            # Ensure minimum range of 20 units
            if y_max - y_min < 20:
                center = (y_max + y_min) / 2
                y_min = center - 10
                y_max = center + 10
        
        return jsonify({
            "status": "success",
            "data_source": buffer_name,
            "sensor_values": sensor_store.sensor_values,
            "glucose_data": buffer_data,
            "data_count": len(buffer_data),
            "y_range": {
                "min": round(y_min, 1),
                "max": round(y_max, 1)
            },
            "last_update": sensor_store.last_updates[buffer_name].isoformat() if sensor_store.last_updates[buffer_name] else None,
            "timestamp": current_time.isoformat()
        })
        
    except Exception as e:
        print(f"❌ Error in get_current_data: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/set-data-source', methods=['POST'])
def set_data_source():
    """Switch between manual and ESP32 data sources"""
    try:
        data = request.get_json()
        new_source = data.get('data_source', 'manual')
        
        if new_source not in ['manual', 'esp32']:
            return jsonify({"status": "error", "message": "Invalid data source"}), 400
        
        sensor_store.active_buffer = new_source
        sensor_store.sensor_values["data_source"] = new_source
        
        print(f"🔄 Switched data source to: {new_source}")
        
        return jsonify({
            "status": "success",
            "message": f"Data source switched to {new_source}",
            "data_source": new_source,
            "buffer_sizes": {
                "manual": len(sensor_store.data_buffers["manual"]),
                "esp32": len(sensor_store.data_buffers["esp32"])
            }
        }), 200
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/api/sensor-data', methods=['POST'])
def receive_sensor_data():
    """Receive data from ESP32"""
    try:
        data = request.get_json()
        current_time = datetime.now()
        
        print(f"📡 Received ESP32 data: {data}")
        
        # Update sensor values for ESP32 mode
        sensor_store.sensor_values.update({
            "red_signal": float(data.get('red_signal', sensor_store.sensor_values["red_signal"])),
            "ir_signal": float(data.get('ir_signal', sensor_store.sensor_values["ir_signal"])),
            "temperature": float(data.get('temperature', sensor_store.sensor_values["temperature"])),
            "motion": float(data.get('motion', sensor_store.sensor_values["motion"])),
            "last_update": current_time.isoformat(),
            "device_connected": True
        })
        
        # Generate data point for ESP32 buffer (if ESP32 is active)
        if sensor_store.active_buffer == "esp32":
            new_point = generate_glucose_point("esp32")
            sensor_store.data_buffers["esp32"].append(new_point)
            sensor_store.last_updates["esp32"] = current_time
            print(f"📊 Added ESP32 data point: {new_point['Glucose']} mg/dL")
        
        return jsonify({
            "status": "success", 
            "message": "ESP32 data received",
            "data_added": sensor_store.active_buffer == "esp32",
            "esp32_buffer_size": len(sensor_store.data_buffers["esp32"])
        }), 200
        
    except Exception as e:
        print(f"❌ Error receiving ESP32 data: {e}")
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/api/update-sensors', methods=['POST'])
def update_sensors():
    """Update sensor values manually"""
    try:
        data = request.get_json()
        current_time = datetime.now()
        
        print(f"🎛️ Manual sensor update: {data}")
        
        sensor_store.sensor_values.update({
            "red_signal": float(data.get('red_signal', sensor_store.sensor_values["red_signal"])),
            "ir_signal": float(data.get('ir_signal', sensor_store.sensor_values["ir_signal"])),
            "temperature": float(data.get('temperature', sensor_store.sensor_values["temperature"])),
            "motion": float(data.get('motion', sensor_store.sensor_values["motion"])),
            "device_connected": False  # Manual mode, not ESP32
        })
        
        # Generate data point for manual buffer (if manual is active)
        if sensor_store.active_buffer == "manual":
            new_point = generate_glucose_point("manual")
            sensor_store.data_buffers["manual"].append(new_point)
            sensor_store.last_updates["manual"] = current_time
            print(f"📊 Added manual data point: {new_point['Glucose']} mg/dL")
        
        return jsonify({
            "status": "success", 
            "message": "Sensors updated",
            "data_added": sensor_store.active_buffer == "manual",
            "manual_buffer_size": len(sensor_store.data_buffers["manual"])
        }), 200

    except Exception as e:
        print(f"❌ Error in update_sensors: {e}")
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/api/download-csv')
def download_csv():
    """Download current buffer data as CSV"""
    buffer_name = sensor_store.active_buffer
    buffer_data = sensor_store.data_buffers[buffer_name]
    
    if buffer_data:
        # Convert deque to DataFrame
        df = pd.DataFrame(list(buffer_data))
        csv_data = df.to_csv(index=False)
        
        return send_file(
            io.BytesIO(csv_data.encode()),
            mimetype='text/csv',
            as_attachment=True,
            download_name=f'glucose_data_{buffer_name}_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
        )
    else:
        return jsonify({"status": "error", "message": "No data available"}), 400

@app.route('/api/clear-buffer', methods=['POST'])
def clear_buffer():
    """Clear current buffer"""
    try:
        data = request.get_json()
        buffer_name = data.get('buffer_name', sensor_store.active_buffer)
        
        if buffer_name in sensor_store.data_buffers:
            sensor_store.data_buffers[buffer_name].clear()
            sensor_store.last_updates[buffer_name] = None
            print(f"🧹 Cleared {buffer_name} buffer")
            
            return jsonify({
                "status": "success",
                "message": f"{buffer_name} buffer cleared",
                "buffer_name": buffer_name
            }), 200
        else:
            return jsonify({"status": "error", "message": "Invalid buffer name"}), 400
            
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/api/get-buffer-info')
def get_buffer_info():
    """Get information about all buffers"""
    return jsonify({
        "active_buffer": sensor_store.active_buffer,
        "buffers": {
            "manual": {
                "count": len(sensor_store.data_buffers["manual"]),
                "last_update": sensor_store.last_updates["manual"],
                "data_points": list(sensor_store.data_buffers["manual"])[-5:] if sensor_store.data_buffers["manual"] else []
            },
            "esp32": {
                "count": len(sensor_store.data_buffers["esp32"]),
                "last_update": sensor_store.last_updates["esp32"],
                "data_points": list(sensor_store.data_buffers["esp32"])[-5:] if sensor_store.data_buffers["esp32"] else []
            }
        },
        "sensor_values": sensor_store.sensor_values
    })

# -------------------------------
# PythonAnywhere Configuration
# -------------------------------
if __name__ == '__main__':
    app.run(debug=True)
else:
    application = app