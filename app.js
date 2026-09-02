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
    drawings: [], // Array per memorizzare permanentemente i disegni e i marker con il loro timestamp
    telemetryData: null
};

// Riferimenti DOM principali
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
    
    // Reset iniziale: nessuno strumento attivo, player controllabile
    appState.currentTool = null;
    drawingCanvas.classList.remove('active-drawing');

    mainVideo.onloadedmetadata = () => {
        // Imposta la risoluzione interna del canvas sulla risoluzione effettiva del video
        drawingCanvas.width = mainVideo.videoWidth || 1280;
        drawingCanvas.height = mainVideo.videoHeight || 720;
        
        updateCanvasDisplaySize();
        redrawCanvas();
    };
}

// Sincronizza le dimensioni visive del canvas con quelle reali del video renderizzato
function updateCanvasDisplaySize() {
    if (!mainVideo || !drawingCanvas) return;
    const rect = mainVideo.getBoundingClientRect();
    drawingCanvas.style.width = `${rect.width}px`;
    drawingCanvas.style.height = `${rect.height}px`;
    drawingCanvas.style.top = `${mainVideo.offsetTop}px`;
    drawingCanvas.style.left = `${mainVideo.offsetLeft}px`;
}

// Aggiorna le dimensioni del canvas se la finestra viene ridimensionata
window.addEventListener('resize', updateCanvasDisplaySize);

// Ascolta l'avanzamento del video per aggiornare i disegni in base al tempo (timestamp)
if (mainVideo) {
    mainVideo.addEventListener('timeupdate', () => {
        redrawCanvas();
    });
}

// --- 2. STRUMENTI DI DISEGNO E CANVAS ---
document.querySelectorAll('.tool-btn:not(#btn-clear-canvas)').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const clickedTool = e.target.getAttribute('data-tool');
        
        // Toggle strumento attivo: se clicchi lo stesso, si disattiva e torni al controllo player
        if (appState.currentTool === clickedTool) {
            e.target.classList.remove('active');
            appState.currentTool = null;
            drawingCanvas.classList.remove('active-drawing');
            return;
        }

        // Attiva il nuovo strumento e blocca temporaneamente l'interazione diretta col player
        document.querySelectorAll('.tool-btn:not(#btn-clear-canvas)').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        appState.currentTool = clickedTool;
        appState.clickPoints = [];
        
        drawingCanvas.classList.add('active-drawing');
        updateCanvasDisplaySize();
    });
});

const btnClearCanvas = document.getElementById('btn-clear-canvas');
if (btnClearCanvas) {
    btnClearCanvas.addEventListener('click', () => {
        appState.drawings = [];
        appState.clickPoints = [];
        if (ctx) {
            ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
        }
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
        
        // Registra il timestamp corrente del video per agganciare l'elemento al tempo esatto
        const currentTime = mainVideo ? mainVideo.currentTime : 0;
        
        appState.clickPoints.push({ x, y });
        
        if (appState.currentTool === 'marker') {
            appState.drawings.push({ 
                type: 'marker', 
                timestamp: currentTime, 
                x: x, 
                y: y 
            });
            redrawCanvas();
            appState.clickPoints = [];
        } else if (appState.currentTool === 'line' && appState.clickPoints.length === 2) {
            appState.drawings.push({ 
                type: 'line', 
                timestamp: currentTime, 
                p1: appState.clickPoints[0], 
                p2: appState.clickPoints[1] 
            });
            redrawCanvas();
            appState.clickPoints = [];
        }
    });
}

function redrawCanvas() {
    if (!ctx) return;
    ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    
    const currentTime = mainVideo ? mainVideo.currentTime : 0;
    const tolerance = 0.5; // Finestra di tolleranza in secondi in cui il disegno rimane visibile attorno al timestamp

    appState.drawings.item = appState.drawings.forEach(item => {
        // Mostra il disegno se il video si trova temporalmente vicino al momento in cui è stato tracciato (es. ±0.5 secondi)
        // Puoi rimuovere questo controllo se desideri che i disegni rimangano fissi indipendentemente dal tempo.
        if (Math.abs(item.timestamp - currentTime) <= tolerance) {
            if (item.type === 'marker') {
                ctx.beginPath();
                ctx.arc(item.x, item.y, 8, 0, 2 * Math.PI);
                ctx.fillStyle = '#ef4444';
                ctx.fill();
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#ffffff';
                ctx.stroke();
            } else if (item.type === 'line') {
                ctx.beginPath();
                ctx.moveTo(item.p1.x, item.p1.y);
                ctx.lineTo(item.p2.x, item.p2.y);
                ctx.strokeStyle = '#38bdf8';
                ctx.lineWidth = 4;
                ctx.stroke();
            }
        }
    });
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
