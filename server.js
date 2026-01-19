require('dotenv').config();
const express = require('express');
const { spawn } = require('child_process');
const axios = require('axios');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const PORT = process.env.PORT || 8080;
const API_CENTRAL_URL = process.env.API_CENTRAL_URL;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

// Configuración de FFmpeg y Streams
const VIDEO_BITRATE = process.env.VIDEO_BITRATE || '3000k';
const FFMPEG_PRESET = process.env.FFMPEG_PRESET || 'ultrafast';
const LOG_FILE = 'ffmpeg_log.txt';
const STREAMS_TO_RUN = 5;

// Variables Globales
const activeProcesses = {}; // { 'streamName': { process: <ChildProcess>, id: '...', broadcastId: '...' } }
const streamConfig = [
    // Definimos las 5 transmisiones (3 Lluvia, 2 Lofi)
    { id: 1, name: 'Lluvia-1', type: 'rain', rtmpUrl: null, youtubeId: null },
    { id: 2, name: 'Lluvia-2', type: 'rain', rtmpUrl: null, youtubeId: null },
    { id: 3, name: 'Lluvia-3', type: 'rain', rtmpUrl: null, youtubeId: null },
    { id: 4, name: 'Lofi-4', type: 'lofi-bg', rtmpUrl: null, youtubeId: null },
    { id: 5, name: 'Lofi-5', type: 'lofi-bg', rtmpUrl: null, youtubeId: null },
];

// --- 1. CONFIGURACIÓN DE YOUTUBE AUTH ---
const oauth2Client = new OAuth2Client(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    'http://localhost:3000/oauth2callback' 
);
oauth2Client.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });

const youtube = google.youtube({ version: 'v3', auth: oauth2Client });


// --- 2. GESTIÓN DE LA LISTA DE REPRODUCCIÓN (Lofi) ---

// ¡CORRECCIÓN CRUCIAL! Ahora apunta a la playlist SEPARADA de YouTube
const LOFI_PLAYLIST_URL = `${API_CENTRAL_URL}/youtube/playlist.txt`;


// --- 3. FUNCIONES DE COMUNICACIÓN CON LA API CENTRAL ---

/**
 * Obtiene los activos necesarios de la API Central.
 * @param {string} type 'rain' o 'lofi-bg'
 * @param {number} limit número de activos a obtener
 */
async function getAssetsFromCentral(type, limit) {
    console.log(`[API] Solicitando ${limit} activos de tipo '${type}'...`);
    try {
        // Llama a la ruta pública que creaste
        const response = await axios.get(`${API_CENTRAL_URL}/youtube/assets/public?type=${type}&limit=${limit}`);
        return response.data; // Esperamos un array de activos
    } catch (error) {
        console.error(`❌ ERROR al obtener activos de tipo ${type}:`, error.message);
        return [];
    }
}


// --- 4. FUNCIONES DE GESTIÓN DE YOUTUBE Y FFMPEG ---

/**
 * Cierra un proceso FFmpeg si está activo.
 */
function stopFfmpeg(streamName) {
    const procData = activeProcesses[streamName];
    if (procData && procData.process) {
        console.log(`🛑 Deteniendo proceso FFmpeg para ${streamName}...`);
        procData.process.removeAllListeners('close'); 
        procData.process.kill('SIGINT');
        activeProcesses[streamName].process = null;
        console.log(`Proceso ${streamName} detenido.`);
    }
}

/**
 * Crea la transmisión en YouTube y obtiene la URL RTMP.
 */
async function setupBroadcast(streamData, asset) {
    try {
        // La IA de Bedrock generó la descripción
        const description = asset.aiDescription || "Música y ambiente relajante 24/7. ¡Suscríbete para relajarte y concentrarte!";
        
        // 1. Crear el LiveStream (el "canal de ingesta")
        const streamResponse = await youtube.liveStreams.insert({
            part: 'snippet,cdn',
            requestBody: {
                snippet: { title: `Stream Ingesta: ${streamData.name}` },
                cdn: { format: '1080p', ingestionType: 'rtmp', resolution: '1080p', frameRate: '30fps' }
            }
        });

        // 2. Crear el LiveBroadcast (el "video" que verán los usuarios)
        const scheduledStartTime = new Date(Date.now() + 10 * 60 * 1000).toISOString(); 
        const broadcastResponse = await youtube.liveBroadcasts.insert({
            part: 'snippet,status',
            requestBody: {
                snippet: {
                    title: `${asset.title} 🎧 24/7 | Sonidos Relajantes para Dormir y Estudiar`,
                    description: description,
                    scheduledStartTime: scheduledStartTime
                },
                status: {
                    privacyStatus: 'public',
                    selfDeclaredMadeForKids: false,
                    enableAutoStart: true,
                    enableAutoStop: true,
                    enableArchive: true,
                    lifeCycleStatus: 'created'
                }
            }
        });
        
        // 3. Vincular Stream y Broadcast
        await youtube.liveBroadcasts.bind({
            part: 'id,contentDetails',
            id: broadcastResponse.data.id,
            streamId: streamResponse.data.id
        });
        
        const rtmpUrl = streamResponse.data.cdn.ingestionInfo.ingestionAddress;
        const streamName = streamResponse.data.cdn.ingestionInfo.streamName;

        return {
            rtmp: `${rtmpUrl}/${streamName}`,
            broadcastId: broadcastResponse.data.id,
            streamId: streamResponse.data.id,
            scheduledStartTime: new Date(scheduledStartTime)
        };

    } catch (error) {
        console.error(`❌ ERROR al configurar YouTube para ${streamData.name}:`, error.message);
        return null;
    }
}

/**
 * Inicia el proceso FFmpeg.
 */
function startFfmpeg(streamData, asset, youtubeInfo) {
    if (activeProcesses[streamData.name]?.process) {
        stopFfmpeg(streamData.name);
    }
    
    // --- Lógica de FFmpeg para Rain vs Lofi-BG ---
    let args = [
        '-loglevel', 'error', 
        '-re',
        '-stream_loop', '-1',
        '-i', asset.videoUrl, // Input de video (Cloudinary URL)
        '-i', // Segundo Input (Depende del tipo)
    ];

    if (streamData.type === 'rain') {
        // Input de audio de lluvia (Cloudinary URL)
        args.push(asset.audioUrl); 
    } else if (streamData.type === 'lofi-bg') {
        // Input de la playlist de Lofi (API Central TXT)
        // NOTA: Usamos -i 'playlist.txt' y -i 'video' para que el video haga loop,
        // y el audio se reproduzca como una lista de canciones.
        args.push('-f', 'concat', '-safe', '0', '-protocol_whitelist', 'file,http,https,tcp,tls', LOFI_PLAYLIST_URL);
    }
    
    // Configuración de Mapeo y Calidad (Común)
    args = args.concat([
        '-map', '0:v:0', 
        '-map', '1:a:0', 
        '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:-1:-1,setsar=1',
        '-c:v', 'libx264',
        '-preset', FFMPEG_PRESET, // ¡ultrafast, crucial para Lightsail!
        '-x264-params', 'keyint=48:min-keyint=48',
        '-b:v', VIDEO_BITRATE, 
        '-maxrate', VIDEO_BITRATE,
        '-bufsize', `${parseInt(VIDEO_BITRATE) * 2}k`, 
        '-r', '24',
        '-g', '48',
        '-threads', '1',
        '-flush_packets', '1',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        // Usamos -shortest para los streams Lofi para que el stream se corte cuando
        // termine el último archivo de la playlist (si no está en loop)
        ...(streamData.type === 'lofi-bg' ? [] : []), // Decidimos no usar -shortest en Lofi para que loopee el video
        '-f', 'flv',
        youtubeInfo.rtmp
    ]);
    
    console.log(`\n🚀 Iniciando FFmpeg para [${streamData.name}]...`);
    const proc = spawn('ffmpeg', args);

    proc.stderr.on('data', (data) => {
        if (data.toString().includes("failed")) {
            console.error(`[FFmpeg ${streamData.name} ERROR]: ${data.toString()}`);
        }
    });

    proc.on('close', (code) => {
        console.warn(`⚠️ FFmpeg ${streamData.name} detenido (código ${code}). Reiniciando en 10s...`);
        setTimeout(() => startFfmpeg(streamData, asset, youtubeInfo), 10000); 
    });

    proc.on('error', (err) => {
        console.error(`❌ Error fatal al iniciar FFmpeg ${streamData.name}:`, err);
    });
    
    activeProcesses[streamData.name] = { 
        process: proc, 
        broadcastId: youtubeInfo.broadcastId, 
        streamId: youtubeInfo.streamId, 
        assetId: asset._id,
        restartTime: new Date(Date.now() + 24 * 60 * 60 * 1000) // Reiniciar en 24 horas
    };
    console.log(`🟢 [${streamData.name}] FFmpeg en ejecución. YouTube ID: ${youtubeInfo.broadcastId}`);
}


/**
 * CICLO PRINCIPAL: Orquesta el streaming 24/7
 */
async function orchestrateStreams() {
    console.log(`\n--- INICIANDO ORQUESTADOR DE STREAMS (${STREAMS_TO_RUN} TOTALES) ---`);
    let availableAssets = { rain: [], 'lofi-bg': [] };
    
    // 1. Obtener la lista de todos los activos de la API Central
    availableAssets.rain = await getAssetsFromCentral('rain', 3);
    availableAssets['lofi-bg'] = await getAssetsFromCentral('lofi-bg', 2);

    // Verificamos si hay suficientes activos
    if (availableAssets.rain.length < 3 || availableAssets['lofi-bg'].length < 2) {
        console.error("❌ ERROR FATAL: No hay suficientes activos subidos en la API Central. Se requieren 3 de lluvia y 2 de lofi-bg. Esperando 5 minutos...");
        return setTimeout(orchestrateStreams, 5 * 60 * 1000); // Reintentar en 5 minutos
    }

    // 2. Inicializar los 5 Streams
    for (const streamData of streamConfig) {
        const assetsList = availableAssets[streamData.type];
        // Seleccionamos un activo al azar
        const randomAsset = assetsList[Math.floor(Math.random() * assetsList.length)]; 

        if (!randomAsset || activeProcesses[streamData.name]) continue; 

        console.log(`\n⚙️ Configurando stream: ${streamData.name} con activo: ${randomAsset.title}`);
        
        // 3. Crear el Broadcast de YouTube
        const youtubeInfo = await setupBroadcast(streamData, randomAsset);
        
        if (youtubeInfo) {
            // 4. Iniciar FFmpeg (empezará a transmitir en 10 minutos)
            startFfmpeg(streamData, randomAsset, youtubeInfo);
        }
    }
    
    // 5. Bucle de Mantenimiento 24/7 (chequea si toca reiniciar)
    setInterval(maintenanceCheck, 60 * 60 * 1000); 
}

/**
 * Revisa el estado de los streams y los reinicia cada 24 horas.
 */
async function maintenanceCheck() {
    const now = new Date();
    console.log(`\n[Mantenimiento] Chequeando procesos activos... (${now.toLocaleTimeString()})`);
    
    let availableAssets = { rain: [], 'lofi-bg': [] };
    availableAssets.rain = await getAssetsFromCentral('rain', 3);
    availableAssets['lofi-bg'] = await getAssetsFromCentral('lofi-bg', 2);
    
    for (const name in activeProcesses) {
        const streamData = streamConfig.find(s => s.name === name);
        const procData = activeProcesses[name];
        
        if (procData.process && now >= procData.restartTime) {
            console.log(`\n🔄 Reinicio de ciclo para ${name} (Cada 24h)...`);
            
            const assetsList = availableAssets[streamData.type];
            const randomAsset = assetsList[Math.floor(Math.random() * assetsList.length)]; 
            const oldBroadcastId = procData.broadcastId;

            if (randomAsset) {
                stopFfmpeg(name);
                
                setupBroadcast(streamData, randomAsset)
                    .then(youtubeInfo => {
                        if (youtubeInfo) {
                            startFfmpeg(streamData, randomAsset, youtubeInfo);
                            
                            youtube.liveBroadcasts.transition({
                                broadcastStatus: 'complete',
                                id: oldBroadcastId,
                                part: 'status'
                            }).catch(err => console.error(`Error al finalizar Broadcast ${oldBroadcastId}: ${err.message}`));
                        }
                    });
            } else {
                console.error(`❌ No se encontró un activo de reemplazo para ${name}. Dejando el stream actual en loop.`);
            }
        }
    }
}


// --- 5. RUTAS DE CONTROL DEL SERVIDOR (Para la API Central) ---

// Middleware de seguridad para la API Central
app.use(express.json());
app.use((req, res, next) => {
    // La autenticación es por la clave ADMIN_API_KEY
    if (req.headers['x-api-key'] && req.headers['x-api-key'] === ADMIN_API_KEY) {
        next();
    } else {
        console.warn("Intento de acceso RECHAZADO (clave de la API Central incorrecta)");
        res.status(403).json({ error: "Acceso no autorizado." });
    }
});

/**
 * RUTA DE CONTROL: Reinicia los streams Lofi (llamada desde el admin-youtube.html)
 * POST /restart-lofi
 */
app.post('/restart-lofi', (req, res) => {
    let restarted = 0;
    
    for (const name in activeProcesses) {
        const streamData = streamConfig.find(s => s.name === name);
        if (streamData && streamData.type === 'lofi-bg') {
            const procData = activeProcesses[name];
            
            if (procData.process) {
                 console.log(`\n⚡ Recibida orden de REINICIO LOFI para: ${name}.`);
                 
                 // Matamos el proceso, y la lógica 'proc.on('close')' lo reiniciará automáticamente.
                 procData.process.kill('SIGINT'); 
                 restarted++;
            }
        }
    }

    if (restarted > 0) {
        res.json({ message: `Reiniciando ${restarted} streams Lofi. La nueva playlist de audio estará activa en segundos.` });
    } else {
         res.status(404).json({ error: "No se encontraron streams Lofi activos para reiniciar." });
    }
});


// Ruta de salud
app.get('/', (req, res) => {
    res.json({
        message: "Bot Transmisor de YouTube - Activo.",
        streamsActive: Object.keys(activeProcesses).filter(n => activeProcesses[n].process).length,
        lofiPlaylistSource: LOFI_PLAYLIST_URL
    });
});

// --- INICIO DEL SERVIDOR ---
app.listen(PORT, async () => {
    console.log(`📡 Bot Transmisor (Músculo) escuchando en puerto ${PORT}`);
    
    // Iniciar el orquestador después de un breve delay
    await orchestrateStreams();
});