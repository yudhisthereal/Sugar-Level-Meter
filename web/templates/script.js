// Global variables
let glucoseChart = null;
let pollInterval = null;
let currentDataSource = 'manual';
let isPollingActive = true;

// Initialize Chart
function initChart() {
    console.log("📊 Initializing chart...");
    const ctx = document.getElementById('glucoseChart').getContext('2d');

    glucoseChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Glucose Level',
                data: [],
                borderColor: '#ac0000',
                backgroundColor: 'rgba(172, 0, 0, 0.05)',
                borderWidth: 3,
                pointBackgroundColor: '#ac0000',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.3,
                cubicInterpolationMode: 'monotone'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 300,
                easing: 'easeOutQuart'
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleFont: { size: 13 },
                    bodyFont: { size: 13 },
                    padding: 12,
                    callbacks: {
                        label: function (context) {
                            return `Glucose: ${context.parsed.y.toFixed(1)} mg/dL`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    min: 50,
                    max: 150,
                    title: {
                        display: true,
                        text: 'Glucose Level (mg/dL)',
                        font: { size: 14, weight: 'bold', color: '#555' }
                    },
                    grid: {
                        color: 'rgba(0,0,0,0.07)',
                        drawBorder: false
                    },
                    ticks: {
                        font: { size: 12 },
                        color: '#666',
                        padding: 8
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Time',
                        font: { size: 14, weight: 'bold', color: '#555' }
                    },
                    grid: {
                        color: 'rgba(0,0,0,0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        font: { size: 11 },
                        color: '#666',
                        maxRotation: 45,
                        minRotation: 45,
                        maxTicksLimit: 15
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            },
            elements: {
                line: {
                    borderCapStyle: 'round'
                },
                point: {
                    hitRadius: 10,
                    hoverRadius: 8
                }
            }
        }
    });
    console.log("✅ Chart initialized");
}

// Set data source
function setDataSource(source) {
    if (source === currentDataSource) return;

    console.log(`🔄 Switching data source to: ${source}`);

    // Update UI
    document.getElementById('manualSourceBtn').classList.remove('active');
    document.getElementById('esp32SourceBtn').classList.remove('active');
    document.getElementById(source + 'SourceBtn').classList.add('active');

    // Show/hide manual controls
    const manualControls = document.getElementById('manualControls');
    if (source === 'manual') {
        manualControls.style.display = 'block';
    } else {
        manualControls.style.display = 'none';
    }

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
                document.getElementById('dataSourceInfo').innerHTML =
                    `Data Source: <b>${source === 'manual' ? 'Manual Input' : 'ESP32 Live'}</b>`;

                showNotification(`Switched to ${source === 'manual' ? 'Manual Input' : 'ESP32 Live Data'}`, 'info');

                // Force immediate update
                pollForUpdates();
            }
        })
        .catch(error => {
            console.error('Error switching data source:', error);
        });
}

// Continuous polling for updates
function startPolling() {
    console.log('🔄 Starting continuous polling (1 second interval)...');

    // Clear any existing interval
    if (pollInterval) {
        clearInterval(pollInterval);
    }

    // Immediate first poll
    pollForUpdates();

    // Continuous polling every 1 second
    pollInterval = setInterval(pollForUpdates, 1000);

    console.log('✅ Continuous polling started');
}

// Poll for updates
function pollForUpdates() {
    if (!isPollingActive) return;

    fetch('/api/get-current-data')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.status === 'success') {
                // Update all displays
                updateSensorDisplays(data.sensor_values);
                updateGlucoseChart(data.glucose_data, data.y_range);
                updateChartStats(data.glucose_data);
                updateStatusDisplay(data);

                // Update data points info
                document.getElementById('dataPointsInfo').innerHTML =
                    `Points: <b>${data.data_count}/30</b>`;
            }
        })
        .catch(error => {
            console.error('❌ Poll error:', error);
            // Don't stop polling on error
        });
}

// Update sensor displays
function updateSensorDisplays(sensorData) {
    // Update current values display
    document.getElementById('currentRed').textContent = sensorData.red_signal.toFixed(2);
    document.getElementById('currentIR').textContent = sensorData.ir_signal.toFixed(2);
    document.getElementById('currentTemp').textContent = sensorData.temperature.toFixed(1);
    document.getElementById('currentMotion').textContent = sensorData.motion.toFixed(2);

    // Only update sliders in manual mode
    if (currentDataSource === 'manual') {
        document.getElementById('redSlider').value = sensorData.red_signal;
        document.getElementById('irSlider').value = sensorData.ir_signal;
        document.getElementById('tempSlider').value = sensorData.temperature;
        document.getElementById('motionSlider').value = sensorData.motion;

        document.getElementById('redValue').textContent = sensorData.red_signal.toFixed(2);
        document.getElementById('irValue').textContent = sensorData.ir_signal.toFixed(2);
        document.getElementById('tempValue').textContent = sensorData.temperature.toFixed(1);
        document.getElementById('motionValue').textContent = sensorData.motion.toFixed(2);
    }
}

// Update glucose chart with dynamic Y-axis
function updateGlucoseChart(history, yRange) {
    if (!history || history.length === 0) {
        // Keep existing data if no new data
        return;
    }

    const labels = history.map(d => d.Time);
    const glucoseValues = history.map(d => d.Glucose);

    // Update chart data
    glucoseChart.data.labels = labels;
    glucoseChart.data.datasets[0].data = glucoseValues;

    // Update current glucose display
    const latest = history[history.length - 1];
    document.getElementById('currentGlucose').textContent = latest.Glucose.toFixed(1);
    document.getElementById('chartCurrent').textContent = latest.Glucose.toFixed(1);
    document.getElementById('currentTime').textContent = `Time: ${latest.Time}`;

    // Update Y-axis range dynamically
    if (yRange) {
        glucoseChart.options.scales.y.min = yRange.min;
        glucoseChart.options.scales.y.max = yRange.max;

        // Update range display
        document.getElementById('chartRange').textContent =
            `Y-axis: ${yRange.min.toFixed(0)} - ${yRange.max.toFixed(0)} mg/dL`;
    }

    // Update chart
    glucoseChart.update();

    // Update last update time
    document.getElementById('updateTime').textContent =
        `Last update: ${new Date().toLocaleTimeString()}`;
}

// Update chart statistics
function updateChartStats(history) {
    if (!history || history.length === 0) return;

    const glucoseValues = history.map(d => d.Glucose);
    const minValue = Math.min(...glucoseValues);
    const maxValue = Math.max(...glucoseValues);
    const avgValue = glucoseValues.reduce((a, b) => a + b, 0) / glucoseValues.length;

    document.getElementById('chartMin').textContent = minValue.toFixed(1);
    document.getElementById('chartMax').textContent = maxValue.toFixed(1);
    document.getElementById('chartAvg').textContent = avgValue.toFixed(1);
}

// Update status display
function updateStatusDisplay(data) {
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const lastUpdate = document.getElementById('lastUpdate');
    const bufferInfo = document.getElementById('bufferInfo');

    // Update connection status
    if (data.sensor_values.device_connected) {
        statusIndicator.className = 'status-indicator status-online';
        statusIndicator.querySelector('.status-dot').className = 'status-dot dot-online';
        statusText.textContent = 'ESP32 Connected';

        if (data.sensor_values.last_update) {
            try {
                const lastUpdateTime = new Date(data.sensor_values.last_update);
                lastUpdate.textContent = `Last ESP32 data: ${lastUpdateTime.toLocaleTimeString()}`;
            } catch (e) {
                lastUpdate.textContent = 'Last ESP32 data: Just now';
            }
        }
    } else {
        statusIndicator.className = 'status-indicator status-offline';
        statusIndicator.querySelector('.status-dot').className = 'status-dot dot-offline';
        statusText.textContent = 'Manual Mode';
        lastUpdate.textContent = currentDataSource === 'manual' ? 'Using manual input' : 'Waiting for ESP32...';
    }

    // Update buffer info
    bufferInfo.textContent = `Buffer: ${data.data_count}/30 points`;
}

// Update sensor via sliders (manual mode only)
function updateSensor(type, value) {
    if (currentDataSource !== 'manual') return;

    const numValue = parseFloat(value);

    // Update display
    document.getElementById(`${type}Value`).textContent =
        type === 'temperature' ? numValue.toFixed(1) : numValue.toFixed(2);

    document.getElementById(`current${type.charAt(0).toUpperCase() + type.slice(1)}`).textContent =
        type === 'temperature' ? numValue.toFixed(1) : numValue.toFixed(2);

    // Send update to server
    const payload = {};
    const key = type === 'temperature' ? 'temperature' : `${type}_signal`;
    payload[key] = numValue;

    fetch('/api/update-sensors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

// Clear current buffer
function clearCurrentBuffer() {
    if (confirm(`Clear all data in ${currentDataSource} buffer?`)) {
        fetch('/api/clear-buffer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ buffer_name: currentDataSource })
        })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    showNotification(`Cleared ${currentDataSource} buffer`, 'info');
                    // Force immediate update to refresh chart
                    pollForUpdates();
                }
            });
    }
}

// Download CSV
function downloadCSV() {
    window.location.href = '/api/download-csv';
}

// Show notification
function showNotification(message, type) {
    console.log(`💬 ${type.toUpperCase()}: ${message}`);

    // Remove existing notification
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();

    // Create new notification
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    // Auto-remove after 3 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }
    }, 3000);
}

// Initialize everything
document.addEventListener('DOMContentLoaded', function () {
    console.log('🚀 BLINKBand Continuous Monitoring loading...');

    // Initialize chart
    initChart();

    // Set initial sensor values
    updateSensor('red', 0.6);
    updateSensor('ir', 0.7);
    updateSensor('temperature', 36.5);
    updateSensor('motion', 0.3);

    // Set initial data source
    setDataSource('manual');

    // Start continuous polling
    startPolling();

    console.log('✅ BLINKBand Continuous Monitoring loaded');

    // Initial status check
    fetch('/api/health')
        .then(response => response.json())
        .then(data => {
            console.log('🏥 System health:', data);
        });
});