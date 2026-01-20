require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const moment = require('moment');

// --- IMPORTAMOS NUESTROS MÓDULOS ---
const { prepareNextStream } = require('./utils/aiGenerator');
const { createYoutubeBroadcast } = require('./utils/youtubeManager');
const { startStream, stopStream } = require('./utils/streamer');
const Stream = require('./models/Stream');

const PORT = process.env.PORT || 8080;
const CYCLE_DURATION_HOURS = 12; // Cada 12 horas cambia el arte y la playlist

// --- SERVIDOR WEB (Para que Render no apague el bot) ---
const app = express();
let botStatus = "INICIANDO";

app.get('/', (req, res) => {
    res.send(`
        <div style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>📻 Relax Station V6 (Playlist Mode)</h1>
            <p>Estado actual: <span style="color: green; font-weight: bold;">${botStatus}</span></p>
            <p>Hora del servidor: ${moment().format('HH:mm:ss')}</p>
            <hr>
            <p>Transmitiendo desde la nube con música local optimizada.</p>
        </div>
    `);
});

// --- CONEXIÓN A BASE DE DATOS Y ARRANQUE ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ Conectado a MongoDB Atlas");
        
        app.listen(PORT, () => {
            console.log(`🌐 Servidor Web activo en puerto ${PORT}`);
            // Iniciamos el Bucle Infinito de Transmisión
            mainLoop();
        });
    })
    .catch(err => {
        console.error("❌ ERROR CRÍTICO: No se pudo conectar a MongoDB.");
        console.error(err);
    });

/**
 * BUCLE PRINCIPAL (El corazón del Bot)
 */
async function mainLoop() {
    console.log("\n🚀 SISTEMA DE RADIO POR PLAYLIST INICIADO");

    while (true) {
        let currentStream = null;

        try {
            console.log("\n" + "=".repeat(50));
            console.log(`🎬 INICIANDO NUEVO CICLO: ${moment().format('LLLL')}`);
            console.log("=".repeat(50) + "\n");

            // 1. GENERAR ARTE E IMAGEN (IA + BUNNY)
            botStatus = "PREPARANDO ARTE IA";
            console.log("🧠 [1/3] Generando concepto visual y subiendo a Bunny...");
            
            // Reintentos automáticos por si la IA está saturada
            for (let i = 1; i <= 3; i++) {
                try {
                    currentStream = await prepareNextStream();
                    break; 
                } catch (e) {
                    console.warn(`⚠️ Intento ${i} fallido. Reintentando en 15s...`);
                    if (i === 3) throw new Error("Fallo total de los servicios de IA.");
                    await new Promise(r => setTimeout(r, 15000));
                }
            }

            // 2. CONFIGURAR YOUTUBE
            botStatus = "CONFIGURANDO YOUTUBE";
            console.log("📡 [2/3] Creando evento en YouTube Live...");
            currentStream = await createYoutubeBroadcast(currentStream);

            // 3. INICIAR TRANSMISIÓN (PLAYLIST)
            botStatus = "EN VIVO 🔴";
            console.log(`🚀 [3/3] Lanzando FFmpeg por ${CYCLE_DURATION_HOURS} horas...`);

            // Actualizamos estado en MongoDB
            currentStream.status = 'LIVE';
            currentStream.startedAt = new Date();
            await currentStream.save();

            // URL de tu playlist en Cloudinary/Render
            const playlistUrl = "https://lfaftechapi-7nrb.onrender.com/api/relax/playlist.txt";

            // Pasamos los datos al streamer
            // Esto se quedará aquí bloqueado las 12 horas hasta que FFmpeg termine
            await startStream(
                currentStream.bunny_image_url, 
                playlistUrl, 
                currentStream.youtube_rtmp_url, 
                CYCLE_DURATION_HOURS
            );

            // 4. FINALIZACIÓN DEL CICLO
            console.log("🏁 Ciclo completado con éxito.");
            currentStream.status = 'FINISHED';
            currentStream.finishedAt = new Date();
            await currentStream.save();

            botStatus = "CICLO TERMINADO - REINICIANDO";
            console.log("💤 Esperando 30 segundos para la siguiente rotación...");
            await new Promise(r => setTimeout(r, 30000));

        } catch (error) {
            console.error("\n❌ ERROR GRAVE EN EL BUCLE:");
            console.error(error.message);
            
            botStatus = "ERROR - REINTENTANDO";
            
            if (currentStream) {
                currentStream.status = 'ERROR';
                await currentStream.save().catch(() => {});
            }

            stopStream(); // Aseguramos que el proceso no quede colgado
            console.log("🔄 Reiniciando sistema en 1 minuto...");
            await new Promise(r => setTimeout(r, 60000));
        }
    }
}