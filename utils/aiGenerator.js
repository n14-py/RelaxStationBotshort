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
 * Genera todo el contenido para un Short: Metadatos de texto + Imagen Vertical Editada
 */
async function generateShortData() {
    console.log("🧠 [IA] Iniciando proceso creativo para Short Vertical...");

    const tempFileName = `temp_short_bg_${Date.now()}.jpg`;
    const tempFilePath = path.join(__dirname, `../${tempFileName}`);

    try {
        // -------------------------------------------------------------------------
        // 1. GENERACIÓN DE TEXTO (Título, Descripción Viral y Prompt de Imagen)
        // -------------------------------------------------------------------------
        const websiteUrl = process.env.WEBSITE_URL;
        const spotifyUrl = process.env.SPOTIFY_URL;
        const liveUrl = process.env.LIVE_URL;

        const systemPrompt = `Eres el Social Media Manager de "Relax Station", una radio Lofi 24/7.
        Tu objetivo es crear contenido viral para YouTube Shorts, TikTok e Instagram Reels.
        
        TUS TAREAS:
        1. Crea un Título corto y atractivo en ESPAÑOL (max 60 caracteres).
        2. Crea una Descripción que invite a la calma. DEBE incluir obligatoriamente estas frases exactas al final:
           "🔴 ESTAMOS EN VIVO AHORA: ${liveUrl}"
           "🎧 Escucha en Spotify: ${spotifyUrl}"
           "🌐 Nuestra Web: ${websiteUrl}"
        3. Crea un Prompt visual en INGLÉS para una imagen VERTICAL (9:16). Estilo: Anime Lofi, Nostálgico, Detallado.
           (Ejemplos: "Vertical anime art, view from a rainy window at night", "Girl reading on a balcony at sunset").
        
        Responde SOLO con este JSON:
        {
            "title": "Título aquí",
            "description": "Descripción aquí...",
            "image_prompt": "Prompt en inglés aquí..."
        }`;

        const textResponse = await axios.post(DEEPSEEK_API_URL, {
            model: "deepseek-chat",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: "Genera un concepto nuevo para un video corto." }
            ],
            response_format: { type: "json_object" }
        }, { headers: { "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}` } });

        const content = JSON.parse(textResponse.data.choices[0].message.content);
        console.log(`   📝 Título generado: "${content.title}"`);

        // -------------------------------------------------------------------------
        // 2. GENERACIÓN DE IMAGEN (Vertical 720x1280)
        // -------------------------------------------------------------------------
        console.log("   🎨 Generando arte vertical con PrunaAI...");
        
        // Forzamos las palabras clave de estilo en el prompt
        const finalImagePrompt = `(Vertical orientation, 9:16 aspect ratio), ${content.image_prompt}, anime style, lofi aesthetic, highly detailed, 8k, soft lighting, relaxing atmosphere, no text`;

        const imgResponse = await axios.post(DEEPINFRA_API_URL, {
            prompt: finalImagePrompt,
            num_inference_steps: 25,
            width: 720,  // Ancho móvil
            height: 1280 // Alto móvil
        }, { headers: { "Authorization": `Bearer ${process.env.DEEPINFRA_API_KEY}` } });

        let imageBase64 = imgResponse.data.images?.[0]?.image_base64 || imgResponse.data.images?.[0];
        if (!imageBase64) throw new Error("La IA no devolvió ninguna imagen.");

        const rawBuffer = Buffer.from(imageBase64.replace(/^data:image\/png;base64,/, ""), 'base64');

        // -------------------------------------------------------------------------
        // 3. EDICIÓN Y BRANDING (Sharp)
        // -------------------------------------------------------------------------
        console.log("   🖌️ Aplicando branding y logo de Spotify...");

        // Creamos el texto SVG con sombra para que se lea bien sobre cualquier fondo
        // Posición Y=1050 es ideal para que no lo tapen los botones de descripción de TikTok/Shorts
        const svgText = Buffer.from(`
        <svg width="720" height="1280">
            <defs>
                <filter id="shadow" x="-1" y="-1" width="3" height="3">
                    <feFlood flood-color="black" flood-opacity="0.9"/>
                    <feComposite in2="SourceGraphic" operator="in"/>
                    <feGaussianBlur stdDeviation="3"/>
                    <feOffset dx="2" dy="2" result="offsetblur"/>
                    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
            </defs>
            <text x="50%" y="1050" font-family="Arial" font-size="28" fill="white" text-anchor="middle" font-weight="bold" letter-spacing="2" filter="url(#shadow)">
                DESDE RELAX STATION
            </text>
        </svg>`);

        const layers = [{ input: svgText }];

        // Añadimos el Logo de Spotify (Pequeño, centrado encima del texto)
        const spotifyPath = path.join(ASSETS_DIR, 'spotify_logo.png');
        if (fs.existsSync(spotifyPath)) {
            const logoBuffer = await sharp(spotifyPath).resize(40, 40).toBuffer();
            // Calculamos posición para centrarlo (720/2 - 20 = 340) y ponerlo encima del texto (y=1000)
            layers.push({ input: logoBuffer, top: 960, left: 340 });
        }

        // Componemos la imagen final
        await sharp(rawBuffer)
            .resize(720, 1280) // Aseguramos dimensiones
            .composite(layers)
            .jpeg({ quality: 95 })
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