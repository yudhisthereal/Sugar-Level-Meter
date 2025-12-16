# BLINKBand - Continuous Glucose Monitoring System
<img width="1124" height="946" alt="image" src="https://github.com/user-attachments/assets/7a336a2b-6cb2-4041-a6e9-68fff61f3036" />

## 📋 Project Overview
**BLINKBand** is a prototype web-based glucose monitoring simulation system developed for the **BLINK Business Plan Competition 2025**. This system demonstrates a continuous glucose monitoring device that processes sensor data in real-time and provides interactive visualization for healthcare monitoring.

**🌐 Live Demo**: [http://yudhistiramisu9.pythonanywhere.com/](http://yudhistiramisu9.pythonanywhere.com/)  
*Note: The demo runs on PythonAnywhere free tier and will be disabled on Monday, 16 March 2026*

## 🎯 Project Purpose
This prototype serves as a proof-of-concept for:
- **BLINK Business Plan Competition 2025** submission
- Real-time glucose level simulation based on physiological sensor data
- Dual data source integration (manual input & ESP32 hardware)
- Interactive web-based medical device interface
- Cloud-based health monitoring system demonstration

## 🏗️ System Architecture

### Frontend
- **HTML/CSS/JavaScript** for interactive user interface
- **Chart.js** for real-time glucose level visualization
- Responsive design with medical-grade UI/UX

### Backend
- **Python Flask** web framework
- **PythonAnywhere** cloud hosting (free tier)
- RESTful API endpoints for data processing

### Hardware Integration (Simulated)
- **ESP32 microcontroller** with MAX30102 sensor
- Real-time PPG (Photoplethysmography) data processing
- Wireless data transmission to cloud server

## 📁 Project Structure

### Server (PythonAnywhere)
```
/home/<username>/<sitename>/
├── sugar_level_monitor.py          # Main Flask application
├── templates/                      # Frontend files
│   ├── index.html                  # Main HTML interface
│   ├── style.css                   # CSS stylesheets
│   └── script.js                   # JavaScript functionality
└── requirements.txt                # Python dependencies
```

### Static Files Configuration (PythonAnywhere)
To serve CSS and JavaScript files correctly on PythonAnywhere:

1. **Static Files Setup**:
   - **URL**: `/static/`
   - **Path**: `/home/<username>/<sitename>/templates/`

2. **HTML References**:
   ```html
   <!-- In index.html -->
   <link rel="stylesheet" href="/static/style.css">
   <script src="/static/script.js"></script>
   ```

## 🚀 Features

### 1. Real-time Glucose Monitoring
- Continuous glucose level simulation with natural fluctuations
- Dynamic Y-axis scaling based on data range
- 30-point rolling buffer for historical data display

### 2. Dual Data Source Support
- **Manual Input Mode**: Interactive sliders for parameter adjustment
- **ESP32 Live Mode**: Real sensor data integration from hardware
- Independent data buffers for each source

### 3. Interactive Dashboard
- Real-time sensor value display (Red Signal, IR Signal, Temperature, Motion)
- Glucose statistics (Current, Min, Max, Average)
- Connection status indicators
- Data export functionality (CSV download)

### 4. Medical-Grade Visualization
- Professional color scheme (#ac0000 red theme)
- Clear data visualization with Chart.js
- Responsive design for various devices

## 🔧 Technical Implementation

### Core Algorithm
The glucose calculation algorithm simulates physiological responses:
```python
Glucose = Optical_Effect + Temperature_Effect + Motion_Effect + Circadian_Rhythm + Noise
```
- **Optical Effect**: Based on normalized Red and IR signals
- **Temperature Effect**: Deviation from 36.5°C baseline
- **Motion Effect**: Physical activity impact
- **Circadian Rhythm**: Natural 24-hour glucose fluctuation
- **Noise**: Random biological variation

### API Endpoints
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Main dashboard interface |
| `/api/get-current-data` | GET | Real-time data polling |
| `/api/set-data-source` | POST | Switch between manual/ESP32 modes |
| `/api/sensor-data` | POST | Receive ESP32 sensor data |
| `/api/update-sensors` | POST | Update manual sensor values |
| `/api/download-csv` | GET | Export data as CSV |

### Data Flow
```
ESP32 Hardware → WiFi → Flask API → Web Interface
                        ↗
Manual Input → Sliders → Real-time Updates → Chart Display
```

## ⚙️ Installation & Setup

### Local Development
1. **Clone the repository**
2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
3. **Run the Flask application**:
   ```bash
   python sugar_level_monitor.py
   ```
4. **Access the application**: `http://localhost:5000`

### PythonAnywhere Deployment
1. **Upload files** to PythonAnywhere file system
2. **Configure web app**:
   - Python version: 3.10+
   - WSGI configuration file: Point to `sugar_level_monitor.py`
3. **Set up static files** as described above
4. **Reload the web app**

### Dependencies
```txt
Flask==2.3.3
pandas==2.0.3
numpy==1.24.3
```

## 🎮 Usage Guide

### Manual Mode
1. Select "Manual Input" data source
2. Adjust sensor sliders:
   - **Red Signal**: Normalized PPG red signal (0.0-1.0)
   - **IR Signal**: Normalized PPG IR signal (0.0-1.0)
   - **Temperature**: Body temperature (30.0-40.0°C)
   - **Motion**: Activity level (0.0-1.0)
3. Observe real-time glucose level changes

### ESP32 Mode
1. Select "ESP32 Live" data source
2. Ensure ESP32 hardware is connected and sending data
3. Monitor real sensor data streaming
4. Connection status will update automatically

### Data Management
- **Clear Buffer**: Remove current data points
- **Download CSV**: Export historical data for analysis
- **Force Refresh**: Manual data update

## 🔍 Troubleshooting

### Common Issues

1. **Static files not loading**:
   - Verify PythonAnywhere static file configuration
   - Check file paths in HTML references
   - Ensure files are in the `/templates/` directory

2. **JavaScript not executing**:
   - Check browser console for errors
   - Verify element ID matches in HTML and JavaScript
   - Ensure `DOMContentLoaded` event is firing

3. **ESP32 connection issues**:
   - Verify ESP32 is sending POST requests to `/api/sensor-data`
   - Check WiFi connectivity
   - Confirm JSON payload format

### Debugging Commands
```bash
# Test API endpoints
curl http://yudhistiramisu9.pythonanywhere.com/api/get-current-data

# Send test ESP32 data
curl -X POST http://yudhistiramisu9.pythonanywhere.com/api/sensor-data \
  -H "Content-Type: application/json" \
  -d '{"red_signal":0.65,"ir_signal":0.72,"temperature":36.8,"motion":0.25}'
```

## 📊 Technical Specifications

### Performance
- **Update Frequency**: 1 second intervals
- **Data Buffer**: 30 points maximum per source
- **Response Time**: < 100ms for API calls
- **Browser Support**: Chrome, Firefox, Safari, Edge

### Security Considerations
- Local data processing (no sensitive data storage)
- CORS configured for ESP32 communication
- No authentication required for prototype

### Limitations (Free Tier)
- PythonAnywhere free tier restrictions apply
- No persistent database (in-memory storage only)
- Limited uptime and processing resources
- Automatic shutdown on 16 March 2026

## 🏆 Business Plan Competition Relevance

This prototype demonstrates:

1. **Technical Feasibility**: Working hardware-software integration
2. **Market Need**: Real-time health monitoring solution
3. **Scalability**: Cloud-based architecture
4. **User Experience**: Intuitive medical interface
5. **Innovation**: Novel glucose estimation algorithm

## 👥 Development Team

**Yudhistira (Developer)**
**Dhimas Adjie Pradayan (Manager)**  
Powered by **Python** via **Flask**

## 📄 License

This project is developed for the BLINK Business Plan Competition 2025. All rights reserved.

## 📞 Support

For technical issues or questions regarding this prototype:
- Check the troubleshooting section above
- Review PythonAnywhere documentation
- Contact the development team

---

*Last Updated: December 2025*  
*Prototype Version: 1.0*  
*Competition: BLINK Business Plan Competition 2025*
