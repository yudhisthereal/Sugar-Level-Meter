// Global variables
let glucoseChart = null;
let pollInterval = null;
let currentDataSource = 'manual';
let esp32LastSeen = null;
let isPolling = false;

// Initialize Chart
function initChart() {
    console.log("Initializing chart...");
    const ctx = document.getElementById('glucoseChart').getContext('2d');

    glucoseChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Glucose',
                data: [],
                borderColor: '#ac0000',
                backgroundColor: 'rgba(172, 0, 0, 0.1)',
                borderWidth: 2,
                pointRadius: 3,
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: false,
                    min: 50,
                    max: 150,
                    title: { display: true, text: 'Glucose (mg/dL)' }
                },
                x: {
                    title: { display: true, text: 'Time' },
                    ticks: { maxRotation: 45 }
                }
            }
        }
    });
}

// Set data source
function setDataSource(source) {
    console.log(`Switching to ${source}`);

    // Update UI
    document.getElementById('manualSourceBtn').classList.remove('active');
    document.getElementById('esp32SourceBtn').classList.remove('active');
    document.getElementById(source + 'SourceBtn').classList.add('active');

    // Show/hide controls
    document.getElementById('manualControls').style.display =
        source === 'manual' ? 'block' : 'none';

    // Update server
    fetch('/api/set-data-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data_source: source })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            currentDataSource = source;
            console.log(`Now showing ${source} data`);

            // Force immediate poll when switching to ESP32 mode
            if (source === 'esp32') {
                setTimeout(pollForData, 100);
            }
        }
    });
}

// Start polling
function startPolling() {
    console.log("Starting 1-second polling...");

    // Clear old interval
    if (pollInterval) clearInterval(pollInterval);

    isPolling = true;

    // Immediate first poll
    pollForData();

    // Poll every 1000ms (1 second)
    pollInterval = setInterval(pollForData, 1000);
}

// Poll for data
function pollForData() {
    if (!isPolling) return;

    fetch('/api/get-current-data')
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                // Update everything
                updateDisplay(data);
            }
        })
        .catch(error => {
            console.error("Poll error:", error);
        });
}

// Update display
function updateDisplay(data) {
    // Update sensor values
    document.getElementById('currentRed').textContent =
        data.sensor_values.red_signal.toFixed(2);
    document.getElementById('currentIr').textContent =
        data.sensor_values.ir_signal.toFixed(2);
    document.getElementById('currentTemp').textContent =
        data.sensor_values.temperature.toFixed(1);
    document.getElementById('currentMotion').textContent =
        data.sensor_values.motion.toFixed(2);

    // Update sliders if in manual mode
    if (currentDataSource === 'manual') {
        document.getElementById('redSlider').value = data.sensor_values.red_signal;
        document.getElementById('irSlider').value = data.sensor_values.ir_signal;
        document.getElementById('tempSlider').value = data.sensor_values.temperature;
        document.getElementById('motionSlider').value = data.sensor_values.motion;

        document.getElementById('redValue').textContent = data.sensor_values.red_signal.toFixed(2);
        document.getElementById('irValue').textContent = data.sensor_values.ir_signal.toFixed(2);
        document.getElementById('tempValue').textContent = data.sensor_values.temperature.toFixed(1);
        document.getElementById('motionValue').textContent = data.sensor_values.motion.toFixed(2);
    }

    // Update chart
    if (data.glucose_data && data.glucose_data.length > 0) {
        const labels = data.glucose_data.map(d => d.Time);
        const values = data.glucose_data.map(d => d.Glucose);

        glucoseChart.data.labels = labels;
        glucoseChart.data.datasets[0].data = values;

        // Update Y-axis
        if (data.y_range) {
            glucoseChart.options.scales.y.min = data.y_range.min;
            glucoseChart.options.scales.y.max = data.y_range.max;
            document.getElementById('chartRange').textContent =
                `Range: ${data.y_range.min.toFixed(0)}-${data.y_range.max.toFixed(0)} mg/dL`;
        }

        glucoseChart.update();

        // Update current glucose
        const latest = data.glucose_data[data.glucose_data.length-1];
        document.getElementById('currentGlucose').textContent = latest.Glucose.toFixed(1);
        document.getElementById('currentTime').textContent = `Time: ${latest.Time}`;
        document.getElementById('chartCurrent').textContent = latest.Glucose.toFixed(1);

        // Update stats
        if (values.length > 0) {
            document.getElementById('chartMin').textContent = Math.min(...values).toFixed(1);
            document.getElementById('chartMax').textContent = Math.max(...values).toFixed(1);
            const avg = values.reduce((a,b) => a+b, 0) / values.length;
            document.getElementById('chartAvg').textContent = avg.toFixed(1);
        }
    }

    // Update status - FIXED: Manual mode should NOT show connection status
    updateStatus(data);

    // Update info
    document.getElementById('dataSourceInfo').innerHTML =
        `Source: <b>${data.data_source === 'manual' ? 'Manual' : 'ESP32'}</b>`;
    document.getElementById('dataPointsInfo').innerHTML =
        `Points: <b>${data.data_count}/30</b>`;
    document.getElementById('updateTime').textContent =
        `Updated: ${data.timestamp}`;
}

// Update status - FIXED LOGIC
function updateStatus(data) {
    const statusElem = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const lastUpdate = document.getElementById('lastUpdate');
    const bufferInfo = document.getElementById('bufferInfo');

    // MANUAL MODE: Just show "Manual Mode" - no connection status!
    if (data.data_source === 'manual') {
        statusElem.className = 'status-indicator status-offline';
        statusElem.querySelector('.status-dot').className = 'status-dot';
        statusText.textContent = 'Manual Mode';
        lastUpdate.textContent = 'Using manual input';
    }
    // ESP32 MODE: Check connection based on sensor_values.device_connected
    else if (data.data_source === 'esp32') {
        // Check if server says device is connected
        if (data.sensor_values.device_connected === true) {
            statusElem.className = 'status-indicator status-online';
            statusElem.querySelector('.status-dot').className = 'status-dot dot-online';
            statusText.textContent = 'ESP32 Connected';
            lastUpdate.textContent = 'Receiving live data';

            // Update our local timestamp
            esp32LastSeen = new Date();
        }
        // Check if we have a local timestamp (from previous ESP32 data)
        else if (esp32LastSeen) {
            const now = new Date();
            const secondsSinceLastSeen = (now - esp32LastSeen) / 1000;

            if (secondsSinceLastSeen < 15) { // Recently connected
                statusElem.className = 'status-indicator status-online';
                statusElem.querySelector('.status-dot').className = 'status-dot dot-online';
                statusText.textContent = 'ESP32 Connected';
                lastUpdate.textContent = `Last data: ${Math.floor(secondsSinceLastSeen)}s ago`;
            } else if (secondsSinceLastSeen < 60) { // Connection lost
                statusElem.className = 'status-indicator status-offline';
                statusElem.querySelector('.status-dot').className = 'status-dot dot-offline';
                statusText.textContent = 'ESP32 Connection Lost';
                lastUpdate.textContent = `Last seen: ${Math.floor(secondsSinceLastSeen)}s ago`;
            } else { // No recent data
                statusElem.className = 'status-indicator status-offline';
                statusElem.querySelector('.status-dot').className = 'status-dot dot-offline';
                statusText.textContent = 'Waiting for ESP32';
                lastUpdate.textContent = 'No recent data';
            }
        }
        // Never received ESP32 data
        else {
            statusElem.className = 'status-indicator status-offline';
            statusElem.querySelector('.status-dot').className = 'status-dot dot-offline';
            statusText.textContent = 'Waiting for ESP32';
            lastUpdate.textContent = 'No data received yet';
        }
    }

    bufferInfo.textContent = `Buffer: ${data.data_count}/30`;
}

// Update ESP32 connection when data is received
function updateESP32Connection() {
    console.log("ESP32 data received - updating connection status");
    esp32LastSeen = new Date();

    // If we're in ESP32 mode, force a poll to update the status
    if (currentDataSource === 'esp32') {
        setTimeout(pollForData, 100);
    }
}

// Listen for ESP32 data responses
function setupESP32ResponseListener() {
    // Override fetch to detect ESP32 API calls
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        const url = args[0];
        const options = args[1] || {};

        // Check if this is an ESP32 data submission
        if (typeof url === 'string' && url.includes('/api/sensor-data') &&
            options.method === 'POST') {

            return originalFetch.apply(this, args).then(response => {
                return response.clone().json().then(data => {
                    // If ESP32 data was successfully received
                    if (data.status === 'success') {
                        console.log("ESP32 data accepted by server");
                        updateESP32Connection();
                    }
                    return response;
                }).catch(() => response);
            });
        }

        return originalFetch.apply(this, args);
    };

    console.log("ESP32 response listener setup complete");
}

// Update sensor via slider
function updateSensor(type, value) {
    if (currentDataSource !== 'manual') return;

    const numValue = parseFloat(value);

    // Update display
    const displayValue = type === 'temperature' ? numValue.toFixed(1) : numValue.toFixed(2);
    document.getElementById(`${type}Value`).textContent = displayValue;
    document.getElementById(`current${type.charAt(0).toUpperCase() + type.slice(1)}`).textContent = displayValue;

    // Send to server
    const payload = {};
    payload[type === 'temperature' ? 'temperature' : `${type}_signal`] = numValue;

    fetch('/api/update-sensors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

// Clear buffer
function clearCurrentBuffer() {
    if (confirm(`Clear ${currentDataSource} data?`)) {
        fetch('/api/clear-buffer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ buffer_name: currentDataSource })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                console.log("Buffer cleared");
                // Refresh display
                pollForData();
            }
        });
    }
}

// Download CSV
function downloadCSV() {
    window.location.href = '/api/download-csv';
}

// Send test ESP32 data
function sendTestESP32Data() {
    const testData = {
        red_signal: 0.65 + Math.random() * 0.1,
        ir_signal: 0.72 + Math.random() * 0.1,
        temperature: 36.8 + Math.random() * 0.5,
        motion: 0.25 + Math.random() * 0.2
    };

    console.log("Sending test ESP32 data:", testData);

    fetch('/api/sensor-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            console.log("✅ Test ESP32 data sent successfully");
            alert(`ESP32 test data sent!\nResponse: ${data.message}`);

            // Force status update
            updateESP32Connection();
        } else {
            console.error("❌ Failed to send ESP32 data:", data.message);
            alert(`Failed: ${data.message}`);
        }
    })
    .catch(error => {
        console.error("❌ Network error:", error);
        alert("Network error sending ESP32 data");
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    console.log("Starting BLINKBand...");

    // Initialize chart
    initChart();

    // Set up ESP32 response listener
    setupESP32ResponseListener();

    // Set initial values
    updateSensor('red', 0.6);
    updateSensor('ir', 0.7);
    updateSensor('temp', 36.5);
    updateSensor('motion', 0.3);

    // Set to manual mode
    setDataSource('manual');

    // Start polling after 1 second
    setTimeout(startPolling, 1000);

    console.log("System ready!");

    // Add test button for ESP32
    const testBtn = document.createElement('button');
    testBtn.className = 'secondary';
    testBtn.innerHTML = '🔧 Test ESP32 Connection';
    testBtn.onclick = sendTestESP32Data;
    testBtn.style.marginTop = '10px';
    document.querySelector('.sidebar').appendChild(testBtn);

    // Add manual refresh button
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'secondary';
    refreshBtn.innerHTML = '🔄 Force Refresh';
    refreshBtn.onclick = function() {
        console.log("Manual refresh requested");
        pollForData();
    };
    refreshBtn.style.marginTop = '5px';
    document.querySelector('.sidebar').appendChild(refreshBtn);
});