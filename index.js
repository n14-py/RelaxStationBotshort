require('dotenv').config();
const express = require('express');
const moment = require('moment');
const fs = require('fs');
const path = require('path');

// --- MÓDULOS DEL BOT ---
const { generateCreativeContent, generateBrandedImage } = require('./utils/aiGenerator');
const { createBroadcast } = require('./utils/youtubeManager'); // (El que creamos en el paso anterior)
const { startStream, stopStream } = require('./utils/streamer');

// --- CONFIGURACIÓN ---
const PORT = process.env.PORT || 8080;
const CYCLE_DURATION_HOURS = 12; // Duración del directo
const MAX_RETRIES = 3;           // Intentos si falla la IA

// Estado del Bot (para monitoreo)
let botState = {
    status: "INICIANDO",
    currentCycleStart: null,
    nextCycleStart: null,
    currentMetadata: {},
    lastError: null
};

// --- SERVIDOR WEB (Health Check) ---
const app = express();

app.get('/', (req, res) => {
    const uptime = process.uptime();
    res.send(`
        <html>
            <body style="font-family: monospace; background: #121212; color: #00ff00; padding: 20px;">
                <h1>🤖 RELAX STATION BOT - ESTADO</h1>
                <hr>
                <p>Status: <strong>${botState.status}</strong></p>
                <p>Ciclo Iniciado: ${botState.currentCycleStart ? moment(botState.currentCycleStart).format('HH:mm:ss') : '--'}</p>
                <p>Próximo Ciclo: ${botState.nextCycleStart ? moment(botState.nextCycleStart).format('HH:mm:ss') : '--'}</p>
                <p>Uptime Servidor: ${Math.floor(uptime / 60)} min</p>
                <hr>
                <h3>🎵 Metadata Actual:</h3>
                <p>Concepto: ${botState.currentMetadata.concept_reasoning || 'N/A'}</p>
                <p>Título: ${botState.currentMetadata.title || 'N/A'}</p>
                <br>
                ${botState.lastError ? `<h3 style="color:red">⚠️ Último Error: ${botState.lastError}</h3>` : ''}
            </body>
        </html>
    `);
});

app.listen(PORT, () => {
    console.log(`🌐 Servidor de monitoreo listo en puerto ${PORT}`);
    // Arrancamos el primer ciclo tras una pequeña pausa de seguridad
    setTimeout(startBroadcastCycle, 5000);
});

/**
 * FUNCIÓN PRINCIPAL: Ejecuta todo el flujo de 12 horas
 */
async function startBroadcastCycle() {
    console.log("\n=================================================");
    console.log(`🎬 INICIANDO NUEVO CICLO (${moment().format('HH:mm:ss')})`);
    console.log("=================================================");
    
    botState.status = "GENERANDO CONTENIDO IA";
    let retryCount = 0;
    let metadata = null;
    let imagePath = null;

    // 1. GENERACIÓN DE CONTENIDO (Con Reintentos)
    while (retryCount < MAX_RETRIES && !metadata) {
        try {
            metadata = await generateCreativeContent(); // DeepSeek
            botState.currentMetadata = metadata;
        } catch (e) {
            retryCount++;
            console.error(`⚠️ Fallo IA Texto (Intento ${retryCount}/${MAX_RETRIES}):`, e.message);
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    // Fallback de emergencia si la IA de texto muere
    if (!metadata) {
        console.error("❌ LA IA FALLÓ TOTALMENTE. Usando datos de emergencia.");
        metadata = {
            title: "🔴 Radio Lofi 24/7 ☕ Música para Estudiar y Relajarse | Relax Station",
            description: "Transmisión de música relajante las 24 horas. Disfruta del mejor Lofi Hip Hop.",
            image_prompt: "lofi room, rain, night, cozy, 8k", // Prompt básico
            concept_reasoning: "EMERGENCY MODE"
        };
    }

    // 2. GENERACIÓN DE IMAGEN (Con Reintentos)
    retryCount = 0;
    while (retryCount < MAX_RETRIES && !imagePath) {
        try {
            imagePath = await generateBrandedImage(metadata.image_prompt); // DeepInfra + Sharp
        } catch (e) {
            retryCount++;
            console.error(`⚠️ Fallo IA Imagen (Intento ${retryCount}/${MAX_RETRIES}):`, e.message);
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    // Fallback de imagen
    if (!imagePath) {
        console.warn("⚠️ Usando imagen por defecto (default.jpg).");
        imagePath = path.join(__dirname, 'default.jpg');
    }

    try {
        // 3. CREAR BROADCAST EN YOUTUBE
        botState.status = "CONFIGURANDO YOUTUBE";
        console.log("📡 Conectando con YouTube...");
        
        // Creamos el evento con el título y descripción generados
        const broadcast = await createBroadcast(metadata.title, metadata.description);

        // 4. INICIAR STREAMING
        botState.status = "EN VIVO 🔴";
        botState.currentCycleStart = new Date();
        botState.nextCycleStart = moment().add(CYCLE_DURATION_HOURS, 'hours').toDate();

        console.log(`🚀 Iniciando FFmpeg por ${CYCLE_DURATION_HOURS} horas...`);
        const audioUrl = process.env.AUDIO_SOURCE_URL;

        // Llamamos al streamer con la duración para el contador regresivo
        await startStream(imagePath, audioUrl, broadcast.rtmpUrl, CYCLE_DURATION_HOURS);
        
        console.log("✅ Stream estabilizado. Esperando fin del ciclo...");

        // 5. ESPERA ACTIVA (Dormir por 12 horas)
        // Convertimos horas a milisegundos
        const durationMs = CYCLE_DURATION_HOURS * 60 * 60 * 1000;
        await new Promise(resolve => setTimeout(resolve, durationMs));

        console.log("⏰ Fin del ciclo de 12 horas.");

    } catch (error) {
        console.error("❌ ERROR CRÍTICO EN EL CICLO:", error);
        botState.lastError = error.message;
        botState.status = "ERROR - RECUPERANDO";
        
        // Si falla, esperamos 1 minuto y reiniciamos
        await new Promise(resolve => setTimeout(resolve, 60000));

    } finally {
        // 6. LIMPIEZA Y REINICIO
        console.log("♻️ Preparando siguiente ciclo...");
        stopStream();
        
        // Borrar imagen temporal (menos la default)
        if (imagePath && imagePath.includes('temp_cover') && fs.existsSync(imagePath)) {
            try { fs.unlinkSync(imagePath); } catch(e) {}
        }

        // RECURSIVIDAD: Volver a empezar
        startBroadcastCycle();
    }
}