const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let ffmpegProcess = null;

/**
 * Inicia la transmisión con blindaje contra cortes de audio y reloj centrado.
 * @param {string} imageUrl - URL de la imagen en BunnyCDN
 * @param {string} audioUrl - URL del stream de radio
 * @param {string} rtmpUrl - URL RTMP de YouTube
 * @param {number} durationHours - Duración en horas
 */
function startStream(imageUrl, audioUrl, rtmpUrl, durationHours = 12) {
    return new Promise((resolve, reject) => {
        // 1. Limpieza de procesos anteriores si existen
        if (ffmpegProcess) {
            try { 
                ffmpegProcess.kill(); 
            } catch(e) {
                console.log("Aviso: No se pudo matar el proceso anterior limpiamente.");
            }
        }

        const durationSeconds = durationHours * 3600;
        console.log(`🚀 [FFmpeg] Iniciando stream (Modo Blindado: Reconexión + Buffer Alto)...`);

        // 2. Configuración de Fuente para el reloj
        const fontPath = path.join(__dirname, '../assets/font.ttf');
        let fontOption = "";
        
        // Verificamos si existe la fuente personalizada
        if (fs.existsSync(fontPath)) {
            // FFmpeg es delicado con las rutas en Windows/Linux, normalizamos
            const cleanFontPath = fontPath.replace(/\\/g, '/').replace(':', '\\:'); 
            fontOption = `fontfile='${cleanFontPath}':`;
        }

        // 3. RELOJ (Solo Números HH:MM:SS, Arriba Centro)
        // Fórmula: Calcula horas, minutos y segundos restantes
        const countdownExpression = 
            `%{eif\\:(${durationSeconds}-t)/3600\\:d\\:2}\\:%{eif\\:(mod(${durationSeconds}-t,3600))/60\\:d\\:2}\\:%{eif\\:mod(${durationSeconds}-t,60)\\:d\\:2}`;

        // Filtro drawtext:
        // x=(w-tw)/2  -> Centrado horizontalmente
        // y=50        -> 50 pixeles desde arriba
        // fontsize=45 -> Tamaño grande visible
        const drawTextFilter = `drawtext=${fontOption}text='${countdownExpression}':fontcolor=white:fontsize=45:x=(w-tw)/2:y=50:box=1:boxcolor=black@0.4:boxborderw=10`;

        // 4. Argumentos COMPLETOS de FFmpeg
        const args = [
            '-hide_banner', 
            '-loglevel', 'error', // Solo mostrar errores graves
            
            // --- ENTRADA 0: IMAGEN ---
            '-thread_queue_size', '2048', // Cola aumentada para procesar imagen
            '-loop', '1', 
            '-framerate', '1', 
            '-i', imageUrl,

            // --- ENTRADA 1: AUDIO (CONFIGURACIÓN ANTI-CORTES) ---
            '-thread_queue_size', '4096',  // Cola GIGANTE para audio
            
            // Flags de Reconexión (Vital para radios online)
            '-reconnect', '1',             // Activar reconexión
            '-reconnect_streamed', '1',    // Específico para streams en vivo
            '-reconnect_delay_max', '10',  // Intentar reconectar hasta 10 segundos
            '-reconnect_on_network_error', '1',
            '-reconnect_on_http_error', '1',
            
            // Buffers de Análisis (Carga mucho audio antes de empezar a transmitir)
            '-probesize', '50M',           // Analizar 50MB
            '-analyzeduration', '20M',     // 20MB de duración de análisis
            
            '-i', audioUrl,

            // --- MAPEO DE STREAMS ---
            '-map', '0:v:0', // Video viene de la imagen (input 0)
            '-map', '1:a:0', // Audio viene de la radio (input 1)

            // --- FILTROS DE VIDEO ---
            // Escalado 720p + Pixel Ratio + Reloj + Forzar 1 FPS
            '-vf', `scale=1280:720,setsar=1,${drawTextFilter},fps=1`,

            // --- CODECS DE VIDEO ---
            '-c:v', 'libx264', 
            '-preset', 'ultrafast', // Mínimo uso de CPU
            '-tune', 'stillimage',  // Optimización para imagen estática
            '-r', '1',              // Output a 1 frame por segundo
            '-g', '2',              // Keyframe cada 2 segundos
            '-pix_fmt', 'yuv420p',  // Formato de color compatible con YouTube
            
            // --- CODECS DE AUDIO ---
            '-c:a', 'aac', 
            '-b:a', '128k', // Bitrate de audio
            '-ar', '44100', // Frecuencia de muestreo
            '-af', 'aresample=async=1000', // Sincronización asíncrona para evitar desface
            
            // --- BUFFER DE SALIDA ---
            '-max_muxing_queue_size', '9999', // Buffer de salida extremo para evitar errores de cola llena

            // --- DURACIÓN Y SALIDA ---
            '-t', `${durationSeconds}`,
            '-f', 'flv', 
            rtmpUrl
        ];

        // 5. Ejecutar proceso
        ffmpegProcess = spawn('ffmpeg', args);

        // 6. Monitoreo de errores
        ffmpegProcess.stderr.on('data', (data) => {
            const msg = data.toString();
            // Filtramos el ruido habitual de ffmpeg, mostramos solo warnings reales
            if (msg.includes('Error') || msg.includes('fail') || msg.includes('Invalid') || msg.includes('Dropping')) {
                console.error(`🔴 [FFmpeg Warning]: ${msg.trim()}`);
            }
        });

        // 7. Evento de finalización
        ffmpegProcess.on('close', (code) => {
            console.log(`🏁 Stream finalizado (Código: ${code}).`);
            ffmpegProcess = null;
            resolve();
        });

        // 8. Evento de error crítico al iniciar
        ffmpegProcess.on('error', (err) => {
            console.error("❌ [FFmpeg Error Critico]:", err);
            reject(err);
        });

        // 9. Keep-Alive (Log cada minuto para ver que sigue vivo)
        const keepAlive = setInterval(() => {
            if (ffmpegProcess) {
                const horasRestantes = (durationSeconds / 3600).toFixed(1);
                console.log(`   📡 Transmitiendo... (Quedan ${horasRestantes}h)`);
            } else {
                clearInterval(keepAlive);
            }
        }, 60000); 
    });
}

function stopStream() {
    if (ffmpegProcess) {
        try {
            console.log("🛑 Deteniendo transmisión FFmpeg...");
            ffmpegProcess.kill('SIGINT'); // Intentamos cierre suave primero
        } catch (e) {
            console.error("Error al matar proceso:", e);
        }
        ffmpegProcess = null;
    }
}

module.exports = { startStream, stopStream };