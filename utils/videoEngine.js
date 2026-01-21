const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

// Directorios de trabajo
const DOWNLOAD_DIR = path.join(__dirname, '../downloads');
const OUTPUT_DIR = path.join(__dirname, '../output_shorts');
const ASSETS_DIR = path.join(__dirname, '../assets');

// Aseguramos que existan las carpetas
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

/**
 * 1. Obtiene una canción aleatoria de la playlist FFConcat
 */
async function getRandomTrack(playlistUrl) {
    console.log("🎵 Buscando canción aleatoria...");
    
    try {
        const res = await axios.get(playlistUrl);
        const data = res.data;
        
        // Parseamos el formato FFConcat para sacar las URLs limpias
        const urls = [];
        const lines = data.split('\n');
        
        for (let line of lines) {
            // Buscamos líneas que tengan 'file' y una URL 'http'
            if (line.includes('file') && line.includes('http')) {
                const match = line.match(/'([^']+)'/); // Extrae lo que está entre comillas simples
                if (match && match[1]) {
                    urls.push(match[1]);
                }
            }
        }

        if (urls.length === 0) throw new Error("La playlist no tiene canciones válidas.");

        // Elegimos una al azar
        const randomUrl = urls[Math.floor(Math.random() * urls.length)];
        
        // Nombre de archivo limpio
        const fileName = path.basename(randomUrl).split('?')[0]; 
        const localPath = path.join(DOWNLOAD_DIR, fileName);

        // Si ya existe, la usamos (Ahorra internet y tiempo)
        if (fs.existsSync(localPath)) {
            console.log(`✅ Canción encontrada en caché: ${fileName}`);
            return localPath;
        }

        // Si no, la descargamos
        console.log(`⬇️ Descargando canción nueva: ${fileName}...`);
        const response = await axios({
            method: 'get',
            url: randomUrl,
            responseType: 'stream',
            timeout: 30000
        });

        const writer = fs.createWriteStream(localPath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                console.log("✅ Descarga completa.");
                resolve(localPath);
            });
            writer.on('error', reject);
        });

    } catch (error) {
        console.error("❌ Error consiguiendo música:", error.message);
        throw error;
    }
}

/**
 * 2. Renderiza el video final (MP4) con FFmpeg
 */
async function renderShortVideo(imagePath, playlistUrl, durationSeconds = 58) {
    return new Promise(async (resolve, reject) => {
        let ffmpegProcess = null;

        try {
            // Conseguimos el audio
            const audioPath = await getRandomTrack(playlistUrl);
            
            // Nombre del archivo final
            const outputFileName = `short_${Date.now()}.mp4`;
            const outputPath = path.join(OUTPUT_DIR, outputFileName);

            console.log(`🎬 [FFmpeg] Renderizando video de ${durationSeconds}s...`);

            // Configuración de fuente para el contador
            const fontPath = path.join(ASSETS_DIR, 'font.ttf');
            let fontOption = "";
            if (fs.existsSync(fontPath)) {
                // Escapamos rutas para que FFmpeg no falle en Windows/Linux
                const cleanFont = fontPath.replace(/\\/g, '/').replace(':', '\\:');
                fontOption = `fontfile='${cleanFont}':`;
            }

            // CONTADOR REGRESIVO (MM:SS)
            // Centrado horizontalmente, y=150 (arriba, bajo la zona segura)
            const countdownExpr = `%{eif\\:(${durationSeconds}-t)/60\\:d\\:1}\\:%{eif\\:mod(${durationSeconds}-t,60)\\:d\\:2}`;
            const drawText = `drawtext=${fontOption}text='${countdownExpr}':fontcolor=white:fontsize=50:x=(w-tw)/2:y=150:box=1:boxcolor=black@0.5:boxborderw=10`;

            const args = [
                '-hide_banner', '-loglevel', 'error',
                
                // INPUT 0: Imagen (Bucle infinito)
                '-loop', '1', 
                '-i', imagePath,

                // INPUT 1: Audio (Desde el inicio)
                '-i', audioPath,

                // MAPEO
                '-map', '0:v:0', 
                '-map', '1:a:0',

                // FILTROS DE VIDEO
                // 1. Escalar a 720x1280 (HD Vertical)
                // 2. Dibujar texto del contador
                // 3. Forzar 30 FPS para fluidez en móvil
                '-vf', `scale=720:1280,setsar=1,${drawText},fps=30`,

                // CONFIGURACIÓN DE VIDEO (H.264)
                '-c:v', 'libx264',
                '-preset', 'ultrafast', // Rápido para no gastar mucha CPU
                '-crf', '23',           // Calidad visual buena
                '-pix_fmt', 'yuv420p',  // Compatible con todos los móviles/TikTok

                // CONFIGURACIÓN DE AUDIO
                '-c:a', 'aac',
                '-b:a', '128k',
                '-ac', '2', // Estéreo
                '-ar', '44100',

                // DURACIÓN Y CORTE
                '-t', `${durationSeconds}`, // Duración exacta
                '-shortest', // Cortar si el audio o video acaban antes (seguridad)
                
                '-y', // Sobrescribir si existe
                outputPath
            ];

            ffmpegProcess = spawn('ffmpeg', args);

            // Logs de error FFmpeg
            ffmpegProcess.stderr.on('data', (data) => {
                const msg = data.toString();
                // Ignoramos info normal, mostramos warnings
                if (msg.includes('Error') || msg.includes('Invalid')) {
                    console.log(`⚠️ [FFmpeg]: ${msg.trim()}`);
                }
            });

            ffmpegProcess.on('close', (code) => {
                if (code === 0) {
                    console.log(`✨ ¡Video Renderizado! Guardado en: ${outputFileName}`);
                    resolve(outputPath);
                } else {
                    reject(new Error(`FFmpeg falló con código ${code}`));
                }
            });

        } catch (error) {
            console.error("❌ Error en el motor de video:", error);
            reject(error);
        }
    });
}

/**
 * Limpia archivos temporales para no llenar el disco
 */
function cleanupFiles(filePath) {
    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) console.error("Error borrando temp:", err);
            else console.log("🧹 Archivo temporal eliminado.");
        });
    }
}

module.exports = { renderShortVideo, cleanupFiles };