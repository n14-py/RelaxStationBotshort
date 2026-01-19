const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let ffmpegProcess = null;

/**
 * Inicia el stream con contador regresivo y superposición de texto dinámica.
 * @param {string} imagePath - Ruta de la imagen de fondo.
 * @param {string} audioUrl - URL de la radio.
 * @param {string} rtmpUrl - Clave de transmisión.
 * @param {number} durationHours - Duración en horas (ej: 12).
 */
function startStream(imagePath, audioUrl, rtmpUrl, durationHours = 12) {
    return new Promise((resolve, reject) => {
        if (ffmpegProcess) {
            console.log("⚠️ Reiniciando proceso FFmpeg...");
            stopStream();
        }

        console.log(`🚀 [FFmpeg] Iniciando motor 1 FPS con Contador de ${durationHours}h...`);

        // --- PREPARACIÓN DE RECURSOS ---
        const durationSeconds = durationHours * 3600;
        
        // Buscamos si el usuario puso una fuente bonita, si no, usamos la default
        const fontPath = path.join(__dirname, '../assets/font.ttf');
        let fontOption = "";
        if (fs.existsSync(fontPath)) {
            // FFmpeg necesita rutas con barras normales, no invertidas de Windows
            const cleanFontPath = fontPath.replace(/\\/g, '/').replace(':', '\\:'); 
            fontOption = `fontfile='${cleanFontPath}':`;
            console.log("   ✅ Usando fuente personalizada: font.ttf");
        } else {
            console.log("   ℹ️ No se detectó 'assets/font.ttf', usando fuente del sistema.");
        }

        // --- FILTRO MAGICO DEL CONTADOR ---
        // Explicación: Calcula (TiempoTotal - TiempoTranscurrido) y lo formatea como HH:MM:SS
        const countdownExpression = 
            `%{eif\\:(${durationSeconds}-t)/3600\\:d\\:2}\\:%{eif\\:(mod(${durationSeconds}-t,3600))/60\\:d\\:2}\\:%{eif\\:mod(${durationSeconds}-t,60)\\:d\\:2}`;

        const drawTextFilter = `drawtext=${fontOption}text='FIN DE TRANSMISION\\: ${countdownExpression}':fontcolor=white:fontsize=35:x=w-tw-30:y=30:box=1:boxcolor=black@0.6:boxborderw=10`;

        // --- ARGUMENTOS FFMPEG ---
        const args = [
            '-hide_banner', '-loglevel', 'error',
            '-thread_queue_size', '2048', // Buffer gigante para evitar cortes de audio

            // INPUT 0: IMAGEN (Bucle)
            '-loop', '1',
            '-framerate', '1', 
            '-i', imagePath,

            // INPUT 1: AUDIO (Radio Online)
            '-i', audioUrl,

            // MAPEO
            '-map', '0:v:0',
            '-map', '1:a:0',

            // FILTROS DE VIDEO (Escalado + Contador)
            '-vf', `scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,${drawTextFilter},fps=1`,

            // CODECS
            '-c:v', 'libx264',
            '-preset', 'ultrafast', // Máxima velocidad
            '-tune', 'stillimage',  // Optimización para imagen casi estática
            '-r', '1',              // 1 Frame Por Segundo REAL
            '-g', '2',              // Keyframe cada 2 segundos
            '-pix_fmt', 'yuv420p',
            
            // AUDIO
            '-c:a', 'aac',
            '-b:a', '128k',
            '-ar', '44100',

            // SALIDA
            '-f', 'flv',
            rtmpUrl
        ];

        ffmpegProcess = spawn('ffmpeg', args);

        // --- LOGS EN TIEMPO REAL ---
        ffmpegProcess.stderr.on('data', (data) => {
            const message = data.toString();
            // Solo mostramos errores graves, ignoramos info de frames
            if (!message.includes('frame=') && !message.includes('fps=') && !message.includes('size=')) {
                console.error(`🔴 [FFmpeg]: ${message.trim()}`);
            }
        });

        ffmpegProcess.on('close', (code) => {
            console.log(`🏁 [FFmpeg] Proceso terminó (Código: ${code})`);
            ffmpegProcess = null;
        });

        // Verificación inicial de estabilidad (3 segundos)
        setTimeout(() => {
            if (ffmpegProcess) {
                console.log("✅ [FFmpeg] Stream ESTABLE enviando video.");
                resolve();
            } else {
                reject(new Error("FFmpeg murió al arrancar. Revisa los logs."));
            }
        }, 3000);
    });
}

function stopStream() {
    if (ffmpegProcess) {
        console.log("🛑 Deteniendo transmisión...");
        try {
            ffmpegProcess.stdin.write('q');
        } catch(e) {}
        ffmpegProcess.kill('SIGINT');
        ffmpegProcess = null;
    }
}

module.exports = { startStream, stopStream };

//si