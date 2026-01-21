const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Configuración de APIs
const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEEPINFRA_API_URL = "https://api.deepinfra.com/v1/inference/PrunaAI/p-image";
const ASSETS_DIR = path.join(__dirname, '../assets');

// Configuración de Sharp para velocidad
sharp.cache(false);
sharp.concurrency(1);

/**
 * Genera todo el contenido para un Short: Metadatos de texto + Imagen Vertical Full HD
 */
async function generateShortData() {
    console.log("🧠 [IA] Iniciando proceso creativo para Short Vertical FHD...");

    const tempFileName = `temp_short_bg_${Date.now()}.jpg`;
    const tempFilePath = path.join(__dirname, `../${tempFileName}`);

    try {
        // -------------------------------------------------------------------------
        // 1. GENERACIÓN DE TEXTO (Título, Descripción Invitadora y Prompt)
        // -------------------------------------------------------------------------
        const websiteUrl = process.env.WEBSITE_URL;
        const spotifyUrl = process.env.SPOTIFY_URL;
        const liveUrl = process.env.LIVE_URL;

        const systemPrompt = `Eres el Social Media Manager de "Desde Relax Station".
        Tu objetivo es crear contenido viral y ATRACTIVO para YouTube Shorts.
        
        TUS TAREAS:
        1. Crea un Título corto y atractivo en ESPAÑOL (max 60 caracteres).
        2. Crea una Descripción que invite a la calma. OBLIGATORIO: Debe empezar con una frase invitando a unirse al live o a escuchar música, seguido de los links exactos:
           "¡Únete a nuestra radio 24/7 en vivo! 🔴 ${liveUrl}"
           "🎧 Escucha en Spotify: ${spotifyUrl}"
           "🌐 Nuestra Web: ${websiteUrl}"
        3. Crea un Prompt visual en INGLÉS para una imagen VERTICAL (9:16). Estilo: Anime Lofi, Nostálgico, Muy Detallado, Calidad Maestra.
        
        Responde SOLO con este JSON:
        {
            "title": "Título aquí",
            "description": "Frase de invitación aquí... \n\n🔴 Link... 🎧 Link... 🌐 Link...",
            "image_prompt": "Prompt en inglés detallado..."
        }`;

        const textResponse = await axios.post(DEEPSEEK_API_URL, {
            model: "deepseek-chat",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: "Genera un concepto nuevo y nítido." }
            ],
            response_format: { type: "json_object" }
        }, { headers: { "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}` } });

        const content = JSON.parse(textResponse.data.choices[0].message.content);
        console.log(`   📝 Título generado: "${content.title}"`);

        // -------------------------------------------------------------------------
        // 2. GENERACIÓN DE IMAGEN (Vertical Full HD 1080x1920)
        // -------------------------------------------------------------------------
        console.log("   🎨 Generando arte vertical FULL HD con PrunaAI...");
        
        // Forzamos palabras clave de alta calidad y nitidez
        const finalImagePrompt = `(Vertical orientation, 9:16 aspect ratio, 1080x1920 resolution), ${content.image_prompt}, anime style, lofi aesthetic, highly detailed, sharp focus, 8k masterpiece, cinematic lighting, no text`;

        const imgResponse = await axios.post(DEEPINFRA_API_URL, {
            prompt: finalImagePrompt,
            num_inference_steps: 30, // Unos pasos más para más detalle
            width: 1080,  // FULL HD Vertical Ancho
            height: 1920  // FULL HD Vertical Alto
        }, { headers: { "Authorization": `Bearer ${process.env.DEEPINFRA_API_KEY}` } });

        let imageBase64 = imgResponse.data.images?.[0]?.image_base64 || imgResponse.data.images?.[0];
        if (!imageBase64) throw new Error("La IA no devolvió ninguna imagen.");

        const rawBuffer = Buffer.from(imageBase64.replace(/^data:image\/png;base64,/, ""), 'base64');

        // -------------------------------------------------------------------------
        // 3. EDICIÓN Y BRANDING (Reajustado para 1080x1920)
        // -------------------------------------------------------------------------
        console.log("   🖌️ Aplicando branding en alta resolución...");

        // Ajustamos el SVG y las posiciones para el nuevo lienzo más grande (1080x1920)
        // Posición Y=1600 y fuente más grande (42)
        const svgText = Buffer.from(`
        <svg width="1080" height="1920">
            <defs>
                <filter id="shadow" x="-1" y="-1" width="3" height="3">
                    <feFlood flood-color="black" flood-opacity="0.9"/>
                    <feComposite in2="SourceGraphic" operator="in"/>
                    <feGaussianBlur stdDeviation="4"/>
                    <feOffset dx="3" dy="3" result="offsetblur"/>
                    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
            </defs>
            <text x="50%" y="1600" font-family="Arial" font-size="42" fill="white" text-anchor="middle" font-weight="bold" letter-spacing="3" filter="url(#shadow)">
                DESDE RELAX STATION
            </text>
        </svg>`);

        const layers = [{ input: svgText }];

        // Logo Spotify (Más grande y recolocado)
        const spotifyPath = path.join(ASSETS_DIR, 'spotify_logo.png');
        if (fs.existsSync(spotifyPath)) {
            // Agrandamos el logo a 60x60
            const logoBuffer = await sharp(spotifyPath).resize(60, 60).toBuffer();
            // Centrado: 1080/2 = 540. Restamos mitad del logo (30) = 510. Altura Y=1500.
            layers.push({ input: logoBuffer, top: 1500, left: 510 });
        }

        // Componemos la imagen final en alta calidad
        await sharp(rawBuffer)
            .resize(1080, 1920) // Aseguramos FHD
            .composite(layers)
            .jpeg({ quality: 98 }) // Máxima calidad JPG
            .toFile(tempFilePath);

        return {
            title: content.title,
            description: content.description,
            localImagePath: tempFilePath
        };

    } catch (error) {
        console.error("❌ Error en aiGenerator:", error.message);
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        throw error;
    }
}

module.exports = { generateShortData };