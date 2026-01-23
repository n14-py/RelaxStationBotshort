const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// --- CONFIGURACIÓN DE APIS ---
const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEEPINFRA_API_URL = "https://api.deepinfra.com/v1/inference/PrunaAI/p-image";
const ASSETS_DIR = path.join(__dirname, '../assets');

// --- OPTIMIZACIÓN ---
sharp.cache(false);
sharp.concurrency(1);

/**
 * Genera el Short con Estilo "Directo" (Historia + Título Poético) y Escenarios Variados.
 */
async function generateShortData() {
    console.log("🧠 [IA] Iniciando proceso creativo (Modo: Estilo Directo + Variedad)...");

    const tempFileName = `temp_short_bg_${Date.now()}.jpg`;
    const tempFilePath = path.join(__dirname, `../${tempFileName}`);

    try {
        // -------------------------------------------------------------------------
        // 1. GENERACIÓN DE TEXTO (Estilo "Directo" - Historia y Creatividad)
        // -------------------------------------------------------------------------
        
        // PROMPT DEL SISTEMA: Copiado del directo pero solicitando formato JSON para Shorts
        const systemPrompt = `Eres el Director Creativo de "Relax Station", una radio Lofi 24/7.
        Tu misión es crear un concepto ÚNICO para las próximas 12 horas.
        
        ¡IMPORTANTE!: Tienes libertad creativa total. NO repitas escenarios típicos de "escritorio de estudio" o "cafetería". Imagina lugares diferentes: un tren nocturno en Japón, una cabaña en un bosque lluvioso, una azotea en una ciudad futurista, una playa al atardecer, una biblioteca antigua, un invernadero, etc. El mundo es tuyo.
        
        INSTRUCCIÓN OBLIGATORIA: Piensa, escribe y responde ÚNICAMENTE EN ESPAÑOL.
        
        Responde SOLO con este JSON:
        {
            "title": "Título atractivo en Español con emojis (max 90 chars, poético y descriptivo, NO clickbait)",
            "description": "Descripción inspiradora y atmosférica en Español que cuente una pequeña historia (min 2 párrafos)",
            "concept_reasoning": "Breve explicación en Español de por qué elegiste este escenario único",
            "scene_description": "Descripción detallada en INGLÉS de la escena física (ej: 'a cozy cabin window looking out at a rainy forest at dusk, a cat sleeping on the sill'). SOLO la escena, sin estilo."
        }`;

        const textResponse = await axios.post(DEEPSEEK_API_URL, {
            model: "deepseek-chat",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: "Sorpréndeme con un concepto nuevo y diferente para hoy." }
            ],
            response_format: { type: "json_object" }
        }, { headers: { "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}` } });

        const content = JSON.parse(textResponse.data.choices[0].message.content);
        console.log(`   💡 Concepto: ${content.concept_reasoning}`);
        console.log(`   📝 Título generado: "${content.title}"`);

        // Añadimos Tags al final de la descripción para mantener el alcance en Shorts
        content.description += `\n\n#desderelaxstation #lofi #lofimusic #relax #shorts`;

        // -------------------------------------------------------------------------
        // 2. GENERACIÓN DE IMAGEN (Estilo Directo + Formato Vertical)
        // -------------------------------------------------------------------------
        console.log("   🎨 Generando arte único con PrunaAI (Estilo Directo)...");
        
        // Prompt Maestro del "Directo" + Ajuste Vertical (9:16)
        const masterStylePrompt = `(Vertical orientation, 9:16 aspect ratio), Anime-style lofi illustration, calm and relaxing atmosphere, soft pastel colors, warm sunset lighting, dreamy sky with pink and orange clouds, cinematic lighting, peaceful mood, cozy vibes, high-quality digital art. 
        
        New original scene based on: ${content.scene_description}. 
        
        A small animal or character seen from behind (cat, dog, or person silhouette), quietly observing the scenery, creating a feeling of calm, nostalgia, and relaxation. Gentle depth of field, soft shadows, smooth brush strokes, anime background style, lofi aesthetic, ultra-detailed, clean illustration, no text.`;

        const imgResponse = await axios.post(DEEPINFRA_API_URL, {
            prompt: masterStylePrompt,
            num_inference_steps: 30, // Calidad alta
            width: 768,   // Ancho para vertical
            height: 1344  // Alto para vertical
        }, { headers: { "Authorization": `Bearer ${process.env.DEEPINFRA_API_KEY}` } });

        let imageBase64 = imgResponse.data.images?.[0]?.image_base64 || imgResponse.data.images?.[0];
        if (!imageBase64) throw new Error("La IA no devolvió imagen.");

        const rawBuffer = Buffer.from(imageBase64.replace(/^data:image\/png;base64,/, ""), 'base64');

        // -------------------------------------------------------------------------
        // 3. EDICIÓN Y BRANDING (Full HD 1080x1920 - Formato original intacto)
        // -------------------------------------------------------------------------
        console.log("   🖌️ Procesando imagen final...");

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

        const spotifyPath = path.join(ASSETS_DIR, 'spotify_logo.png');
        if (fs.existsSync(spotifyPath)) {
            const logoBuffer = await sharp(spotifyPath).resize(60, 60).toBuffer();
            // Posición original del Short
            layers.push({ input: logoBuffer, top: 1480, left: 510 });
        }

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
        if (fs.existsSync(tempFilePath)) { try { fs.unlinkSync(tempFilePath); } catch(e) {} }
        throw error;
    }
}

module.exports = { generateShortData };