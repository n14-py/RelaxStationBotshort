const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * Sube un archivo (video o imagen) a Bunny.net Storage
 * @param {string} localPath - Ruta del archivo en el disco
 * @param {string} fileName - Nombre con el que se guardará en la nube
 * @returns {Object} { url: string, path: string }
 */
async function uploadToBunny(localPath, fileName) {
    // 1. Cargamos credenciales del .env
    const storageZone = process.env.BUNNY_STORAGE_ZONE;
    const apiKey = process.env.BUNNY_API_KEY;
    const pullZone = process.env.BUNNY_PULL_ZONE;
    const region = process.env.BUNNY_REGION || 'storage.bunnycdn.com';

    // Definimos la carpeta: "shorts" para videos, "covers" para imágenes
    const isVideo = fileName.endsWith('.mp4');
    const folder = isVideo ? 'shorts' : 'covers';
    const bunnyPath = `/${folder}/${fileName}`;
    
    // URL de subida (API)
    const uploadUrl = `https://${region}/${storageZone}${bunnyPath}`;

    console.log(`☁️ [Bunny] Subiendo archivo: ${fileName}...`);

    try {
        const fileStream = fs.createReadStream(localPath);

        // 2. Subimos el archivo con Axios
        await axios.put(uploadUrl, fileStream, {
            headers: {
                'AccessKey': apiKey,
                'Content-Type': isVideo ? 'application/octet-stream' : 'image/jpeg'
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        // 3. Construimos la URL pública para descargar
        // Nota: Quitamos la barra final del pullzone si la tiene para evitar dobles barras //
        const cleanPullZone = pullZone.replace(/\/$/, '');
        const publicUrl = `${cleanPullZone}${bunnyPath}`;
        
        console.log(`✅ [Bunny] Subida completada: ${publicUrl}`);
        
        return {
            url: publicUrl, // URL para ver/descargar
            storagePath: bunnyPath // Ruta interna por si queremos borrarlo luego
        };

    } catch (error) {
        console.error("❌ Error subiendo a Bunny:", error.response ? error.response.data : error.message);
        throw new Error("Fallo en la subida a la nube.");
    }
}

/**
 * Borra un archivo de Bunny.net (Útil para limpiar videos viejos si quieres)
 */
async function deleteFromBunny(storagePath) {
    const storageZone = process.env.BUNNY_STORAGE_ZONE;
    const apiKey = process.env.BUNNY_API_KEY;
    const region = process.env.BUNNY_REGION || 'storage.bunnycdn.com';
    
    const deleteUrl = `https://${region}/${storageZone}${storagePath}`;

    try {
        await axios.delete(deleteUrl, {
            headers: { 'AccessKey': apiKey }
        });
        console.log(`🗑️ [Bunny] Archivo eliminado: ${storagePath}`);
    } catch (error) {
        console.error(`⚠️ No se pudo borrar de Bunny: ${error.message}`);
    }
}

module.exports = { uploadToBunny, deleteFromBunny };