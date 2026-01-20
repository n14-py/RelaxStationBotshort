const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

let ffmpegProcess = null;
const MUSIC_DIR = path.join(__dirname, '../downloads');

// Crear carpeta de descargas si no existe
if (!fs.existsSync(MUSIC_DIR)) {
    fs.mkdirSync(MUSIC_DIR, { recursive: true });
}

/**
 * Descarga una canción solo si no existe localmente
 */
async function downloadIfNeeded(url) {
    const fileName = path.basename(url);
    const localPath = path.join(MUSIC_DIR, fileName);

    if (fs.existsSync(localPath)) {
        return localPath;
    }

    console.log(`📥 Descargando: ${fileName}...`);
    const response = await axios({
        method: 'get',
        url: url,
        responseType: 'stream'
    });

    const writer = fs.createWriteStream(localPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(localPath));
        writer.on('error', reject);
    });
}

/**
 * TRANSMISIÓN POR PLAYLIST LOCAL
 */
async function startStream(imageUrl, playlistUrl, rtmpUrl, durationHours = 12) {
    return new Promise(async (resolve, reject) => {
        try {
            // 1. Obtener y descargar playlist
            console.log("📄 Obteniendo playlist...");
            const plRes = await axios.get(playlistUrl);
            const urls = plRes.data.split('\n').filter(line => line.trim().startsWith('http'));
            
            if (urls.length === 0) throw new Error("La playlist está vacía.");

            const localTracks = [];
            for (const url of urls) {
                const path = await downloadIfNeeded(url.trim());
                localTracks.push(path);
            }

            // 2. Crear archivo de lista para FFmpeg (concat demuxer)
            const listFilePath = path.join(MUSIC_DIR, 'current_playlist.txt');
            // Repetimos la lista para asegurar que cubra las 12 horas
            let listContent = "";
            for(let i=0; i<5; i++) { // Repetir 5 veces la lista completa
                localTracks.forEach(track => {
                    listContent += `file '${track.replace(/\\/g, '/')}'\n`;
                });
            }
            fs.writeFileSync(listFilePath, listContent);

            // 3. Iniciar FFmpeg
            if (ffmpegProcess) ffmpegProcess.kill();

            const durationSeconds = durationHours * 3600;
            const fontPath = path.join(__dirname, '../assets/font.ttf');
            let fontOption = fs.existsSync(fontPath) ? `fontfile='${fontPath.replace(/\\/g, '/').replace(':', '\\:')}':` : "";
            const countdown = `%{eif\\:(${durationSeconds}-t)/3600\\:d\\:2}\\:%{eif\\:(mod(${durationSeconds}-t,3600))/60\\:d\\:2}\\:%{eif\\:mod(${durationSeconds}-t,60)\\:d\\:2}`;
            const drawText = `drawtext=${fontOption}text='${countdown}':fontcolor=white:fontsize=45:x=(w-tw)/2:y=50:box=1:boxcolor=black@0.4:boxborderw=10`;

            const args = [
                '-hide_banner', '-loglevel', 'error',
                '-loop', '1', '-framerate', '1', '-i', imageUrl,
                
                // ENTRADA DE AUDIO: Usamos el concat demuxer para fluidez total
                '-f', 'concat', '-safe', '0', '-re', '-i', listFilePath,

                '-map', '0:v:0', '-map', '1:a:0',
                '-vf', `scale=1280:720,setsar=1,${drawText},fps=1`,
                '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'stillimage',
                '-pix_fmt', 'yuv420p', '-r', '1', '-g', '2',
                
                '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100',
                // Sincronización perfecta entre archivos
                '-af', 'aresample=async=1',
                
                '-max_muxing_queue_size', '1024',
                '-t', `${durationSeconds}`,
                '-f', 'flv', rtmpUrl
            ];

            ffmpegProcess = spawn('ffmpeg', args);

            ffmpegProcess.stderr.on('data', (data) => {
                const msg = data.toString();
                if (msg.includes('Error')) console.error(`🔴 [FFmpeg]: ${msg.trim()}`);
            });

            ffmpegProcess.on('close', (code) => {
                console.log(`🏁 Playlist finalizada (Código: ${code}).`);
                ffmpegProcess = null;
                resolve();
            });

        } catch (err) {
            console.error("❌ Error en Streamer:", err);
            reject(err);
        }
    });
}

function stopStream() {
    if (ffmpegProcess) {
        ffmpegProcess.kill('SIGINT');
        ffmpegProcess = null;
    }
}

module.exports = { startStream, stopStream };