require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const moment = require('moment');

// --- IMPORTAMOS NUESTROS MÓDULOS NUEVOS ---
const { prepareNextStream } = require('./utils/aiGenerator');
const { createYoutubeBroadcast } = require('./utils/youtubeManager');
const { startStream, stopStream } = require('./utils/streamer');
const Stream = require('./models/Stream'); // Para actualizar estado final

const PORT = process.env.PORT || 8080;
const CYCLE_DURATION_HOURS = 12;

// --- SERVIDOR WEB (Health Check para Render) ---
const app = express();
let botState = "INICIANDO";

app.get('/', (req, res) => {
    res.send(`
        <h1>🤖 Relax Station Bot V5 (Cloud Edition)</h1>
        <p>Estado: <strong>${botState}</strong></p>
        <p>Hora Servidor: ${moment().format('HH:mm:ss')}</p>
    `);
});

// --- INICIO DEL SISTEMA ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ Conectado a MongoDB Atlas");
        
        app.listen(PORT, () => {
            console.log(`🌐 Servidor Web listo en puerto ${PORT}`);
            // Arrancamos el bucle principal
            mainLoop();
        });
    })
    .catch(err => console.error("❌ Error conectando a MongoDB:", err));


/**
 * BUCLE PRINCIPAL INFINITO
 * Sigue la lógica: BD -> YouTube -> Transmisión -> Fin -> Repetir
 */
async function mainLoop() {
    console.log("\n🚀 INICIANDO SISTEMA DE STREAMING AUTOMÁTICO");

    while (true) { // Bucle infinito seguro
        let currentStreamDoc = null;

        try {
            console.log("\n=================================================");
            console.log(`🎬 NUEVO CICLO - ${moment().format('HH:mm:ss')}`);
            console.log("=================================================");

            // ---------------------------------------------------------
            // PASO 1: PREPARACIÓN (IA + BUNNY + MONGO)
            // ---------------------------------------------------------
            botState = "GENERANDO CONTENIDO";
            console.log("🧠 [1/3] Generando contenido y subiendo a la nube...");
            
            // Reintentos automáticos si falla la IA
            for (let i = 0; i < 3; i++) {
                try {
                    currentStreamDoc = await prepareNextStream();
                    break; // Éxito, salimos del for
                } catch (e) {
                    console.warn(`⚠️ Intento ${i+1} fallido. Reintentando en 10s...`);
                    await new Promise(r => setTimeout(r, 10000));
                }
            }

            if (!currentStreamDoc) throw new Error("Fallo total generando contenido IA.");


            // ---------------------------------------------------------
            // PASO 2: CONFIGURACIÓN YOUTUBE
            // ---------------------------------------------------------
            botState = "CONFIGURANDO YOUTUBE";
            console.log("📡 [2/3] Creando evento en YouTube...");
            
            // Usamos el documento de la BD que ya tiene todo listo
            currentStreamDoc = await createYoutubeBroadcast(currentStreamDoc);


            // ---------------------------------------------------------
            // PASO 3: TRANSMISIÓN (DESDE LA NUBE)
            // ---------------------------------------------------------
            botState = "EN VIVO 🔴";
            console.log(`🚀 [3/3] Iniciando Transmisión de ${CYCLE_DURATION_HOURS} Horas...`);
            
            // Actualizamos estado en BD
            currentStreamDoc.status = 'LIVE';
            currentStreamDoc.startedAt = new Date();
            await currentStreamDoc.save();

            const audioUrl = process.env.AUDIO_SOURCE_URL;
            
            // AQUI LA MAGIA: Le pasamos la URL de Bunny (currentStreamDoc.bunny_image_url)
            // El código se quedará "congelado" aquí 12 horas hasta que FFmpeg termine.
            await startStream(
                currentStreamDoc.bunny_image_url, 
                audioUrl, 
                currentStreamDoc.youtube_rtmp_url, 
                CYCLE_DURATION_HOURS
            );

            console.log("🏁 Transmisión finalizada correctamente.");
            
            // Marcar como finalizado en BD
            currentStreamDoc.status = 'FINISHED';
            currentStreamDoc.finishedAt = new Date();
            await currentStreamDoc.save();


            // ---------------------------------------------------------
            // DESCANSO
            // ---------------------------------------------------------
            botState = "DESCANSANDO";
            console.log("💤 Esperando 1 minuto antes del siguiente ciclo...");
            await new Promise(r => setTimeout(r, 60000));

        } catch (error) {
            console.error("\n❌ ERROR CRÍTICO EN EL BUCLE:", error);
            botState = "ERROR - REINTENTANDO";
            
            // Si teníamos un stream activo y falló, marcamos error en BD
            if (currentStreamDoc) {
                currentStreamDoc.status = 'ERROR';
                await currentStreamDoc.save().catch(() => {});
            }

            console.log("🔄 Reiniciando sistema en 2 minutos...");
            stopStream(); // Asegurar que FFmpeg muera
            await new Promise(r => setTimeout(r, 120000));
        }
    }
}