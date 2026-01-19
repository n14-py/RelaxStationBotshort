const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * Sube un archivo local a Bunny.net Storage
 * @param {string} localPath - Ruta del archivo en el servidor (temp_cover.jpg)
 * @param {string} fileName - Nombre con el que se guardará (ej: stream_2024.jpg)
 * @returns {Promise<{url: string, path: string}>}
 */
async function uploadToBunny(localPath, fileName) {
    const storageZone = process.env.BUNNY_STORAGE_ZONE_NAME;
    const apiKey = process.env.BUNNY_STORAGE_API_KEY;
    const region = process.env.BUNNY_STORAGE_REGION || 'storage.bunnycdn.com';
    const pullZoneUrl = process.env.BUNNY_PULL_ZONE_URL;

    console.log(`☁️ [Bunny] Subiendo imagen: ${fileName}...`);

    try {
        const fileStream = fs.createReadStream(localPath);
        
        // La URL de la API de Bunny sigue este formato: https://{region}/{storageZone}/{path}/{fileName}
        const uploadUrl = `https://${region}/${storageZone}/relax-station-covers/${fileName}`;

        await axios.put(uploadUrl, fileStream, {
            headers: {
                'AccessKey': apiKey,
                'Content-Type': 'image/jpeg'
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity
        });

        const finalUrl = `${pullZoneUrl}/relax-station-covers/${fileName}`;
        console.log(`✅ [Bunny] Imagen disponible en: ${finalUrl}`);

        return {
            url: finalUrl,
            path: `relax-station-covers/${fileName}`
        };

    } catch (error) {
        console.error("❌ [Bunny] Error al subir archivo:", error.response?.data || error.message);
        throw new Error("Fallo en la subida a Bunny.net");
    }
}

module.exports = { uploadToBunny };