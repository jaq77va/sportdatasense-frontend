// ==========================================
// SPORTDATASENSE WORKSTATION - FRONTEND LOGIC
// ==========================================

// Configura l'URL del backend Render
const BACKEND_URL = "https://sportdatasense-backend.onrender.com";

// Stato globale dell'applicazione
const appState = {
    videoLoaded: false,
    currentTool: null,
    clickPoints: [],
    telemetryData: null
};

// Riferimenti DOM principali (ID allineati correttamente con l'HTML)
const videoDropzone = document.getElementById('video-dropzone');
const videoInput = document.getElementById('video-input');
const videoContainer = document.getElementById('video-container');
const mainVideo = document.getElementById('main-video');
const videoTools = document.getElementById('video-tools');
const drawingCanvas = document.getElementById('drawing-canvas');
const ctx = drawingCanvas ? drawingCanvas.getContext('2d') : null;
const sessionNameSpan = document.getElementById('current-session-name');

// --- 1. GESTIONE CARICAMENTO VIDEO ---
videoDropzone.addEventListener('click', () => videoInput.click());

videoDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    videoDropzone.style.borderColor = '#38bdf8';
});

videoDropzone.addEventListener('dragleave', () => {
    videoDropzone.style.borderColor = '#475569';
});

videoDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    videoDropzone.style.borderColor = '#475569';
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
    console.log("[Video] Caricamento file:", file.name);
    const videoUrl = URL.createObjectURL(file);
    mainVideo.src = videoUrl;
    if (sessionNameSpan) {
        sessionNameSpan.textContent = file.name;
    }
    
    videoDropzone.style.display = 'none';
    videoContainer.style.display = 'flex';
    videoTools.style.display = 'flex';
    appState.videoLoaded = true;
    
    // Il canvas parte disattivato per permettere l'uso dei controlli nativi del video
    drawingCanvas.classList.remove('active-drawing');

    mainVideo.onloadedmetadata = () => {
        drawingCanvas.width = mainVideo.videoWidth || 1280;
        drawingCanvas.height = mainVideo.videoHeight || 720;
    };
}

// --- 2. STRUMENTI DI DISEGNO E CANVAS ---
document.querySelectorAll('.tool-btn:not(#btn-clear-canvas)').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const clickedTool = e.target.getAttribute('data-tool');
        
        // Se clicchi sullo stesso strumento già attivo, lo disattivi (TOGGLE) sbloccando il player
        if (appState.currentTool === clickedTool) {
            e.target.classList.remove('active');
            appState.currentTool = null;
            drawingCanvas.classList.remove('active-drawing');
            return;
        }

        // Altrimenti attiva il nuovo strumento
        document.querySelectorAll('.tool-btn:not(#btn-clear-canvas)').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        appState.currentTool = clickedTool;
        appState.clickPoints = [];
        
        drawingCanvas.classList.add('active-drawing');
    });
});

const btnClearCanvas = document.getElementById('btn-clear-canvas');
if (btnClearCanvas) {
    btnClearCanvas.addEventListener('click', () => {
        if (ctx) {
            ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
        }
        appState.clickPoints = [];
    });
}

if (drawingCanvas) {
    drawingCanvas.addEventListener('click', (e) => {
        if (!appState.currentTool) return;
        
        const rect = drawingCanvas.getBoundingClientRect();
        const scaleX = drawingCanvas.width / rect.width;
        const scaleY = drawingCanvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        appState.clickPoints.push({ x, y });
        
        if (appState.currentTool === 'marker') {
            drawMarker(x, y);
            appState.clickPoints = [];
        } else if (appState.currentTool === 'line' && appState.clickPoints.length === 2) {
            drawLine(appState.clickPoints[0], appState.clickPoints[1]);
            appState.clickPoints = [];
        }
    });
}

function drawMarker(x, y) {
    if (!ctx) return;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, 2 * Math.PI);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
}

function drawLine(p1, p2) {
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4;
    ctx.stroke();
}

// --- 3. COMUNICAZIONE CON IL BACKEND PYTHON (FASTAPI) ---
const telemetryInput = document.getElementById('telemetry-input');
const btnUploadTelemetry = document.getElementById('btn-upload-telemetry');

if (btnUploadTelemetry && telemetryInput) {
    btnUploadTelemetry.addEventListener('click', () => telemetryInput.click());
    
    telemetryInput.addEventListener('change', async (e) => {
        if (e.target.files.length > 0) {
            await uploadTelemetryFile(e.target.files[0]);
        }
    });
}

async function uploadTelemetryFile(file) {
    const formData = new FormData();
    formData.append("file", file);

    try {
        console.log("[API] Invio file telemetrico al backend:", file.name);
        const response = await fetch(`${BACKEND_URL}/api/parse`, {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Errore HTTP: ${response.status}`);
        }

        const result = await response.json();
        appState.telemetryData = result;
        console.log("[API] Dati telemetrici ricevuti:", result);
        alert("File telemetrico elaborato con successo dal backend!");
        return result;
    } catch (error) {
        console.error("[API Error] Impossibile elaborare il file sul server:", error);
        alert("Errore di comunicazione con il backend FastAPI su Render.");
    }
}
