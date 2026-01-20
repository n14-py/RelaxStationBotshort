const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * Sube una imagen local al Storage de Bunny.net
 * @param {string} localFilePath - Ruta del archivo en el servidor
 * @param {string} destinationName - Nombre final del archivo (ej: stream_123.jpg)
 * @returns {Promise<{url: string, path: string}>} - URL pública y ruta interna
 */
async function uploadToBunny(localFilePath, destinationName) {
    // 1. CARGAR CREDENCIALES
    const storageZone = process.env.BUNNY_STORAGE_ZONE;
    const apiKey = process.env.BUNNY_API_KEY;
    const region = process.env.BUNNY_REGION || 'storage.bunnycdn.com';
    const pullZone = process.env.BUNNY_PULL_ZONE;

    // Validación de seguridad
    if (!storageZone || !apiKey || !pullZone) {
        throw new Error("❌ FALTAN DATOS DE BUNNY.NET EN EL ARCHIVO .ENV");
    }

    console.log(`☁️ [Bunny] Subiendo: ${destinationName}...`);

    try {
        // 2. LEER EL ARCHIVO
        const fileStream = fs.createReadStream(localFilePath);

        // 3. SUBIR A LA API DE STORAGE
        const uploadUrl = `https://${region}/${storageZone}/covers/${destinationName}`;
        
        await axios.put(uploadUrl, fileStream, {
            headers: {
                'AccessKey': apiKey,
                'Content-Type': 'image/jpeg' 
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        // 4. RETORNAR LA URL PÚBLICA (CDN)
        const publicUrl = `${pullZone}/covers/${destinationName}`;
        console.log(`✅ [Bunny] Subida exitosa: ${publicUrl}`);

        return {
            url: publicUrl,
            path: `covers/${destinationName}`
        };

    } catch (error) {
        console.error("❌ [Bunny Error]:", error.response ? error.response.data : error.message);
        throw new Error("Fallo al subir imagen a BunnyCDN");
    }
}

module.exports = { uploadToBunny };