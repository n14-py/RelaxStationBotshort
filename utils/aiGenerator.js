const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// --- CONFIGURACIÓN ---
const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEEPINFRA_API_URL = "https://api.deepinfra.com/v1/inference/stabilityai/sdxl-turbo";

// Rutas de archivos
const ASSETS_DIR = path.join(__dirname, '../assets');
const TEMP_IMG_PATH = path.join(__dirname, '../temp_cover.png');
const SPOTIFY_LOGO_PATH = path.join(ASSETS_DIR, 'spotify_logo.png');

/**
 * EL DIRECTOR CREATIVO: Genera todo el concepto del directo (Texto + Prompt Visual)
 */
async function generateCreativeContent() {
    console.log("🧠 [Director IA] Pensando concepto para las próximas 12 horas...");

    const webLink = process.env.WEBSITE_URL || "https://desderelaxstation.com";
    const spotifyLink = process.env.SPOTIFY_URL || "#";

    const systemPrompt = `Eres el Director Creativo de "Relax Station", una radio de Lofi Hip Hop 24/7.
    Tu trabajo es INVENTAR un escenario único para un stream de 12 horas.
    
    1. RAZONA: Elige un ambiente (Ej: "Cafetería en Tokio bajo la lluvia", "Biblioteca antigua", "Cabaña en la nieve").
    2. REDACTA: Crea un Título atractivo (con emojis) y una Descripción larga optimizada para SEO.
    3. VISUALIZA: Escribe un PROMPT detallado en INGLÉS para generar la imagen de ese escenario.
    
    Responde ÚNICAMENTE con este JSON:
    {
        "concept_reasoning": "Explica brevemente por qué elegiste este tema",
        "title": "Título del video",
        "description": "Descripción larga (min 3 párrafos)",
        "image_prompt": "Prompt detallado en inglés para SDXL (incluir: lo-fi style, aesthetic, detailed, 8k)"
    }`;

    const userPrompt = `Genera un nuevo concepto para ahora mismo. Sorpréndeme.`;

    try {
        const response = await axios.post(
            DEEPSEEK_API_URL,
            {
                model: "deepseek-chat", // Modelo económico y potente
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                response_format: { type: "json_object" },
                temperature: 0.8 // Creatividad alta
            },
            {
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}` 
                }
            }
        );

        const content = JSON.parse(response.data.choices[0].message.content);
        console.log(`💡 Concepto elegido: ${content.concept_reasoning}`);

        // INYECCIÓN DE MARKETING OBLIGATORIA
        content.description += `\n\n` +
            `👇 **LINKS OFICIALES** 👇\n` +
            `🎵 **Spotify:** ${spotifyLink}\n` +
            `🌐 **Web / Radio:** ${webLink}\n\n` +
            `📻 *Transmitiendo desde Relax Station - Tu refugio de paz.* #lofi #chill #study #relax`;

        return content;

    } catch (error) {
        console.error("❌ Error en el Director IA:", error.message);
        throw error; // Dejamos que el orquestador decida si reintentar
    }
}

/**
 * EL ARTISTA: Genera la imagen y la edita con branding
 */
async function generateBrandedImage(prompt) {
    console.log("🎨 [Artista IA] Pintando escenario: " + prompt.substring(0, 50) + "...");
    
    try {
        // 1. Generar Imagen con DeepInfra
        const response = await axios.post(
            DEEPINFRA_API_URL,
            {
                prompt: prompt,
                num_inference_steps: 4, // SDXL Turbo es rápido
                width: 1280,
                height: 720
            },
            { headers: { "Authorization": `Bearer ${process.env.DEEPINFRA_API_KEY}` } }
        );

        let imageBase64 = response.data.images?.[0]?.image_base64 || response.data.images?.[0];
        if (!imageBase64) throw new Error("No llegó imagen de DeepInfra");
        
        imageBase64 = imageBase64.replace(/^data:image\/png;base64,/, "");
        const rawBuffer = Buffer.from(imageBase64, 'base64');

        // 2. EDICIÓN GRÁFICA (SHARP)
        console.log("🖌️ [Editor] Aplicando branding y logos...");
        
        // Configurar capas (overlays)
        const compositeLayers = [];

        // A) Texto de Marca (Fondo semitransparente + Texto)
        const svgText = `
        <svg width="1280" height="720">
            <rect x="0" y="660" width="1280" height="60" fill="black" opacity="0.5" />
            <text x="50%" y="700" font-family="Arial" font-size="30" fill="white" text-anchor="middle" font-weight="bold">
                DESDE RELAX STATION
            </text>
        </svg>`;
        compositeLayers.push({ input: Buffer.from(svgText) });

        // B) Logo Spotify (Si existe)
        if (fs.existsSync(SPOTIFY_LOGO_PATH)) {
            // Redimensionamos el logo para que no sea gigante
            const logoBuffer = await sharp(SPOTIFY_LOGO_PATH)
                .resize(50, 50, { fit: 'contain' })
                .toBuffer();

            compositeLayers.push({
                input: logoBuffer,
                top: 665,  // Posición Y (abajo)
                left: 450  // Posición X (ajustado para quedar cerca del texto)
            });
        } else {
            console.warn("⚠️ No se encontró logo de Spotify en assets/. Se generará sin logo.");
        }

        // 3. Procesar y Guardar
        await sharp(rawBuffer)
            .resize(1280, 720)
            .composite(compositeLayers)
            .toFile(TEMP_IMG_PATH);

        console.log("✅ Imagen lista y guardada en:", TEMP_IMG_PATH);
        return TEMP_IMG_PATH;

    } catch (error) {
        console.error("❌ Error generando imagen:", error.message);
        return null;
    }
}

module.exports = { generateCreativeContent, generateBrandedImage };