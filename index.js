require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const moment = require('moment');

// Módulos
const { generateShortData } = require('./utils/aiGenerator');
const { renderShortVideo, cleanupFiles } = require('./utils/videoEngine');
const { uploadToBunny } = require('./utils/bunnyHandler');
const { uploadToYouTube } = require('./utils/youtubeUploader'); // <--- NUEVO
const Short = require('./models/Short');

// Configuración
const PORT = process.env.PORT || 8080;
const MAX_SHORTS = parseInt(process.env.MAX_SHORTS_PER_DAY) || 20;
const SHORT_DURATION = parseInt(process.env.SHORT_DURATION) || 58;
const PLAYLIST_URL = process.env.PLAYLIST_URL;

const INTERVAL_MS = (24 * 60 * 60 * 1000) / MAX_SHORTS;

// Estado
let factoryStatus = "INICIANDO SISTEMA...";
let lastVideoUrl = "Ninguno todavía";
let lastYoutubeId = "Pendiente";
let nextRunTime = null;

const app = express();
app.get('/', (req, res) => {
    res.send(`
        <div style="font-family: sans-serif; text-align: center; padding: 40px; background: #1a1a1a; color: white;">
            <h1>🏭 Fábrica de Shorts - Relax Station</h1>
            <div style="border: 1px solid #333; padding: 20px; border-radius: 10px; background: #222;">
                <p><strong>Estado:</strong> ${factoryStatus}</p>
                <p><strong>Meta:</strong> ${MAX_SHORTS} videos/día</p>
                <p><strong>Siguiente:</strong> ${nextRunTime ? moment(nextRunTime).fromNow() : 'Calculando...'}</p>
                <p><strong>Último Video (Bunny):</strong> <a href="${lastVideoUrl}" target="_blank" style="color: #4CAF50;">Ver Video</a></p>
                <p><strong>Último YouTube ID:</strong> <span style="color: #f00;">${lastYoutubeId}</span></p>
            </div>
        </div>
    `);
});

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ Conectado a MongoDB");
        app.listen(PORT, () => {
            console.log(`🌐 Servidor Web activo`);
            startProductionLine();
        });
    })
    .catch(err => console.error("❌ Error MongoDB:", err));

async function startProductionLine() {
    console.log(`\n🚀 FÁBRICA INICIADA: ${MAX_SHORTS} videos al día.`);

    while (true) {
        let tempImagePath = null;
        let tempVideoPath = null;

        try {
            console.log("\n" + "=".repeat(50));
            console.log(`🎬 PRODUCIENDO SHORT: ${moment().format('HH:mm:ss')}`);
            console.log("=".repeat(50));

            // 1. IA (Idea + Imagen)
            factoryStatus = "🧠 Creando concepto...";
            const aiData = await generateShortData();
            tempImagePath = aiData.localImagePath;

            // 2. VIDEO (FFmpeg)
            factoryStatus = "⚙️ Renderizando MP4...";
            tempVideoPath = await renderShortVideo(tempImagePath, PLAYLIST_URL, SHORT_DURATION);

            // 3. SUBIR A YOUTUBE (Prioridad)
            factoryStatus = "🚀 Subiendo a YouTube...";
            let youtubeId = null;
            try {
                youtubeId = await uploadToYouTube(tempVideoPath, aiData.title, aiData.description);
                lastYoutubeId = youtubeId;
                console.log(`   🔴 Publicado en YouTube: https://youtu.be/${youtubeId}`);
            } catch (ytError) {
                console.error("   ⚠️ Falló subida a YouTube (Se guardará solo en Bunny):", ytError.message);
            }

            // 4. SUBIR A BUNNY (Backup para TikTok)
            factoryStatus = "☁️ Guardando backup en Bunny...";
            const uploadData = await uploadToBunny(tempVideoPath, `short_${Date.now()}.mp4`);
            lastVideoUrl = uploadData.url;

            // 5. REGISTRAR EN DB
            const newShort = new Short({
                title: aiData.title,
                description: aiData.description,
                video_url: uploadData.url,
                bunny_storage_path: uploadData.storagePath,
                youtube_id: youtubeId,
                status: youtubeId ? 'UPLOADED_YOUTUBE' : 'GENERATED_ONLY'
            });
            await newShort.save();

            // 6. LIMPIEZA
            cleanupFiles(tempImagePath);
            cleanupFiles(tempVideoPath);

            // 7. DORMIR
            nextRunTime = Date.now() + INTERVAL_MS;
            factoryStatus = "💤 Esperando siguiente turno...";
            const minutesToWait = INTERVAL_MS / 60000;
            console.log(`⏳ Durmiendo ${minutesToWait.toFixed(1)} minutos...`);
            await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));

        } catch (error) {
            console.error("❌ ERROR GENERAL:", error.message);
            factoryStatus = "⚠️ Error - Reintentando en 5 min...";
            if (tempImagePath) cleanupFiles(tempImagePath);
            if (tempVideoPath) cleanupFiles(tempVideoPath);
            await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
        }
    }
}