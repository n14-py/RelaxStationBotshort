const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// --- CONFIGURACIÓN DE APIS ---
const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEEPINFRA_API_URL = "https://api.deepinfra.com/v1/inference/PrunaAI/p-image";
const ASSETS_DIR = path.join(__dirname, '../assets');

// --- OPTIMIZACIÓN DE IMAGEN ---
sharp.cache(false);
sharp.concurrency(1);

/**
 * Genera el concepto (Texto) y la Imagen (Visual) para el Short.
 * ADAPTADO: Usa el mismo estilo visual que la Radio en Vivo pero en Vertical.
 */
async function generateShortData() {
    console.log("🧠 [IA] Iniciando proceso creativo (Estilo Radio Original)...");

    const tempFileName = `temp_short_bg_${Date.now()}.jpg`;
    const tempFilePath = path.join(__dirname, `../${tempFileName}`);

    try {
        // -------------------------------------------------------------------------
        // 1. GENERACIÓN DE TEXTO (Título Viral + Descripción Invitadora)
        // -------------------------------------------------------------------------
        const websiteUrl = process.env.WEBSITE_URL;
        
        const systemPrompt = `Eres el Director Creativo de "Desde Relax Station".
        Tu objetivo es llevar a la gente del Short al PERFIL para ver el LIVE.
        
        REGLAS PARA EL TÍTULO:
        - Título corto, emotivo y misterioso (Max 50 caracteres).
        - SIN enlaces, SIN hashtags, SIN la palabra "Shorts".
        - Ejemplo: "¿Te sientes solo?", "La paz que buscabas...", "3:00 AM Vibes 🌑".
        
        REGLAS PARA LA DESCRIPCIÓN (OBLIGATORIO):
        - Primera línea EXACTA: "🔴 ¡ESTAMOS EN VIVO! Entra a nuestro PERFIL para escuchar la radio 24/7."
        - Luego una frase corta sobre la imagen.
        - Al final SOLO estos hashtags: #desderelaxstation #lofi #chill
        
        TUS TAREAS:
        1. Título Limpio.
        2. Descripción Estratégica.
        3. Prompt Visual (Estilo Ghibli/Lofi Anime, Nostálgico, Detallado).
           NOTA: La imagen debe describir un lugar tranquilo (habitación, tren, bosque, ciudad lluviosa).
        
        Responde SOLO JSON:
        {
            "title": "Título...",
            "description": "Descripción...",
            "image_prompt": "Prompt visual detallado en inglés..."
        }`;

        const textResponse = await axios.post(DEEPSEEK_API_URL, {
            model: "deepseek-chat",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: "Genera una escena nostálgica y viral." }
            ],
            response_format: { type: "json_object" }
        }, { headers: { "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}` } });

        const content = JSON.parse(textResponse.data.choices[0].message.content);
        console.log(`   📝 Título: "${content.title}"`);

        // -------------------------------------------------------------------------
        // 2. GENERACIÓN DE IMAGEN (Estilo Radio Clonado)
        // -------------------------------------------------------------------------
        console.log("   🎨 Generando arte con PrunaAI (Estilo Original)...");
        
        // --- LA FÓRMULA DEL ESTILO (CLONADA DEL LIVE) ---
        // Combinamos tu prompt dinámico con las texturas del live:
        // "Anime style, Makoto Shinkai vibe, highly detailed, 8k, soft lighting"
        
        const masterStyle = "anime style, lofi aesthetic, highly detailed, 8k resolution, cinematic lighting, makoto shinkai style, soft pastel colors, nostalgic atmosphere, sharp focus, masterpiece, no text";
        
        const finalImagePrompt = `(Vertical orientation, 9:16 aspect ratio), ${content.image_prompt}, ${masterStyle}`;

        const imgResponse = await axios.post(DEEPINFRA_API_URL, {
            prompt: finalImagePrompt,
            num_inference_steps: 30, // Calidad alta
            width: 768,   // Ancho seguro para la IA
            height: 1344  // Alto seguro para la IA (Vertical)
        }, { headers: { "Authorization": `Bearer ${process.env.DEEPINFRA_API_KEY}` } });

        let imageBase64 = imgResponse.data.images?.[0]?.image_base64 || imgResponse.data.images?.[0];
        if (!imageBase64) throw new Error("La IA no devolvió imagen.");

        const rawBuffer = Buffer.from(imageBase64.replace(/^data:image\/png;base64,/, ""), 'base64');

        // -------------------------------------------------------------------------
        // 3. EDICIÓN Y ESCALADO (A 1080x1920 FHD con Branding)
        // -------------------------------------------------------------------------
        console.log("   🖌️ Escalando a FHD y aplicando marca...");

        // SVG del texto "DESDE RELAX STATION"
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

        // Logo de Spotify
        const spotifyPath = path.join(ASSETS_DIR, 'spotify_logo.png');
        if (fs.existsSync(spotifyPath)) {
            const logoBuffer = await sharp(spotifyPath).resize(60, 60).toBuffer();
            // Posición centrada encima del texto
            layers.push({ input: logoBuffer, top: 1480, left: 510 });
        }

        // Procesamiento Final: Ajuste 'cover' para llenar 1080x1920 sin deformar
        await sharp(rawBuffer)
            .resize(1080, 1920, { 
                fit: 'cover', 
                position: 'center' 
            }) 
            .composite(layers)
            .jpeg({ quality: 100 }) 
            .toFile(tempFilePath);

        return {
            title: content.title,
            description: content.description,
            localImagePath: tempFilePath
        };

    } catch (error) {
        const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error("❌ Error en aiGenerator:", errorMsg);
        
        // Limpieza si falló
        if (fs.existsSync(tempFilePath)) {
            try { fs.unlinkSync(tempFilePath); } catch(e) {}
        }
        throw error;
    }
}

module.exports = { generateShortData };