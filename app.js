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
    drawings: [], // Array per memorizzare i marker con tracciamento avanzato
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

// Canvas offscreen per l'analisi dei pixel del video (Template Matching)[cite: 19]
const analysisCanvas = document.createElement('canvas');
const analysisCtx = analysisCanvas.getContext('2d', { willReadFrequently: true });
let trackingInterval = null;

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
    
    appState.currentTool = null;
    drawingCanvas.classList.remove('active-drawing');

    mainVideo.onloadedmetadata = () => {
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

window.addEventListener('resize', updateCanvasDisplaySize);

// --- 2. STRUMENTI DI DISEGNO E TRACKING VISIVO ---
document.querySelectorAll('.tool-btn:not(#btn-clear-canvas)').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const clickedTool = e.target.getAttribute('data-tool');
        
        if (appState.currentTool === clickedTool) {
            e.target.classList.remove('active');
            appState.currentTool = null;
            drawingCanvas.classList.remove('active-drawing');
            return;
        }

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
        if (trackingInterval) cancelAnimationFrame(trackingInterval);
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
        
        appState.clickPoints.push({ x, y });
        
        if (appState.currentTool === 'marker') {
            // Estrazione del patch visivo (campione di pixel) nel punto cliccato[cite: 19]
            const patchSize = 14;
            analysisCanvas.width = mainVideo.videoWidth;
            analysisCanvas.height = mainVideo.videoHeight;
            analysisCtx.drawImage(mainVideo, 0, 0);
            
            let templateData = null;
            try {
                const pX = Math.max(0, Math.floor(x - patchSize / 2));
                const pY = Math.max(0, Math.floor(y - patchSize / 2));
                templateData = analysisCtx.getImageData(pX, pY, patchSize, patchSize);
            } catch (err) {
                console.error("Errore estrazione patch video:", err);
            }

            // Aggiunge il marker strutturato con storico e velocità per il tracking[cite: 19]
            appState.drawings.push({ 
                type: 'marker', 
                x: x, 
                y: y,
                rawX: x,
                rawY: y,
                vx: 0,
                vy: 0,
                historyRawX: [x],
                historyRawY: [y],
                historyTime: [mainVideo.currentTime],
                patch: templateData,
                patchSize: patchSize,
                color: '#ef4444'
            });

            redrawCanvas();
            appState.clickPoints = [];
        } else if (appState.currentTool === 'line' && appState.clickPoints.length === 2) {
            appState.drawings.push({ 
                type: 'line', 
                timestamp: mainVideo.currentTime, 
                p1: appState.clickPoints[0], 
                p2: appState.clickPoints[1] 
            });
            redrawCanvas();
            appState.clickPoints = [];
        }
    });
}

// Funzione di rendering grafico dei marker e delle relative traiettorie
function redrawCanvas() {
    if (!ctx) return;
    ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    
    appState.drawings.forEach(item => {
        if (item.type === 'marker') {
            // Disegna la scia/traiettoria passata se presente[cite: 19]
            if (item.historyRawX && item.historyRawX.length > 1) {
                ctx.beginPath();
                ctx.moveTo(item.historyRawX[0], item.historyRawY[0]);
                for (let i = 1; i < item.historyRawX.length; i++) {
                    ctx.lineTo(item.historyRawX[i], item.historyRawY[i]);
                }
                ctx.lineWidth = 3;
                ctx.strokeStyle = item.color;
                ctx.stroke();
            }

            // Disegna il marker nella posizione corrente
            ctx.beginPath();
            ctx.arc(item.x, item.y, 8, 0, 2 * Math.PI);
            ctx.fillStyle = item.color;
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
    });
}

// Algoritmo di tracciamento automatico frame per frame tramite Template Matching[cite: 19]
// Algoritmo di tracciamento automatico ad alta precisione (Template Matching ottimizzato)
function trackMarkers() {
    if (!mainVideo || mainVideo.paused || mainVideo.ended) return;

    analysisCanvas.width = mainVideo.videoWidth;
    analysisCanvas.height = mainVideo.videoHeight;
    analysisCtx.drawImage(mainVideo, 0, 0);

    // Raggio di ricerca ampliato a 50px per non perdere oggetti veloci
    const baseSearchRadius = 50;

    appState.drawings.forEach(item => {
        if (item.type === 'marker' && item.patch) {
            // Predizione della posizione futura basata sulla velocità precedente
            let predictedX = item.rawX + item.vx;
            let predictedY = item.rawY + item.vy;
            let bestX = predictedX;
            let bestY = predictedY;
            let minDiff = Infinity;

            const startX = Math.max(0, Math.floor(predictedX - baseSearchRadius));
            const endX = Math.min(mainVideo.videoWidth - item.patchSize, Math.floor(predictedX + baseSearchRadius));
            const startY = Math.max(0, Math.floor(predictedY - baseSearchRadius));
            const endY = Math.min(mainVideo.videoHeight - item.patchSize, Math.floor(predictedY + baseSearchRadius));

            // SCANSIONE A PASSO 1: Analizza ogni singolo pixel per la massima precisione geometrica
            for (let y = startY; y <= endY; y += 1) {
                for (let x = startX; x <= endX; x += 1) {
                    try {
                        const candidateData = analysisCtx.getImageData(x, y, item.patchSize, item.patchSize);
                        let diff = 0;
                        for (let i = 0; i < candidateData.data.length; i += 4) {
                            diff += Math.abs(candidateData.data[i] - item.patch.data[i]) + 
                                    Math.abs(candidateData.data[i+1] - item.patch.data[i+1]) + 
                                    Math.abs(candidateData.data[i+2] - item.patch.data[i+2]);
                        }
                        if (diff < minDiff) { 
                            minDiff = diff; 
                            bestX = x + item.patchSize / 2; 
                            bestY = y + item.patchSize / 2; 
                        }
                    } catch (e) {}
                }
            }

            // APPLICAZIONE MOMENTUM / INERZIA: Evita sobbalzi e stabilisce un movimento fluido
            const measuredVx = bestX - item.rawX;
            const measuredVy = bestY - item.rawY;
            
            // Filtro di smoothing (40% velocità precedente + 60% nuova misurazione)
            item.vx = (item.vx * 0.4) + (measuredVx * 0.6);
            item.vy = (item.vy * 0.4) + (measuredVy * 0.6);

            item.rawX = bestX;
            item.rawY = bestY;
            item.x = bestX;
            item.y = bestY;

            if (!item.historyRawX) item.historyRawX = [];
            if (!item.historyRawY) item.historyRawY = [];
            if (!item.historyTime) item.historyTime = [];

            item.historyRawX.push(bestX);
            item.historyRawY.push(bestY);
            item.historyTime.push(mainVideo.currentTime);
        }
    });

    redrawCanvas();
    trackingInterval = requestAnimationFrame(trackMarkers);
}

// Gestione eventi di riproduzione video per avviare/fermare il loop di tracking
if (mainVideo) {
    mainVideo.addEventListener('play', () => {
        if (trackingInterval) cancelAnimationFrame(trackingInterval);
        trackingInterval = requestAnimationFrame(trackMarkers);
    });

    mainVideo.addEventListener('pause', () => {
        if (trackingInterval) cancelAnimationFrame(trackingInterval);
        redrawCanvas();
    });

    mainVideo.addEventListener('seeked', () => {
        redrawCanvas();
    });

    mainVideo.addEventListener('timeupdate', () => {
        // Mantiene il canvas sincronizzato durante lo scrubbing manuale
        if (mainVideo.paused) {
            redrawCanvas();
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
