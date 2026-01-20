const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

let ffmpegProcess = null;
const MUSIC_DIR = path.join(__dirname, '../downloads');

if (!fs.existsSync(MUSIC_DIR)) {
    fs.mkdirSync(MUSIC_DIR, { recursive: true });
}

/**
 * Descarga el archivo de audio si no existe localmente
 */
async function downloadIfNeeded(url) {
    try {
        // Extraemos el nombre real del archivo desde la URL de Cloudinary
        const fileName = path.basename(url);
        const localPath = path.join(MUSIC_DIR, fileName);

        if (fs.existsSync(localPath)) {
            return localPath;
        }

        console.log(`📥 Descargando de Cloudinary: ${fileName}...`);
        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream',
            timeout: 60000 
        });

        const writer = fs.createWriteStream(localPath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(localPath));
            writer.on('error', reject);
        });
    } catch (e) {
        console.error(`⚠️ Error en descarga: ${url}`, e.message);
        return null;
    }
}

/**
 * Procesa el archivo FFConcat para extraer las URLs de los audios
 */
function parseFFConcat(data) {
    const urls = [];
    const lines = data.split('\n');
    
    for (let line of lines) {
        line = line.trim();
        // Buscamos líneas que empiecen con file y extraemos lo que hay entre comillas
        if (line.startsWith('file')) {
            const match = line.match(/'([^']+)'/);
            if (match && match[1]) {
                urls.push(match[1]);
            }
        }
    }
    return urls;
}

async function startStream(imageUrl, playlistUrl, rtmpUrl, durationHours = 12) {
    return new Promise(async (resolve, reject) => {
        try {
            console.log("📄 Leyendo estructura FFConcat...");
            const plRes = await axios.get(playlistUrl);
            
            // Extraemos solo las URLs de los archivos .m4a
            const remoteUrls = parseFFConcat(plRes.data);
            
            if (remoteUrls.length === 0) {
                throw new Error("No se encontraron archivos de audio en el FFConcat.");
            }

            console.log(`🎵 Encontrados ${remoteUrls.length} tracks. Verificando caché local...`);

            const localTracks = [];
            for (const url of remoteUrls) {
                const trackPath = await downloadIfNeeded(url);
                if (trackPath) {
                    localTracks.push(trackPath);
                }
            }

            if (localTracks.length === 0) throw new Error("Cero archivos descargados.");

            // Creamos el nuevo archivo concat para uso LOCAL
            const listFilePath = path.join(MUSIC_DIR, 'local_playlist.txt');
            let listContent = "ffconcat version 1.0\n";
            
            // Repetimos la lista para cubrir las 12 horas (aprox 10 repeticiones)
            for(let i=0; i<10; i++) {
                localTracks.forEach(track => {
                    const escapedPath = track.replace(/\\/g, '/').replace(/'/g, "'\\''");
                    listContent += `file '${escapedPath}'\n`;
                    // No hace falta poner duration aquí, FFmpeg lo detecta del archivo local
                });
            }
            fs.writeFileSync(listFilePath, listContent);

            if (ffmpegProcess) ffmpegProcess.kill();

            const durationSeconds = durationHours * 3600;
            const fontPath = path.join(__dirname, '../assets/font.ttf');
            let fontOption = "";
            if (fs.existsSync(fontPath)) {
                const cleanFontPath = fontPath.replace(/\\/g, '/').replace(':', '\\:'); 
                fontOption = `fontfile='${cleanFontPath}':`;
            }

            const countdown = `%{eif\\:(${durationSeconds}-t)/3600\\:d\\:2}\\:%{eif\\:(mod(${durationSeconds}-t,3600))/60\\:d\\:2}\\:%{eif\\:mod(${durationSeconds}-t,60)\\:d\\:2}`;
            const drawText = `drawtext=${fontOption}text='${countdown}':fontcolor=white:fontsize=45:x=(w-tw)/2:y=50:box=1:boxcolor=black@0.4:boxborderw=10`;

            const args = [
                '-hide_banner', '-loglevel', 'error',
                '-loop', '1', '-framerate', '1', '-i', imageUrl,
                
                // Usamos el archivo local que acabamos de crear
                '-f', 'concat', '-safe', '0', '-re', '-i', listFilePath,

                '-map', '0:v:0', '-map', '1:a:0',
                '-vf', `scale=1280:720,setsar=1,${drawText},fps=1`,
                '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'stillimage',
                '-pix_fmt', 'yuv420p', '-r', '1', '-g', '2',
                
                // --- CALIDAD DE AUDIO AJUSTADA (96k para ahorro de recursos) ---
                '-c:a', 'aac', 
                '-b:a', '96k',       // Antes estaba en 128k
                '-ac', '2',          // Estéreo
                '-ar', '44100',      // Frecuencia estándar
                '-af', 'aresample=async=1',
                
                '-max_muxing_queue_size', '4096',
                '-t', `${durationSeconds}`,
                '-f', 'flv', rtmpUrl
            ];

            ffmpegProcess = spawn('ffmpeg', args);

            ffmpegProcess.stderr.on('data', (data) => {
                const msg = data.toString();
                if (msg.includes('Error')) console.error(`🔴 [FFmpeg]: ${msg.trim()}`);
            });

            ffmpegProcess.on('close', (code) => {
                console.log(`🏁 Ciclo FFmpeg terminado (Código: ${code}).`);
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
        try { ffmpegProcess.kill('SIGINT'); } catch(e) {}
        ffmpegProcess = null;
    }
}

module.exports = { startStream, stopStream };