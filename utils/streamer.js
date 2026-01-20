const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let ffmpegProcess = null;

/**
 * Inicia la transmisión optimizada para estabilidad.
 * Reduce bitrate de audio para evitar cortes y usa sincronización asíncrona.
 * * @param {string} imageUrl - URL de la imagen (BunnyCDN)
 * @param {string} audioUrl - URL del stream de radio
 * @param {string} rtmpUrl - URL RTMP de YouTube
 * @param {number} durationHours - Duración en horas
 */
function startStream(imageUrl, audioUrl, rtmpUrl, durationHours = 12) {
    return new Promise((resolve, reject) => {
        // 1. Limpieza de proceso anterior si existe
        if (ffmpegProcess) {
            try { 
                ffmpegProcess.kill(); 
            } catch(e) {
                console.log("Aviso: No se pudo cerrar proceso anterior limpiamente.");
            }
        }

        const durationSeconds = durationHours * 3600;
        console.log(`🚀 [FFmpeg] Iniciando stream (Modo: Estabilidad Máxima - 96k Audio)...`);

        // 2. Configuración de Fuente para el reloj (si existe)
        const fontPath = path.join(__dirname, '../assets/font.ttf');
        let fontOption = "";
        
        if (fs.existsSync(fontPath)) {
            // Normalizamos ruta para compatibilidad Windows/Linux/FFmpeg
            const cleanFontPath = fontPath.replace(/\\/g, '/').replace(':', '\\:'); 
            fontOption = `fontfile='${cleanFontPath}':`;
        }

        // 3. RELOJ VISUAL (HH:MM:SS) - Centrado Arriba
        const countdownExpression = 
            `%{eif\\:(${durationSeconds}-t)/3600\\:d\\:2}\\:%{eif\\:(mod(${durationSeconds}-t,3600))/60\\:d\\:2}\\:%{eif\\:mod(${durationSeconds}-t,60)\\:d\\:2}`;

        // Configuración visual del texto del reloj
        const drawTextFilter = `drawtext=${fontOption}text='${countdownExpression}':fontcolor=white:fontsize=45:x=(w-tw)/2:y=50:box=1:boxcolor=black@0.4:boxborderw=10`;

        // 4. Argumentos COMPLETOS de FFmpeg
        const args = [
            '-hide_banner', 
            '-loglevel', 'error', // Solo mostrar errores críticos
            
            // --- ENTRADA 0: IMAGEN ---
            '-thread_queue_size', '512', // Cola moderada para imagen
            '-loop', '1', 
            '-framerate', '1', 
            '-i', imageUrl,

            // --- ENTRADA 1: AUDIO (RADIO ONLINE) ---
            '-thread_queue_size', '1024',  // Cola más grande para audio
            
            // Flags de red para reconexión automática (VITAL)
            '-reconnect', '1',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '10', // Reintentar hasta 10 seg
            
            // Buffer de análisis moderado (Evita lag inicial excesivo)
            '-probesize', '5M',
            '-analyzeduration', '5M',
            
            '-i', audioUrl,

            // --- MAPEO ---
            '-map', '0:v:0', // Video de la imagen
            '-map', '1:a:0', // Audio de la radio

            // --- PROCESAMIENTO DE VIDEO ---
            // Escala a 720p, pone el reloj, fuerza 1 FPS para ahorrar CPU
            '-vf', `scale=1280:720,setsar=1,${drawTextFilter},fps=1`,

            // --- CODECS DE VIDEO ---
            '-c:v', 'libx264', 
            '-preset', 'ultrafast', // Prioridad absoluta a la velocidad
            '-tune', 'stillimage',  // Optimización para imagen fija
            '-r', '1',              // 1 frame por segundo
            '-g', '2',              // Keyframe cada 2 segundos
            '-pix_fmt', 'yuv420p',  // Formato de color estándar
            
            // --- CODECS DE AUDIO (OPTIMIZADO) ---
            '-c:a', 'aac', 
            '-b:a', '96k',       // <--- CALIDAD BAJADA A 96k (Más estabilidad, menos cortes)
            '-ac', '2',          // Forzar Estéreo
            '-ar', '44100',      // Frecuencia estándar
            
            // FILTRO DE SINCRONIZACIÓN (LA SOLUCIÓN)
            // async=1: Permite estirar/comprimir audio suavemente para coincidir con video
            // first_pts=0: Asegura que empiece desde el inicio
            '-af', 'aresample=async=1:first_pts=0',
            
            // --- SALIDA ---
            '-max_muxing_queue_size', '2048', // Buffer de salida seguro
            '-t', `${durationSeconds}`,       // Tiempo límite
            '-f', 'flv',                      // Formato YouTube
            rtmpUrl
        ];

        // 5. Iniciar Proceso
        ffmpegProcess = spawn('ffmpeg', args);

        // 6. Monitoreo de Logs (Solo errores)
        ffmpegProcess.stderr.on('data', (data) => {
            const msg = data.toString();
            // Filtramos mensajes irrelevantes
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

        // 8. Error de inicio
        ffmpegProcess.on('error', (err) => {
            console.error("❌ [FFmpeg Error Crítico]:", err);
            reject(err);
        });

        // 9. Keep-Alive (Log cada minuto para Render)
        const keepAlive = setInterval(() => {
            if (ffmpegProcess) {
                console.log(`   📡 Transmitiendo... (Quedan ${(durationSeconds/3600).toFixed(1)}h)`);
            } else {
                clearInterval(keepAlive);
            }
        }, 60000); 
    });
}

/**
 * Detiene el stream manualmente
 */
function stopStream() {
    if (ffmpegProcess) {
        try {
            console.log("🛑 Deteniendo transmisión...");
            ffmpegProcess.kill('SIGINT');
        } catch (e) {
            console.error("Error al detener proceso:", e);
        }
        ffmpegProcess = null;
    }
}

module.exports = { startStream, stopStream };