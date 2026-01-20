const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let ffmpegProcess = null;

/**
 * STREAM LIGERO Y ESTABLE
 * Usa 'wallclock' para sincronizar el audio de radio en vivo sin cortes ni aceleraciones.
 * @param {string} imageUrl - URL de la imagen (BunnyCDN)
 * @param {string} audioUrl - URL de la radio
 * @param {string} rtmpUrl - URL de YouTube
 * @param {number} durationHours - Duración en horas
 */
function startStream(imageUrl, audioUrl, rtmpUrl, durationHours = 12) {
    return new Promise((resolve, reject) => {
        // 1. Limpieza de proceso anterior
        if (ffmpegProcess) {
            try { 
                ffmpegProcess.kill(); 
            } catch(e) {
                console.log("Aviso: No se pudo cerrar proceso anterior.");
            }
        }

        const durationSeconds = durationHours * 3600;
        console.log(`🚀 [FFmpeg] Iniciando stream (Modo: Sincronización Real-Time)...`);

        // 2. Configuración de Fuente (Para el reloj)
        const fontPath = path.join(__dirname, '../assets/font.ttf');
        let fontOption = "";
        
        if (fs.existsSync(fontPath)) {
            // Normalizamos la ruta para que FFmpeg no falle en Linux/Windows
            const cleanFontPath = fontPath.replace(/\\/g, '/').replace(':', '\\:'); 
            fontOption = `fontfile='${cleanFontPath}':`;
        }

        // 3. RELOJ VISUAL (Solo números HH:MM:SS, Centrado Arriba)
        const countdownExpression = 
            `%{eif\\:(${durationSeconds}-t)/3600\\:d\\:2}\\:%{eif\\:(mod(${durationSeconds}-t,3600))/60\\:d\\:2}\\:%{eif\\:mod(${durationSeconds}-t,60)\\:d\\:2}`;

        // Filtro de texto: Centrado horizontalmente (x=(w-tw)/2), Arriba (y=50)
        const drawTextFilter = `drawtext=${fontOption}text='${countdownExpression}':fontcolor=white:fontsize=45:x=(w-tw)/2:y=50:box=1:boxcolor=black@0.4:boxborderw=10`;

        // 4. Argumentos COMPLETOS de FFmpeg
        const args = [
            '-hide_banner', 
            '-loglevel', 'warning', // Logs limpios, solo advertencias reales

            // --- TRUCOS DE SINCRONIZACIÓN ---
            '-fflags', '+genpts+igndts', // Corregir marcas de tiempo rotas de la radio
            
            // --- ENTRADA 0: IMAGEN ---
            '-loop', '1', 
            '-framerate', '1', 
            '-i', imageUrl,

            // --- ENTRADA 1: AUDIO (LA CLAVE DE LA ESTABILIDAD) ---
            // 'wallclock': Usa el reloj del sistema. Si la radio se atrasa, no intenta acelerar para compensar.
            '-use_wallclock_as_timestamps', '1', 
            
            '-reconnect', '1',             // Reconectar si cae internet
            '-reconnect_streamed', '1',    // Específico para streams
            '-reconnect_delay_max', '5',   // Reintentar rápido (5s max)
            
            '-thread_queue_size', '512',   // Cola equilibrada (ni muy chica, ni gigante)
            '-i', audioUrl,

            // --- MAPEO ---
            '-map', '0:v:0', // Video de la imagen
            '-map', '1:a:0', // Audio de la radio

            // --- PROCESAMIENTO DE VIDEO ---
            // Escalar a 720p, Dibujar Reloj, Forzar 1 FPS (Ahorra CPU)
            '-vf', `scale=1280:720,setsar=1,${drawTextFilter},fps=1`,

            // --- CODECS DE VIDEO ---
            '-c:v', 'libx264', 
            '-preset', 'ultrafast', // Prioridad: Velocidad
            '-tune', 'stillimage',  // Optimización para fotos
            '-r', '1',              // Salida a 1 frame por segundo
            '-g', '2',              // Keyframe cada 2 segundos
            '-pix_fmt', 'yuv420p',  // Colores estándar
            
            // --- CODECS DE AUDIO ---
            '-c:a', 'aac', 
            '-b:a', '128k',      // Calidad estándar
            '-ac', '2',          // Forzar Estéreo (Evita problemas si la radio cambia a Mono)
            '-ar', '44100',      // Forzar 44.1kHz (Estándar de YouTube)
            
            // --- SALIDA ---
            '-max_muxing_queue_size', '1024', // Buffer de salida seguro
            '-t', `${durationSeconds}`,       // Duración exacta
            '-f', 'flv',                      // Formato para YouTube
            rtmpUrl
        ];

        // 5. Ejecutar FFmpeg
        ffmpegProcess = spawn('ffmpeg', args);

        // 6. Manejo de Logs
        ffmpegProcess.stderr.on('data', (data) => {
            const msg = data.toString();
            // Solo mostramos errores que indiquen un problema real
            if (msg.includes('Error') || msg.includes('fail') || msg.includes('Server returned 40') || msg.includes('Connection refused')) {
                console.error(`🔴 [FFmpeg]: ${msg.trim()}`);
            }
        });

        // 7. Cierre del proceso
        ffmpegProcess.on('close', (code) => {
            console.log(`🏁 Stream finalizado (Código: ${code}).`);
            ffmpegProcess = null;
            resolve();
        });

        // 8. Error crítico al arrancar
        ffmpegProcess.on('error', (err) => {
            console.error("❌ [FFmpeg Error Crítico]:", err);
            reject(err);
        });

        // 9. Keep-Alive (Log cada minuto)
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
 * Detiene la transmisión forzosamente
 */
function stopStream() {
    if (ffmpegProcess) {
        try { 
            console.log("🛑 Deteniendo transmisión...");
            ffmpegProcess.kill('SIGINT'); 
        } catch(e) {
            console.error("Error al detener proceso:", e);
        }
        ffmpegProcess = null;
    }
}

module.exports = { startStream, stopStream };