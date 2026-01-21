const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Configuración de APIs
const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEEPINFRA_API_URL = "https://api.deepinfra.com/v1/inference/PrunaAI/p-image";
const ASSETS_DIR = path.join(__dirname, '../assets');

// Configuración de Sharp
sharp.cache(false);
sharp.concurrency(1);

async function generateShortData() {
    console.log("🧠 [IA] Iniciando proceso creativo...");

    const tempFileName = `temp_short_bg_${Date.now()}.jpg`;
    const tempFilePath = path.join(__dirname, `../${tempFileName}`);

    try {
        // -------------------------------------------------------------------------
        // 1. GENERACIÓN DE TEXTO (Reglas Estrictas del Usuario)
        // -------------------------------------------------------------------------
        const websiteUrl = process.env.WEBSITE_URL;
        
        const systemPrompt = `Eres el Community Manager de "Relax Station".
        Tu único objetivo es que la gente entre al PERFIL del canal para ver el Directo.
        
        REGLAS DE ORO PARA EL TÍTULO:
        - SOLO texto corto y viral.
        - PROHIBIDO poner enlaces o hashtags en el título.
        - PROHIBIDO poner "#Shorts".
        - Ejemplo: "¿Necesitas paz?", "El sonido perfecto...", "Lluvia para dormir 🌧️".
        
        REGLAS DE ORO PARA LA DESCRIPCIÓN:
        - Debe empezar OBLIGATORIAMENTE con esta invitación:
          "🔴 ¡ESTAMOS EN DIRECTO! Entra ahora a nuestro PERFIL/CANAL para escuchar la radio 24/7."
        - Luego una frase corta sobre el video.
        - Al final, añade ÚNICAMENTE estos hashtags:
          #desderelaxstation #lofi
        
        TUS TAREAS:
        1. Título Limpio (Sin tags).
        2. Descripción con la invitación al perfil y los hashtags.
        3. Prompt visual en INGLÉS (Vertical, Anime Lofi Masterpiece, 8k).
        
        Responde SOLO JSON:
        {
            "title": "Título limpio...",
            "description": "Descripción con invitación y hashtags...",
            "image_prompt": "Prompt inglés..."
        }`;

        const textResponse = await axios.post(DEEPSEEK_API_URL, {
            model: "deepseek-chat",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: "Genera el Short." }
            ],
            response_format: { type: "json_object" }
        }, { headers: { "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}` } });

        const content = JSON.parse(textResponse.data.choices[0].message.content);
        console.log(`   📝 Título: "${content.title}"`);

        // -------------------------------------------------------------------------
        // 2. GENERACIÓN DE IMAGEN (768x1344 - Zona Segura)
        // -------------------------------------------------------------------------
        console.log("   🎨 Generando arte con PrunaAI (768x1344)...");
        
        const finalImagePrompt = `(Vertical orientation, 9:16 aspect ratio), ${content.image_prompt}, anime style, lofi aesthetic, 8k resolution, highly detailed, sharp focus, cinematic lighting, masterpiece, no text`;

        const imgResponse = await axios.post(DEEPINFRA_API_URL, {
            prompt: finalImagePrompt,
            num_inference_steps: 30,
            width: 768, 
            height: 1344
        }, { headers: { "Authorization": `Bearer ${process.env.DEEPINFRA_API_KEY}` } });

        let imageBase64 = imgResponse.data.images?.[0]?.image_base64 || imgResponse.data.images?.[0];
        if (!imageBase64) throw new Error("La IA no devolvió imagen.");

        const rawBuffer = Buffer.from(imageBase64.replace(/^data:image\/png;base64,/, ""), 'base64');

        // -------------------------------------------------------------------------
        // 3. EDICIÓN Y ESCALADO (1080x1920 FHD - Ajuste Cover)
        // -------------------------------------------------------------------------
        console.log("   🖌️ Escalando a FHD y aplicando marca...");

        // SVG Ajustado
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

        // Logo Spotify
        const spotifyPath = path.join(ASSETS_DIR, 'spotify_logo.png');
        if (fs.existsSync(spotifyPath)) {
            const logoBuffer = await sharp(spotifyPath).resize(60, 60).toBuffer();
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
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        throw error;
    }
}

module.exports = { generateShortData };