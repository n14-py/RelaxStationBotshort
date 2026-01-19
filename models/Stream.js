const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * Sube una imagen local al Storage de Bunny.net
 * @param {string} localFilePath - Ruta absoluta del archivo en el disco (ej: /app/temp.jpg)
 * @param {string} destinationName - Nombre final del archivo (ej: stream_12345.jpg)
 * @returns {Promise<{url: string, path: string}>} - La URL pública y la ruta interna
 */
async function uploadToBunny(localFilePath, destinationName) {
    // 1. OBTENER CONFIGURACIÓN
    const storageZone = process.env.BUNNY_STORAGE_ZONE;
    const apiKey = process.env.BUNNY_API_KEY;
    const region = process.env.BUNNY_REGION || 'storage.bunnycdn.com'; // Por defecto
    const pullZone = process.env.BUNNY_PULL_ZONE;

    if (!storageZone || !apiKey || !pullZone) {
        throw new Error("❌ Faltan credenciales de Bunny.net en el archivo .env");
    }

    console.log(`☁️ [Bunny] Iniciando subida: ${destinationName}...`);

    try {
        // 2. LEER ARCHIVO DEL DISCO
        const fileStream = fs.createReadStream(localFilePath);

        // 3. CONSTRUIR URL DE SUBIDA (API STORAGE)
        // Formato: https://{region}/{storageZoneName}/{path}/{fileName}
        const uploadUrl = `https://${region}/${storageZone}/covers/${destinationName}`;

        // 4. EJECUTAR SUBIDA (PUT)
        await axios.put(uploadUrl, fileStream, {
            headers: {
                'AccessKey': apiKey,
                'Content-Type': 'image/jpeg' // Asumimos JPG para ahorrar espacio
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        // 5. CONSTRUIR URL PÚBLICA (CDN)
        const publicUrl = `${pullZone}/covers/${destinationName}`;
        
        console.log(`✅ [Bunny] Subida exitosa: ${publicUrl}`);

        return {
            url: publicUrl,
            path: `covers/${destinationName}`
        };

    } catch (error) {
        console.error("❌ [Bunny Error]:", error.response ? error.response.data : error.message);
        throw new Error("Fallo al subir imagen a Bunny.net");
    }
}

module.exports = { uploadToBunny };