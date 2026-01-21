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

// URL DE RESPALDO (Por si la variable de entorno falla)
const FALLBACK_PLAYLIST_URL = "https://lfaftechapi-7nrb.onrender.com/api/relax/playlist.txt";

/**
 * 1. Obtiene una canción aleatoria de la playlist FFConcat
 */
async function getRandomTrack(playlistUrl) {
    // Si la URL viene vacía del .env, usamos la de respaldo
    const targetUrl = playlistUrl || FALLBACK_PLAYLIST_URL;
    console.log(`🎵 Buscando música en: ${targetUrl}`);
    
    try {
        const res = await axios.get(targetUrl);
        const data = res.data;
        
        // Parseamos el formato FFConcat para extraer las URLs
        // Buscamos líneas que tengan: file 'https://...'
        const urls = [];
        const lines = data.split('\n');
        
        for (let line of lines) {
            line = line.trim();
            if (line.startsWith('file') && line.includes("'")) {
                const match = line.match(/'([^']+)'/); // Extrae lo que está entre comillas simples
                if (match && match[1]) {
                    urls.push(match[1]);
                }
            }
        }

        if (urls.length === 0) {
            throw new Error("No se encontraron canciones válidas en la playlist.");
        }

        // Elegimos una al azar
        const randomUrl = urls[Math.floor(Math.random() * urls.length)];
        
        // Limpiamos el nombre del archivo (quitamos query params si los tiene)
        const fileName = path.basename(randomUrl).split('?')[0]; 
        const localPath = path.join(DOWNLOAD_DIR, fileName);

        // Si ya existe en caché y tiene contenido, la usamos
        if (fs.existsSync(localPath)) {
            const stats = fs.statSync(localPath);
            if (stats.size > 0) {
                console.log(`   💿 Canción encontrada en caché: ${fileName}`);
                return localPath;
            }
        }

        // Si no, la descargamos
        console.log(`   ⬇️ Descargando canción nueva: ${fileName}...`);
        const response = await axios({
            method: 'get',
            url: randomUrl,
            responseType: 'stream',
            timeout: 60000 // 60 segundos de timeout
        });

        const writer = fs.createWriteStream(localPath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                resolve(localPath);
            });
            writer.on('error', (err) => {
                console.error("Error escribiendo archivo de audio:", err);
                reject(err);
            });
        });

    } catch (error) {
        console.error("❌ Error consiguiendo música:", error.message);
        throw error;
    }
}

/**
 * 2. Renderiza el video final (MP4) en 1080x1920 FHD
 */
async function renderShortVideo(imagePath, playlistUrl, durationSeconds = 58) {
    return new Promise(async (resolve, reject) => {
        let ffmpegProcess = null;

        try {
            // Conseguimos el audio
            const audioPath = await getRandomTrack(playlistUrl || FALLBACK_PLAYLIST_URL);
            
            // Nombre del archivo final
            const outputFileName = `short_${Date.now()}.mp4`;
            const outputPath = path.join(OUTPUT_DIR, outputFileName);

            console.log(`🎬 [FFmpeg] Renderizando video FHD de ${durationSeconds}s...`);

            // Configuración de fuente para el contador
            const fontPath = path.join(ASSETS_DIR, 'font.ttf');
            let fontOption = "";
            if (fs.existsSync(fontPath)) {
                // Escapamos rutas para que FFmpeg no falle
                const cleanFont = fontPath.replace(/\\/g, '/').replace(':', '\\:');
                fontOption = `fontfile='${cleanFont}':`;
            }

            // CONTADOR REGRESIVO (MM:SS)
            // Ajustado para FHD: Fuente más grande (70) y posición Y=200
            const countdownExpr = `%{eif\\:(${durationSeconds}-t)/60\\:d\\:1}\\:%{eif\\:mod(${durationSeconds}-t,60)\\:d\\:2}`;
            const drawText = `drawtext=${fontOption}text='${countdownExpr}':fontcolor=white:fontsize=70:x=(w-tw)/2:y=200:box=1:boxcolor=black@0.5:boxborderw=15`;

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
                // 1. Escalar a 1080:1920 (Full HD Vertical)
                // 2. Dibujar texto del contador
                // 3. Forzar 30 FPS para fluidez en móvil
                '-vf', `scale=1080:1920,setsar=1,${drawText},fps=30`,

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

            // Logs de error FFmpeg (Filtrando spam)
            ffmpegProcess.stderr.on('data', (data) => {
                const msg = data.toString();
                if (msg.includes('Error') && !msg.includes('verry common')) {
                    console.log(`⚠️ [FFmpeg]: ${msg.trim()}`);
                }
            });

            ffmpegProcess.on('close', (code) => {
                if (code === 0) {
                    console.log(`✨ Video Renderizado Correctamente: ${outputFileName}`);
                    resolve(outputPath);
                } else {
                    reject(new Error(`FFmpeg falló con código ${code}`));
                }
            });

        } catch (error) {
            console.error("❌ Error en el motor de video:", error.message);
            reject(error);
        }
    });
}

/**
 * Limpia archivos temporales para no llenar el disco
 */
function cleanupFiles(filePath) {
    if (filePath && fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) console.error(`Error borrando archivo ${filePath}:`, err);
        });
    }
}

module.exports = { renderShortVideo, cleanupFiles };