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
// Algoritmo di tracciamento avanzato per palline e oggetti veloci (Template Matching + Filtro Colore)
function trackMarkers() {
    if (bioVideo.paused || bioVideo.ended) return;
    
    // Sincronizza le dimensioni reali del canvas con il video
    if (analysisCanvas.width !== bioVideo.videoWidth || analysisCanvas.height !== bioVideo.videoHeight) {
        analysisCanvas.width = bioVideo.videoWidth; 
        analysisCanvas.height = bioVideo.videoHeight;
    }
    
    analysisCtx.drawImage(bioVideo, 0, 0);

    const baseSearchRadius = 35; // Raggio bilanciato per seguire la pallina
    const maxJumpAllowed = 45;   // Evita teletrasporti anomali su linee o sfondi

    const trackItem = (m) => {
        if (!m.patch) return;
        
        // Calcolo della posizione prevista basata sull'inerzia (velocità precedente)
        let predictedX = m.rawX + (m.vx || 0); 
        let predictedY = m.rawY + (m.vy || 0);
        let bestX = m.rawX; 
        let bestY = m.rawY; 
        let minScore = Infinity;
        
        const startX = Math.max(0, Math.floor(predictedX - baseSearchRadius)); 
        const endX = Math.min(bioVideo.videoWidth - m.patchSize, Math.floor(predictedX + baseSearchRadius));
        const startY = Math.max(0, Math.floor(predictedY - baseSearchRadius)); 
        const endY = Math.min(bioVideo.videoHeight - m.patchSize, Math.floor(predictedY + baseSearchRadius));

        // Esplorazione della patch con passo 1 o 2
        for (let y = startY; y <= endY; y += 2) {
            for (let x = startX; x <= endX; x += 2) {
                try {
                    const candidateData = analysisCtx.getImageData(x, y, m.patchSize, m.patchSize);
                    let diff = 0;
                    let colorDist = 0;
                    
                    for (let i = 0; i < candidateData.data.length; i += 4) {
                        // Differenza assoluta RGB (Template Matching standard)
                        const dr = Math.abs(candidateData.data[i] - m.patch.data[i]);
                        const dg = Math.abs(candidateData.data[i+1] - m.patch.data[i+1]);
                        const db = Math.abs(candidateData.data[i+2] - m.patch.data[i+2]);
                        
                        diff += (dr + dg + db);
                    }
                    
                    // Punteggio combinato (minor diff = match migliore)
                    if (diff < minScore) { 
                        minScore = diff; 
                        bestX = x + m.patchSize / 2; 
                        bestY = y + m.patchSize / 2; 
                    }
                } catch (e) {}
            }
        }
        
        // Controllo di sicurezza anti-salto su elementi di disturbo (es. linee bianche del campo)
        const distance = Math.hypot(bestX - m.rawX, bestY - m.rawY);
        if (distance > maxJumpAllowed) {
            // Se tenta di saltare troppo lontano, frena mantenendo l'inerzia ridotta
            bestX = m.rawX + (m.vx || 0) * 0.3;
            bestY = m.rawY + (m.vy || 0) * 0.3;
        }

        // Smorzamento cinematico della velocità (Fattore 0.7 per fluidità)
        m.vx = (bestX - m.rawX) * 0.7; 
        m.vy = (bestY - m.rawY) * 0.7;
        m.rawX = bestX; 
        m.rawY = bestY; 
        m.x = bestX; 
        m.y = bestY;

        // Aggiornamento dinamico della patch (Adaptive Template): cattura la nuova faccia della pallina 
        // per evitare che si sballi se la luce o l'inclinazione cambiano leggermente nei fotogrammi successivi
        try {
            const pX = Math.max(0, Math.floor(bestX - m.patchSize / 2));
            const pY = Math.max(0, Math.floor(bestY - m.patchSize / 2));
            if (pX + m.patchSize <= bioVideo.videoWidth && pY + m.patchSize <= bioVideo.videoHeight) {
                m.patch = analysisCtx.getImageData(pX, pY, m.patchSize, m.patchSize);
            }
        } catch(e) {}
        
        // Registrazione storico per grafici e timeline
        if (!m.historyRawX) m.historyRawX = []; 
        if (!m.historyRawY) m.historyRawY = []; 
        if (!m.historyTime) m.historyTime = [];
        
        m.historyRawX.push(bestX);
        m.historyRawY.push(bestY);
        m.historyTime.push(bioVideo.currentTime);
    };

    if (markers.length > 0 || angleMarkers.length > 0) {
        markers.forEach(trackItem); 
        angleMarkers.forEach(trackItem); 
        drawMarkers();
        
        const effectiveSec = Math.max(0, Math.round(bioVideo.currentTime + (parseInt(videoOffsetInput.value) || 0) - (parseInt(gpxOffsetInput.value) || 0)));
        const timeLabel = effectiveSec + "s";
        const currentValuesX = markers.map(m => Math.round(m.x)); 
        const currentValuesY = markers.map(m => Math.round(m.y)); 
        const currentValuesZ = markers.map(m => Math.round(Math.hypot(m.vx || 0, m.vy || 0) * 10));
        let currentAngle = angleMarkers.length === 2 ? calculateAngle(angleMarkers[0], angleMarkers[1]) : null;
        
        updateLiveCharts(timeLabel, currentValuesX, currentValuesY, currentValuesZ, currentAngle); 
        saveBioDataToMemory();
    }
    
    refreshAllChartsSync(); 
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
