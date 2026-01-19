require('dotenv').config();
const express = require('express');
const moment = require('moment');
const fs = require('fs');
const path = require('path');

// Módulos
const { generateCreativeContent, generateBrandedImage } = require('./utils/aiGenerator');
const { createBroadcast } = require('./utils/youtubeManager');
const { startStream, stopStream } = require('./utils/streamer');

const PORT = process.env.PORT || 8080;
const CYCLE_DURATION_HOURS = 12;

// --- SERVIDOR WEB (Solo para que Render no nos apague) ---
const app = express();
let currentStatus = "INICIANDO";

app.get('/', (req, res) => {
    res.send(`🤖 Relax Station Bot V3 - Estado: ${currentStatus} - Hora: ${moment().format('HH:mm:ss')}`);
});

app.listen(PORT, () => {
    console.log(`🌐 Servidor Web escuchando en puerto ${PORT}`);
    // Arrancamos el bucle principal UNA SOLA VEZ
    mainLoop();
});


/**
 * BUCLE INFINITO LINEAL (ESTILO PYTHON)
 * Hace una cosa, espera, hace la siguiente, espera...
 */
async function mainLoop() {
    console.log("\n🚀 INICIANDO BUCLE PRINCIPAL DEL BOT");

    while (true) { // Esto nunca se detiene
        try {
            console.log("\n=================================================");
            console.log(`🎬 NUEVO CICLO - HORA: ${moment().format('HH:mm:ss')}`);
            console.log("=================================================");

            // --- PASO 1: CREATIVIDAD (IA) ---
            currentStatus = "PASO 1: PENSANDO (IA)";
            console.log("🧠 [1/4] Consultando a DeepSeek...");
            
            // Reintentos simples para IA
            let metadata = null;
            for (let i = 0; i < 3; i++) {
                try {
                    metadata = await generateCreativeContent();
                    break; // Si funciona, salimos del for
                } catch (e) {
                    console.warn(`⚠️ Intento ${i+1} fallido (Texto). Reintentando...`);
                    await new Promise(r => setTimeout(r, 5000));
                }
            }
            if (!metadata) throw new Error("Fallo total en DeepSeek (Texto)");
            console.log("   ✅ Título:", metadata.title);


            // --- PASO 2: IMAGEN ---
            currentStatus = "PASO 2: GENERANDO IMAGEN";
            console.log("🎨 [2/4] Generando Portada...");
            
            let imagePath = null;
            for (let i = 0; i < 3; i++) {
                try {
                    imagePath = await generateBrandedImage(metadata.image_prompt);
                    if(imagePath) break;
                } catch (e) {
                    console.warn(`⚠️ Intento ${i+1} fallido (Imagen). Reintentando...`);
                    await new Promise(r => setTimeout(r, 5000));
                }
            }
            // Fallback de imagen
            if (!imagePath) {
                console.log("⚠️ Usando imagen por defecto.");
                imagePath = path.join(__dirname, 'default.jpg');
            }
            console.log("   ✅ Imagen lista.");


            // --- PASO 3: YOUTUBE ---
            currentStatus = "PASO 3: CONFIGURANDO YOUTUBE";
            console.log("📡 [3/4] Creando evento en YouTube...");
            const broadcast = await createBroadcast(metadata.title, metadata.description);
            console.log("   ✅ Evento Creado. RTMP:", broadcast.rtmpUrl);


            // --- PASO 4: TRANSMISIÓN (BLOQUEANTE) ---
            currentStatus = "PASO 4: EN VIVO 🔴";
            console.log(`🚀 [4/4] Iniciando Transmisión de ${CYCLE_DURATION_HOURS} Horas...`);
            console.log("   (El bot se quedará esperando aquí hasta que termine)");

            const audioUrl = process.env.AUDIO_SOURCE_URL;

            // AQUI ESTA LA CLAVE: El 'await' no terminará hasta dentro de 12 horas
            await startStream(imagePath, audioUrl, broadcast.rtmpUrl, CYCLE_DURATION_HOURS);

            console.log("🏁 Fin de la transmisión (FFmpeg se cerró).");


            // --- FIN DEL CICLO ---
            currentStatus = "LIMPIANDO";
            console.log("🧹 Limpiando archivos temporales...");
            if (imagePath && imagePath.includes('temp_cover')) {
                try { fs.unlinkSync(imagePath); } catch (e) {}
            }

            console.log("💤 Descansando 30 segundos antes del siguiente ciclo...");
            await new Promise(r => setTimeout(r, 30000));

        } catch (error) {
            console.error("\n❌ ERROR GRAVE EN EL BUCLE:");
            console.error(error);
            currentStatus = "ERROR - REINTENTANDO";
            
            // Si algo falla, esperamos 1 minuto y el 'while(true)' volverá a empezar
            console.log("🔄 Reintentando ciclo en 60 segundos...");
            await new Promise(r => setTimeout(r, 60000));
        }
    }
}