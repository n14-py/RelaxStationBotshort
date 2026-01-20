const { spawn } = require('child_process');

let ffmpegProcess = null;

/**
 * Inicia la transmisión leyendo la imagen desde la URL de BunnyCDN
 * @param {string} imageUrl - URL pública de la imagen (ej: https://tu-zona.b-cdn.net/...)
 * @param {string} audioUrl - URL de tu radio
 * @param {string} rtmpUrl - Clave de YouTube
 * @param {number} durationHours - Duración del evento
 */
function startStream(imageUrl, audioUrl, rtmpUrl, durationHours = 12) {
    return new Promise((resolve, reject) => {
        // Limpieza de seguridad
        if (ffmpegProcess) {
            try { ffmpegProcess.kill(); } catch(e) {}
        }

        const durationSeconds = durationHours * 3600;
        console.log(`🚀 [FFmpeg] Iniciando stream desde la nube...`);
        console.log(`   🖼️ Imagen: ${imageUrl}`);

        const args = [
            '-hide_banner', '-loglevel', 'error',
            '-thread_queue_size', '128', // Optimizado para poca RAM
            
            // ENTRADA 1: IMAGEN (Desde URL HTTPS)
            '-loop', '1', 
            '-framerate', '1', 
            '-i', imageUrl, // <--- AQUÍ LEEMOS DIRECTO DE BUNNY

            // ENTRADA 2: AUDIO (Radio Online)
            '-i', audioUrl,

            // MAPEO
            '-map', '0:v:0', '-map', '1:a:0',

            // FILTROS (Texto de cuenta regresiva)
            '-vf', `scale=1280:720,setsar=1,drawtext=text='FIN\\: %{eif\\:(${durationSeconds}-t)/3600\\:d\\:2}\\:%{eif\\:(mod(${durationSeconds}-t,3600))/60\\:d\\:2}\\:%{eif\\:mod(${durationSeconds}-t,60)\\:d\\:2}':fontcolor=white:fontsize=30:x=w-tw-20:y=20:box=1:boxcolor=black@0.5:boxborderw=5,fps=1`,

            // CODECS
            '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'stillimage',
            '-r', '1', '-g', '2', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '96k', '-ar', '44100',
            
            // DURACIÓN EXACTA
            '-t', `${durationSeconds}`,
            
            // SALIDA
            '-f', 'flv', rtmpUrl
        ];

        ffmpegProcess = spawn('ffmpeg', args);

        // Monitoreo
        ffmpegProcess.stderr.on('data', (data) => {
            const msg = data.toString();
            // Ignorar ruido, mostrar solo errores graves
            if (msg.includes('Error') || msg.includes('fail') || msg.includes('Invalid')) {
                console.error(`🔴 [FFmpeg Warning]: ${msg.trim()}`);
            }
        });

        ffmpegProcess.on('close', (code) => {
            console.log(`🏁 [FFmpeg] Transmisión finalizada (Código: ${code}).`);
            ffmpegProcess = null;
            resolve();
        });

        ffmpegProcess.on('error', (err) => {
            console.error("❌ [FFmpeg Error]:", err);
            reject(err);
        });

        // Keep-Alive para Render (log cada minuto para que no piense que se colgó)
        const keepAlive = setInterval(() => {
            if (ffmpegProcess) console.log(`   📡 Transmitiendo... (Quedan ${(durationSeconds/3600).toFixed(1)}h)`);
            else clearInterval(keepAlive);
        }, 60000); 
    });
}

function stopStream() {
    if (ffmpegProcess) {
        ffmpegProcess.kill('SIGINT');
        ffmpegProcess = null;
    }
}

module.exports = { startStream, stopStream };