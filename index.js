require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const moment = require('moment');

// --- IMPORTACIÓN DE MÓDULOS ---
const { generateShortData } = require('./utils/aiGenerator');
const { renderShortVideo, cleanupFiles } = require('./utils/videoEngine');
const { uploadToBunny } = require('./utils/bunnyHandler');
const { uploadToYouTube } = require('./utils/youtubeUploader');
const Short = require('./models/Short');

// --- CONFIGURACIÓN DE LA FÁBRICA ---
const PORT = process.env.PORT || 8080;
const PLAYLIST_URL = process.env.PLAYLIST_URL;
const SHORT_DURATION = parseInt(process.env.SHORT_DURATION) || 58;

// Configuración de Tiempos (Tu Estrategia 5x5)
const BATCH_SIZE = 5;          // Cuántos videos hacer seguidos
const BATCH_COOLDOWN_HOURS = 5; // Horas de descanso después del lote
const SAFETY_DELAY_MINUTES = 2; // Minutos de espera entre video y video del mismo lote (Anti-Spam)

// Variables de Estado (Para ver en la web)
let factoryStatus = "INICIANDO SISTEMA...";
let currentBatchCount = 0;
let lastVideoUrl = "Ninguno todavía";
let nextBatchTime = null;

// --- SERVIDOR WEB (DASHBOARD) ---
const app = express();

app.get('/', (req, res) => {
    res.send(`
        <div style="font-family: sans-serif; text-align: center; padding: 40px; background: #121212; color: #e0e0e0;">
            <h1 style="color: #bb86fc;">🏭 Fábrica de Shorts - Relax Station</h1>
            <div style="border: 1px solid #333; padding: 30px; border-radius: 15px; background: #1e1e1e; max-width: 600px; margin: 0 auto;">
                <p style="font-size: 1.2em;"><strong>Estado Actual:</strong> <span style="color: #03dac6;">${factoryStatus}</span></p>
                <hr style="border-color: #333;">
                <p><strong>Progreso del Lote:</strong> ${currentBatchCount} / ${BATCH_SIZE}</p>
                <p><strong>Siguiente Lote Grande:</strong> ${nextBatchTime ? moment(nextBatchTime).fromNow() : 'En proceso...'}</p>
                <p><strong>Último Video Generado:</strong> <br>
                <a href="${lastVideoUrl}" target="_blank" style="color: #bb86fc; text-decoration: none;">Ver en Bunny.net</a></p>
            </div>
            <p style="font-size: 0.8em; margin-top: 20px; color: #666;">Actualiza para refrescar estado.</p>
        </div>
    `);
});

// --- CONEXIÓN Y ARRANQUE ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ Conectado a MongoDB (Colección Shorts)");
        app.listen(PORT, () => {
            console.log(`🌐 Dashboard activo en puerto ${PORT}`);
            startBatchProduction(); // ¡Arranca la fábrica!
        });
    })
    .catch(err => console.error("❌ Error Fatal MongoDB:", err));


/**
 * 🏭 LÍNEA DE PRODUCCIÓN POR LOTES
 * Estrategia: 5 Videos -> Descanso 5 Horas -> Repetir
 */
async function startBatchProduction() {
    console.log(`\n🚀 FÁBRICA INICIADA: Estrategia ${BATCH_SIZE} videos cada ${BATCH_COOLDOWN_HOURS} horas.`);

    while (true) {
        // --- INICIO DEL LOTE DE 5 VIDEOS ---
        console.log(`\n📦 INICIANDO NUEVO LOTE DE ${BATCH_SIZE} VIDEOS...`);
        currentBatchCount = 0;

        for (let i = 1; i <= BATCH_SIZE; i++) {
            currentBatchCount = i;
            let tempImagePath = null;
            let tempVideoPath = null;

            try {
                console.log(`\n🎬 [VIDEO ${i}/${BATCH_SIZE}] Produciendo Short...`);
                
                // 1. GENERAR ARTE Y TEXTO
                factoryStatus = `Lote ${i}/${BATCH_SIZE}: 🧠 Generando Idea...`;
                const aiData = await generateShortData();
                tempImagePath = aiData.localImagePath;
                console.log(`   📝 Título: "${aiData.title}"`);

                // 2. RENDERIZAR VIDEO (FHD)
                factoryStatus = `Lote ${i}/${BATCH_SIZE}: ⚙️ Renderizando Video...`;
                tempVideoPath = await renderShortVideo(
                    tempImagePath, 
                    PLAYLIST_URL, 
                    SHORT_DURATION
                );

                // 3. SUBIR A YOUTUBE (Prioridad)
                factoryStatus = `Lote ${i}/${BATCH_SIZE}: 🚀 Subiendo a YouTube...`;
                let youtubeId = null;
                try {
                    youtubeId = await uploadToYouTube(tempVideoPath, aiData.title, aiData.description);
                    console.log(`   🔴 Publicado en YouTube! ID: ${youtubeId}`);
                } catch (ytError) {
                    console.error("   ⚠️ Error subiendo a YouTube (Continuando...):", ytError.message);
                }

                // 4. SUBIR A BUNNY (Backup)
                factoryStatus = `Lote ${i}/${BATCH_SIZE}: ☁️ Guardando Backup...`;
                const uploadData = await uploadToBunny(tempVideoPath, `short_batch_${Date.now()}.mp4`);
                lastVideoUrl = uploadData.url;

                // 5. GUARDAR REGISTRO DB
                const newShort = new Short({
                    title: aiData.title,
                    description: aiData.description,
                    video_url: uploadData.url,
                    bunny_storage_path: uploadData.storagePath,
                    youtube_id: youtubeId,
                    status: youtubeId ? 'UPLOADED' : 'GENERATED_ONLY'
                });
                await newShort.save();

                // 6. LIMPIEZA DE ARCHIVOS
                cleanupFiles(tempImagePath);
                cleanupFiles(tempVideoPath);

                console.log(`   ✅ Video ${i} completado exitosamente.`);

                // SI NO ES EL ÚLTIMO, ESPERAMOS UNOS MINUTOS (ANTI-SPAM)
                if (i < BATCH_SIZE) {
                    factoryStatus = `Descanso técnico (${SAFETY_DELAY_MINUTES} min) entre videos...`;
                    console.log(`⏳ Esperando ${SAFETY_DELAY_MINUTES} minutos antes del siguiente video...`);
                    await new Promise(r => setTimeout(r, SAFETY_DELAY_MINUTES * 60 * 1000));
                }

            } catch (error) {
                console.error(`❌ Falló el video ${i}:`, error.message);
                factoryStatus = "⚠️ Error recuperable, intentando siguiente...";
                // Limpieza de emergencia
                cleanupFiles(tempImagePath);
                cleanupFiles(tempVideoPath);
                // Esperamos 1 minuto y seguimos con el siguiente del lote
                await new Promise(r => setTimeout(r, 60000));
            }
        }

        // --- FIN DEL LOTE: A DORMIR 5 HORAS ---
        const sleepMs = BATCH_COOLDOWN_HOURS * 60 * 60 * 1000;
        nextBatchTime = Date.now() + sleepMs;
        
        console.log(`\n💤 LOTE TERMINADO. Durmiendo ${BATCH_COOLDOWN_HOURS} horas...`);
        factoryStatus = `💤 Durmiendo hasta: ${moment(nextBatchTime).format('HH:mm')}`;
        
        await new Promise(resolve => setTimeout(resolve, sleepMs));
    }
}