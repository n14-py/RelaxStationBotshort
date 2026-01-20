const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let ffmpegProcess = null;

/**
 * Inicia la transmisión con un buffer de audio y reloj centrado arriba.
 */
function startStream(imageUrl, audioUrl, rtmpUrl, durationHours = 12) {
    return new Promise((resolve, reject) => {
        // 1. Limpieza de procesos anteriores
        if (ffmpegProcess) {
            try { ffmpegProcess.kill(); } catch(e) {}
        }

        const durationSeconds = durationHours * 3600;
        console.log(`🚀 [FFmpeg] Iniciando stream con Buffer de Audio...`);

        // 2. Configuración de Fuente (si existe assets/font.ttf)
        const fontPath = path.join(__dirname, '../assets/font.ttf');
        let fontOption = "";
        if (fs.existsSync(fontPath)) {
            // FFmpeg necesita rutas con barras normales y escapar los dos puntos en Windows
            const cleanFontPath = fontPath.replace(/\\/g, '/').replace(':', '\\:'); 
            fontOption = `fontfile='${cleanFontPath}':`;
        }

        // 3. RELOJ CENTRADO ARRIBA
        // Fórmula del tiempo: HH:MM:SS
        const countdownExpression = 
            `%{eif\\:(${durationSeconds}-t)/3600\\:d\\:2}\\:%{eif\\:(mod(${durationSeconds}-t,3600))/60\\:d\\:2}\\:%{eif\\:mod(${durationSeconds}-t,60)\\:d\\:2}`;

        // drawtext:
        // x=(w-tw)/2  -> Centrado horizontalmente (AnchoVideo - AnchoTexto) / 2
        // y=50        -> 50 pixeles desde el borde superior
        const drawTextFilter = `drawtext=${fontOption}text='${countdownExpression}':fontcolor=white:fontsize=45:x=(w-tw)/2:y=50:box=1:boxcolor=black@0.4:boxborderw=10`;

        // 4. Argumentos de FFmpeg
        const args = [
            '-hide_banner', '-loglevel', 'error',
            '-thread_queue_size', '512', // Cola un poco más grande para estabilidad
            
            // --- ENTRADA 0: IMAGEN ---
            '-loop', '1', 
            '-framerate', '1', 
            '-i', imageUrl,

            // --- ENTRADA 1: AUDIO CON BUFFER (Anti-Cortes) ---
            '-probesize', '10M',       // Analizar 10MB antes de empezar
            '-analyzeduration', '10M', // Analizar hasta 10MB de duración
            '-i', audioUrl,

            // --- MAPEO ---
            '-map', '0:v:0', // Usar video del input 0
            '-map', '1:a:0', // Usar audio del input 1

            // --- FILTROS DE VIDEO ---
            // Escalamos a 720p, aseguramos pixel cuadrado (sar), dibujamos reloj, forzamos 1 fps real
            '-vf', `scale=1280:720,setsar=1,${drawTextFilter},fps=1`,

            // --- CODECS DE VIDEO ---
            '-c:v', 'libx264', 
            '-preset', 'ultrafast', // Mínimo uso de CPU
            '-tune', 'stillimage',  // Optimización para imagen fija
            '-r', '1',              // 1 Frame por segundo
            '-g', '2',              // Keyframe cada 2 frames
            '-pix_fmt', 'yuv420p',  // Compatible con todos los reproductores
            
            // --- CODECS DE AUDIO ---
            '-c:a', 'aac', 
            '-b:a', '128k', 
            '-ar', '44100',
            
            // --- BUFFER DE SALIDA ---
            '-max_muxing_queue_size', '1024', 

            // --- DURACIÓN ---
            '-t', `${durationSeconds}`,

            // --- SALIDA RTMP ---
            '-f', 'flv', 
            rtmpUrl
        ];

        // 5. Ejecutar
        ffmpegProcess = spawn('ffmpeg', args);

        // 6. Logs de error
        ffmpegProcess.stderr.on('data', (data) => {
            const msg = data.toString();
            // Ignoramos info normal, mostramos warnings reales
            if (msg.includes('Error') || msg.includes('fail') || msg.includes('Invalid')) {
                console.error(`🔴 [FFmpeg Warning]: ${msg.trim()}`);
            }
        });

        // 7. Cierre del proceso
        ffmpegProcess.on('close', (code) => {
            console.log(`🏁 Stream finalizado (Código: ${code}).`);
            ffmpegProcess = null;
            resolve();
        });

        ffmpegProcess.on('error', (err) => {
            console.error("❌ [FFmpeg Error]:", err);
            reject(err);
        });

        // 8. Keep-Alive para Render (Log cada minuto)
        const keepAlive = setInterval(() => {
            if (ffmpegProcess) {
                console.log(`   📡 Transmitiendo... (Quedan ${(durationSeconds/3600).toFixed(1)}h)`);
            } else {
                clearInterval(keepAlive);
            }
        }, 60000); 
    });
}

function stopStream() {
    if (ffmpegProcess) {
        try {
            ffmpegProcess.kill('SIGINT'); // Intentar cierre suave
        } catch (e) {
            console.error("Error al matar proceso:", e);
        }
        ffmpegProcess = null;
    }
}

module.exports = { startStream, stopStream };