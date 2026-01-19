const { getYoutubeClient } = require('../auth/youtubeClient');

/**
 * Crea un evento en vivo completo en YouTube (Broadcast + Stream)
 * Configurado para Auto-Start y Auto-Stop.
 * @param {string} title - Título del video
 * @param {string} description - Descripción del video
 * @returns {Promise<{broadcastId: string, streamId: string, rtmpUrl: string}>}
 */
async function createBroadcast(title, description) {
    console.log("📡 [YouTube API] Conectando para crear nuevo evento...");
    
    try {
        const youtube = await getYoutubeClient();

        // 1. Crear el Broadcast (La "Sala" del evento)
        // Habilitamos autoStart y autoStop para que no tengamos que gestionar estados manualmente
        const broadcastRes = await youtube.liveBroadcasts.insert({
            part: 'snippet,status,contentDetails',
            requestBody: {
                snippet: {
                    title: title.substring(0, 100), // YouTube corta a 100 chars
                    description: description,
                    scheduledStartTime: new Date().toISOString()
                },
                status: {
                    privacyStatus: 'public', // 'public', 'unlisted', o 'private'
                    selfDeclaredMadeForKids: false
                },
                contentDetails: {
                    enableAutoStart: true, // ¡IMPORTANTE! Empieza en cuanto FFmpeg manda datos
                    enableAutoStop: true,  // ¡IMPORTANTE! Termina el directo cuando FFmpeg se apaga
                    enableDvr: true,       // Permite retroceder en el directo
                    latencyPreference: 'normal', // 'normal' para mejor calidad (buffer más grande)
                    closedCaptionsType: 'closedCaptionsDisabled'
                }
            }
        });

        const broadcastId = broadcastRes.data.id;
        console.log(`   ✅ Evento creado. ID: ${broadcastId}`);

        // 2. Crear el Stream (La "Llave" técnica)
        // Usamos resolución variable para que acepte nuestro video a 1 FPS sin quejarse
        const streamRes = await youtube.liveStreams.insert({
            part: 'snippet,cdn',
            requestBody: {
                snippet: {
                    title: `Key para: ${title.substring(0, 20)}...`
                },
                cdn: {
                    ingestionType: 'rtmp',
                    resolution: 'variable', // Flexible para nuestra optimización extrema
                    frameRate: 'variable'
                }
            }
        });

        const streamId = streamRes.data.id;
        const ingestionInfo = streamRes.data.cdn.ingestionInfo;
        const rtmpUrl = `${ingestionInfo.ingestionAddress}/${ingestionInfo.streamName}`;
        
        console.log(`   ✅ Llave de transmisión obtenida.`);

        // 3. Vincular el Evento con la Llave
        await youtube.liveBroadcasts.bind({
            part: 'id,contentDetails',
            id: broadcastId,
            streamId: streamId
        });
        
        console.log("   🔗 Evento y Llave vinculados correctamente.");

        return {
            broadcastId,
            streamId,
            rtmpUrl
        };

    } catch (error) {
        console.error("❌ ERROR CRÍTICO en YouTube Manager:", error.message);
        if (error.response) {
            console.error("   Detalle API:", JSON.stringify(error.response.data, null, 2));
        }
        throw error;
    }
}

module.exports = { createBroadcast };