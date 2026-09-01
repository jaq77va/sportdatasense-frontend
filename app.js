// app.js - Logica Frontend Completa per SportDataSense Workstation
const BACKEND_URL = "https://sportdatasense-backend.onrender.com";

let appState = {
    videoLoaded: false,
    telemetryData: null,
    activeCharts: {},
    currentTool: 'line',
    clickPoints: []
};

console.log("[SportDataSense] Workstation inizializzata con tutte le funzionalità.");

// --- MODULO 1: VIDEO & TRACKER ---
const videoDropzone = document.getElementById('video-dropzone');
const videoInput = document.getElementById('video-input');
const videoContainer = document.getElementById('video-container');
const mainVideo = document.getElementById('main-video');
const drawingCanvas = document.getElementById('drawing-canvas');
const canvasCtx = drawingCanvas.getContext('2d');
const videoTools = document.getElementById('video-tools');
const sessionNameSpan = document.getElementById('current-session-name');

videoDropzone.addEventListener('click', () => videoInput.click());
videoDropzone.addEventListener('dragover', (e) => { e.preventDefault(); videoDropzone.style.borderColor = '#38bdf8'; });
videoDropzone.addEventListener('dragleave', () => videoDropzone.style.borderColor = '#475569');
videoDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
        handleVideoFile(e.dataTransfer.files[0]);
    }
});
videoInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleVideoFile(e.target.files[0]);
    }
});

function handleVideoFile(file) {
    console.log("[Video] Caricamento file video:", file.name);
    const videoUrl = URL.createObjectURL(file);
    mainVideo.src = videoUrl;
    sessionNameSpan.textContent = file.name;
    
    videoDropzone.style.display = 'none';
    videoContainer.style.display = 'flex';
    videoTools.style.display = 'flex';
    appState.videoLoaded = true;
    drawingCanvas.classList.add('active-drawing');

    mainVideo.onloadedmetadata = () => {
        drawingCanvas.width = mainVideo.videoWidth || 1280;
        drawingCanvas.height = mainVideo.videoHeight || 720;
    };
}

// Strumenti di Biomeccanica (Line, Circle, Marker, Angle)
document.querySelectorAll('.tool-btn:not(#btn-clear-canvas)').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tool-btn:not(#btn-clear-canvas)').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        appState.currentTool = e.target.getAttribute('data-tool');
        appState.clickPoints = [];
        drawingCanvas.classList.add('active-drawing');
    });
});

document.getElementById('btn-clear-canvas').addEventListener('click', () => {
    canvasCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    appState.clickPoints = [];
});

let isDrawing = false, startX = 0, startY = 0;

drawingCanvas.addEventListener('mousedown', (e) => {
    const rect = drawingCanvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) * (drawingCanvas.width / rect.width);
    const clickY = (e.clientY - rect.top) * (drawingCanvas.height / rect.height);

    if (appState.currentTool === 'marker') {
        canvasCtx.fillStyle = '#ef4444';
        canvasCtx.beginPath();
        canvasCtx.arc(clickX, clickY, 6, 0, 2 * Math.PI);
        canvasCtx.fill();
        canvasCtx.strokeStyle = '#ffffff';
        canvasCtx.lineWidth = 2;
        canvasCtx.stroke();
    } 
    else if (appState.currentTool === 'angle') {
        appState.clickPoints.push({ x: clickX, y: clickY });
        canvasCtx.fillStyle = '#38bdf8';
        canvasCtx.beginPath();
        canvasCtx.arc(clickX, clickY, 4, 0, 2 * Math.PI);
        canvasCtx.fill();

        if (appState.clickPoints.length === 3) {
            let p1 = appState.clickPoints[0], vertex = appState.clickPoints[1], p2 = appState.clickPoints[2];
            let angleRad = Math.atan2(p2.y - vertex.y, p2.x - vertex.x) - Math.atan2(p1.y - vertex.y, p1.x - vertex.x);
            let angleDeg = Math.abs(angleRad * (180 / Math.PI));
            if (angleDeg > 180) angleDeg = 360 - angleDeg;

            canvasCtx.strokeStyle = '#22c55e';
            canvasCtx.lineWidth = 3;
            canvasCtx.beginPath();
            canvasCtx.moveTo(p1.x, p1.y);
            canvasCtx.lineTo(vertex.x, vertex.y);
            canvasCtx.lineTo(p2.x, p2.y);
            canvasCtx.stroke();

            canvasCtx.fillStyle = '#ffffff';
            canvasCtx.font = 'bold 18px system-ui';
            canvasCtx.fillText(`${angleDeg.toFixed(1)}°`, vertex.x + 12, vertex.y - 12);
            appState.clickPoints = [];
        }
    } 
    else {
        isDrawing = true;
        startX = clickX;
        startY = clickY;
    }
});

drawingCanvas.addEventListener('mouseup', () => isDrawing = false);

// Controlli Frame-by-Frame
document.getElementById('btn-prev-frame').addEventListener('click', () => {
    if (mainVideo.readyState > 0) mainVideo.currentTime = Math.max(0, mainVideo.currentTime - 0.04);
});
document.getElementById('btn-next-frame').addEventListener('click', () => {
    if (mainVideo.readyState > 0) mainVideo.currentTime = Math.min(mainVideo.duration, mainVideo.currentTime + 0.04);
});

mainVideo.addEventListener('timeupdate', () => {
    const currentFrame = Math.round(mainVideo.currentTime * 30);
    const totalFrames = Math.round((mainVideo.duration || 0) * 30);
    document.getElementById('frame-counter').textContent = `${currentFrame} / ${totalFrames}`;
    
    if (document.getElementById('sync-checkbox').checked && mainVideo.duration) {
        const percent = (mainVideo.currentTime / mainVideo.duration) * 100;
        document.getElementById('master-slider').value = percent;
        document.getElementById('time-current').textContent = formatTime(mainVideo.currentTime);
    }
});

// --- MODULO 2 & 3: TELEMETRIA & LIBRERIA GRAFICI ---
const btnUploadTelemetry = document.getElementById('btn-upload-telemetry');
const telemetryInput = document.getElementById('telemetry-input');

btnUploadTelemetry.addEventListener('click', () => telemetryInput.click());
telemetryInput.addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        const formData = new FormData();
        formData.append("file", file);

        try {
            const response = await fetch(`${BACKEND_URL}/api/parse`, { method: "POST", body: formData });
            if (!response.ok) throw new Error("Errore durante il parsing.");
            
            const result = await response.json();
            appState.telemetryData = result;
            
            updateLibraryUI(result.available_metrics);
            renderCharts(result.data, result.available_metrics);
        } catch (err) {
            console.error("[Telemetria Error]", err);
            alert("Impossibile elaborare il file di telemetria.");
        }
    }
});

function updateLibraryUI(metrics) {
    document.querySelectorAll('.lib-item').forEach(item => {
        const metricName = item.getAttribute('data-metric');
        if (metrics[metricName]) {
            item.classList.remove('disabled');
            item.classList.add('active');
            item.textContent = item.textContent.replace('[+]', '[✓]');
        }
    });
}

function renderCharts(data, metrics) {
    const container = document.getElementById('charts-container');
    container.innerHTML = '';

    Object.keys(metrics).forEach(metric => {
        if (metrics[metric]) {
            const chartDiv = document.createElement('div');
            chartDiv.style.cssText = "background: #0f172a; padding: 10px; border-radius: 6px; margin-bottom: 10px; height: 160px;";
            chartDiv.innerHTML = `<canvas id="chart-${metric}"></canvas>`;
            container.appendChild(chartDiv);

            const ctx = document.getElementById(`chart-${metric}`).getContext('2d');
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: data.timestamps.map((_, i) => i),
                    datasets: [{
                        label: metric.toUpperCase(),
                        data: data[metric],
                        borderColor: '#38bdf8',
                        borderWidth: 1.5,
                        pointRadius: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { display: false },
                        y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#334155' } }
                    },
                    plugins: { legend: { labels: { color: '#f8fafc', font: { size: 11 } } } }
                }
            });
        }
    });
}

// --- MODULO 4: MASTER TIMELINE ---
const masterSlider = document.getElementById('master-slider');
masterSlider.addEventListener('input', (e) => {
    const val = e.target.value;
    if (mainVideo.duration) mainVideo.currentTime = (val / 100) * mainVideo.duration;
});

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// --- MODULO 5: ASSISTENTE IA ---
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const btnSendChat = document.getElementById('btn-send-chat');

btnSendChat.addEventListener('click', sendAIChatMessage);
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendAIChatMessage(); });

async function sendAIChatMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    appendChatMessage(text, 'user-msg');
    chatInput.value = '';

    try {
        const response = await fetch(`${BACKEND_URL}/api/ai-chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: text, session_summary: appState.telemetryData })
        });
        const data = await response.json();
        appendChatMessage(data.response, 'ai-msg');
    } catch (err) {
        appendChatMessage("Errore di comunicazione con l'Assistente IA.", 'ai-msg');
    }
}

function appendChatMessage(text, className) {
    const div = document.createElement('div');
    div.className = className;
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// --- RESET GLOBALE ---
document.getElementById('btn-reset').addEventListener('click', () => {
    if (confirm("Vuoi azzerare completamente lo stato in-memory della sessione?")) {
        location.reload();
    }
});
