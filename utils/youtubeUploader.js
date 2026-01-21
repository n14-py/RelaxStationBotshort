const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

/**
 * Sube un video local a YouTube como Short
 */
async function uploadToYouTube(videoPath, title, description) {
    console.log("🚀 [YouTube] Iniciando subida...");

    try {
        // 1. Autenticación
        const authClient = await getAuthClient();

        const youtube = google.youtube({ version: 'v3', auth: authClient });

        // 2. Metadatos del video
        // Nota: Agregamos #Shorts para asegurar que YouTube lo detecte
        const finalTitle = title.length > 90 ? title.substring(0, 90) : title;
        
        const requestBody = {
            snippet: {
                title: `${finalTitle} #Shorts`,
                description: description,
                tags: ['lofi', 'relax', 'shorts', 'anime', 'chill'],
                categoryId: '10' // Categoría: Música
            },
            status: {
                privacyStatus: 'public', // 'public', 'private', o 'unlisted'
                selfDeclaredMadeForKids: false
            }
        };

        const media = {
            body: fs.createReadStream(videoPath)
        };

        // 3. Subir el archivo
        const response = await youtube.videos.insert({
            part: 'snippet,status',
            requestBody: requestBody,
            media: media
        });

        console.log(`✅ [YouTube] Subida exitosa! ID: ${response.data.id}`);
        return response.data.id;

    } catch (error) {
        console.error("❌ Error subiendo a YouTube:", error.message);
        throw error;
    }
}

/**
 * Ayuda a autenticar usando los archivos de la carpeta auth
 */
async function getAuthClient() {
    const tokenPath = path.join(__dirname, '../auth/token.json');
    const secretPath = path.join(__dirname, '../auth/client_secret.json');

    if (!fs.existsSync(tokenPath) || !fs.existsSync(secretPath)) {
        throw new Error("Faltan archivos de credenciales (token.json o client_secret.json)");
    }

    const content = fs.readFileSync(secretPath);
    const credentials = JSON.parse(content);
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    
    const token = fs.readFileSync(tokenPath);
    oAuth2Client.setCredentials(JSON.parse(token));

    return oAuth2Client;
}

module.exports = { uploadToYouTube };