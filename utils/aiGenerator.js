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
        // 1. GENERACIÓN DE TEXTO (Descripción Directa + Título Viral)
        // -------------------------------------------------------------------------
        const websiteUrl = process.env.WEBSITE_URL;
        const spotifyUrl = process.env.SPOTIFY_URL;
        const liveUrl = process.env.LIVE_URL;

        const systemPrompt = `Eres el Manager de Marketing de "Desde Relax Station".
        Tu misión es llevar tráfico al LIVE de YouTube y a Spotify.
        
        REGLAS DE ORO PARA EL TÍTULO:
        - Título corto, misterioso y viral (Clickbait emocional).
        - Ejemplo: "¿Te sientes solo?", "El sonido que cura...", "3 AM Vibes 🌑".
        
        REGLAS DE ORO PARA LA DESCRIPCIÓN (STRICT MODE):
        - La descripción NO puede empezar con poesía.
        - DEBE EMPEZAR OBLIGATORIAMENTE invitando a entrar al Live YA MISMO.
        - Estructura EXACTA requerida:
          "🔴 ¡ESTAMOS EN VIVO! Entra a relajarte aquí: ${liveUrl}"
          "🎧 Escucha nuestra Playlist en Spotify: ${spotifyUrl}"
          "🌐 Visita nuestra web: ${websiteUrl}"
          (Aquí abajo puedes poner una frase corta inspiradora sobre el título).
        
        TUS TAREAS:
        1. Generar Título.
        2. Generar Descripción con la estructura de arriba.
        3. Prompt visual en INGLÉS (Vertical, Anime Lofi Masterpiece, 8k).
        
        Responde SOLO JSON:
        {
            "title": "Título...",
            "description": "Descripción...",
            "image_prompt": "Prompt inglés..."
        }`;

        const textResponse = await axios.post(DEEPSEEK_API_URL, {
            model: "deepseek-chat",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: "Genera el siguiente Short viral." }
            ],
            response_format: { type: "json_object" }
        }, { headers: { "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}` } });

        const content = JSON.parse(textResponse.data.choices[0].message.content);
        console.log(`   📝 Título: "${content.title}"`);

        // -------------------------------------------------------------------------
        // 2. GENERACIÓN DE IMAGEN (Resolución Segura: 768x1344)
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
        // 3. EDICIÓN Y ESCALADO (Corrección: NO ESTIRAR)
        // -------------------------------------------------------------------------
        console.log("   🖌️ Escalando a FHD (Cover) y aplicando marca...");

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

        // --- AQUÍ ESTÁ EL CAMBIO CLAVE (fit: 'cover') ---
        await sharp(rawBuffer)
            .resize(1080, 1920, { 
                fit: 'cover',   // <--- ESTO EVITA QUE SE ESTIRE. Recorta lo que sobra.
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