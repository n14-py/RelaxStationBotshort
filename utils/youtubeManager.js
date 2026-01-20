const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// Rutas de autenticación
const CREDENTIALS_PATH = path.join(__dirname, '../auth/client_secret.json');
const TOKEN_PATH = path.join(__dirname, '../auth/token.json');

/**
 * Autentica y devuelve el cliente de YouTube
 */
async function getYoutubeClient() {
    // Verificaciones de seguridad
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        throw new Error(`❌ No se encuentra el archivo de credenciales en: ${CREDENTIALS_PATH}`);
    }
    if (!fs.existsSync(TOKEN_PATH)) {
        throw new Error("❌ NO HAY TOKEN. Ejecuta 'npm run auth' primero.");
    }

    // Cargar credenciales
    const content = fs.readFileSync(CREDENTIALS_PATH);
    const credentials = JSON.parse(content);
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    
    // Configurar cliente OAuth2
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    
    // Cargar Token
    const token = fs.readFileSync(TOKEN_PATH);
    oAuth2Client.setCredentials(JSON.parse(token));
    
    return google.youtube({ version: 'v3', auth: oAuth2Client });
}

/**
 * Crea la emisión en YouTube, genera la clave RTMP y guarda todo en MongoDB
 * @param {Object} streamDoc - El documento del stream de MongoDB
 */
async function createYoutubeBroadcast(streamDoc) {
    console.log("📡 [YouTube] Conectando para crear evento...");

    try {
        const youtube = await getYoutubeClient();
        
        // 1. Crear Broadcast (El "Evento" público)
        const broadcastRes = await youtube.liveBroadcasts.insert({
            part: 'snippet,status,contentDetails',
            requestBody: {
                snippet: {
                    title: streamDoc.title.substring(0, 100), // YouTube limita a 100 caracteres
                    description: streamDoc.description,
                    scheduledStartTime: new Date().toISOString()
                },
                status: {
                    privacyStatus: 'public', // 'public', 'unlisted' o 'private'
                    selfDeclaredMadeForKids: false
                },
                contentDetails: {
                    enableAutoStart: true, // Empieza solo al recibir video
                    enableAutoStop: true,  // Termina solo al cortar video
                    latencyPreference: 'normal'
                }
            }
        });

        const broadcastId = broadcastRes.data.id;
        console.log(`   ✅ Evento creado ID: ${broadcastId}`);

        // 2. Crear Stream (La "Llave" de transmisión)
        const streamRes = await youtube.liveStreams.insert({
            part: 'snippet,cdn',
            requestBody: {
                snippet: { title: `Key Auto ${Date.now()}` },
                cdn: {
                    ingestionType: 'rtmp',
                    resolution: '1080p',
                    frameRate: '30fps' 
                }
            }
        });

        const streamId = streamRes.data.id;
        const ingestionInfo = streamRes.data.cdn.ingestionInfo;
        
        // Construimos la URL RTMP completa
        const rtmpUrl = `${ingestionInfo.ingestionAddress}/${ingestionInfo.streamName}`;
        
        console.log(`   ✅ Llave RTMP generada.`);

        // 3. Unir (Bind) el Evento con la Llave
        await youtube.liveBroadcasts.bind({
            part: 'id,contentDetails',
            id: broadcastId,
            streamId: streamId
        });

        // 4. ACTUALIZAR BASE DE DATOS (Persistencia)
        streamDoc.youtube_broadcast_id = broadcastId;
        streamDoc.youtube_stream_id = streamId;
        streamDoc.youtube_rtmp_url = rtmpUrl;
        
        await streamDoc.save();
        console.log("   💾 Datos de YouTube guardados en MongoDB.");

        return streamDoc;

    } catch (error) {
        console.error("❌ Error API YouTube:", error.message);
        if (error.response) {
            console.error("Detalle API:", JSON.stringify(error.response.data, null, 2));
        }
        throw error;
    }
}

// ESTA LÍNEA FINAL ES LA QUE ARREGLA EL ERROR "NOT A FUNCTION"
module.exports = { createYoutubeBroadcast };