const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let ffmpegProcess = null;

/**
 * Inicia el stream y DEVUELVE UNA PROMESA QUE SOLO SE CUMPLE CUANDO EL STREAM TERMINA.
 * Esto bloquea el código para que no se creen bucles infinitos.
 */
function startStream(imagePath, audioUrl, rtmpUrl, durationHours = 12) {
    return new Promise((resolve, reject) => {
        // 1. Limpieza de procesos anteriores (por seguridad)
        if (ffmpegProcess) {
            try { ffmpegProcess.kill(); } catch(e) {}
        }

        console.log(`🚀 [FFmpeg] Iniciando motor. Duración programada: ${durationHours} horas.`);

        // --- PREPARACIÓN DE RECURSOS ---
        const durationSeconds = durationHours * 3600;
        const fontPath = path.join(__dirname, '../assets/font.ttf');
        let fontOption = "";
        
        // Ajuste de fuente para Windows/Linux
        if (fs.existsSync(fontPath)) {
            const cleanFontPath = fontPath.replace(/\\/g, '/').replace(':', '\\:'); 
            fontOption = `fontfile='${cleanFontPath}':`;
        }

        // --- FILTRO DEL CONTADOR ---
        const countdownExpression = 
            `%{eif\\:(${durationSeconds}-t)/3600\\:d\\:2}\\:%{eif\\:(mod(${durationSeconds}-t,3600))/60\\:d\\:2}\\:%{eif\\:mod(${durationSeconds}-t,60)\\:d\\:2}`;

        const drawTextFilter = `drawtext=${fontOption}text='TIEMPO RESTANTE\\: ${countdownExpression}':fontcolor=white:fontsize=35:x=w-tw-30:y=30:box=1:boxcolor=black@0.6:boxborderw=10`;

        const args = [
            '-hide_banner', '-loglevel', 'error',
            '-thread_queue_size', '2048',
            '-loop', '1', '-framerate', '1', '-i', imagePath,
            '-i', audioUrl,
            '-map', '0:v:0', '-map', '1:a:0',
            '-vf', `scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,${drawTextFilter},fps=1`,
            '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'stillimage',
            '-r', '1', '-g', '2', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
            '-t', `${durationSeconds}`, // <--- ESTO OBLIGA A FFMPEG A CERRARSE A LAS 12H EXACTAS
            '-f', 'flv', rtmpUrl
        ];

        // 2. Arrancar el proceso
        ffmpegProcess = spawn('ffmpeg', args);

        // 3. Monitoreo Básico
        ffmpegProcess.stderr.on('data', (data) => {
            const msg = data.toString();
            if (!msg.includes('frame=') && !msg.includes('fps=') && !msg.includes('size=')) {
                // Solo logueamos errores reales para no ensuciar la consola
                if (msg.toLowerCase().includes('error') || msg.toLowerCase().includes('fail')) {
                    console.error(`🔴 [FFmpeg Error]: ${msg.trim()}`);
                }
            }
        });

        // 4. EL MOMENTO CLAVE: Solo resolvemos la promesa cuando se cierra
        ffmpegProcess.on('close', (code) => {
            console.log(`🏁 [FFmpeg] El stream ha terminado (Código: ${code}).`);
            ffmpegProcess = null;
            resolve(); // <--- AQUÍ ES DONDE LE DECIMOS AL INDEX.JS "YA PUEDES SEGUIR"
        });

        ffmpegProcess.on('error', (err) => {
            console.error("❌ [FFmpeg] Error crítico al iniciar:", err);
            reject(err);
        });
    });
}

function stopStream() {
    if (ffmpegProcess) {
        console.log("🛑 Forzando detención del stream...");
        ffmpegProcess.kill('SIGINT');
    }
}

module.exports = { startStream, stopStream };