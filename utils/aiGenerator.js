const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const Stream = require('../models/Stream');
const { uploadToBunny } = require('./bunnyHandler');

// --- CONFIGURACIÓN ---
sharp.cache(false);
sharp.concurrency(1);

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
// Usamos el modelo PrunaAI como pediste
const DEEPINFRA_API_URL = "https://api.deepinfra.com/v1/inference/PrunaAI/p-image";
const ASSETS_DIR = path.join(__dirname, '../assets');

/**
 * Genera contenido (Español), Crea Imagen (Pruna), Edita (Logo Izq) y Sube a Bunny.
 */
async function prepareNextStream() {
    console.log("🧠 [Director IA] Iniciando proceso creativo...");

    const tempFileName = `cover_${Date.now()}.jpg`;
    const tempFilePath = path.join(__dirname, `../${tempFileName}`);

    try {
        // ---------------------------------------------------------
        // 1. GENERACIÓN DE TEXTO (EN ESPAÑOL)
        // ---------------------------------------------------------
        console.log("   > Consultando a DeepSeek...");
        const webLink = process.env.WEBSITE_URL || "https://desderelaxstation.com";
        const spotifyLink = process.env.SPOTIFY_URL || "#";

        const systemPrompt = `Eres el Director Creativo de "Relax Station", una radio Lofi 24/7.
        Tu misión es crear un concepto único para las próximas 12 horas.
        
        INSTRUCCIÓN OBLIGATORIA: Piensa, escribe y responde ÚNICAMENTE EN ESPAÑOL.
        
        Responde SOLO con este JSON:
        {
            "title": "Título atractivo en Español con emojis (max 90 chars)",
            "description": "Descripción inspiradora en Español (min 3 párrafos)",
            "concept_reasoning": "Breve explicación en Español de por qué elegiste este tema",
            "image_prompt": "Prompt detallado en INGLÉS para generar imagen (lofi style, aesthetic, 8k, detailed, cozy)"
        }`;

        const textResponse = await axios.post(DEEPSEEK_API_URL, {
            model: "deepseek-chat",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: "Genera un nuevo concepto ahora." }
            ],
            response_format: { type: "json_object" }
        }, { headers: { "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}` } });

        const content = JSON.parse(textResponse.data.choices[0].message.content);
        
        // Footer de marketing
        content.description += `\n\n👇 **LINKS OFICIALES** 👇\n🎧 Spotify: ${spotifyLink}\n🌐 Web: ${webLink}\n\n📻 *Transmitiendo desde Relax Station*`;

        console.log(`   💡 Concepto: ${content.concept_reasoning}`);

        // ---------------------------------------------------------
        // 2. GENERACIÓN DE IMAGEN (DEEPINFRA - PRUNA)
        // ---------------------------------------------------------
        console.log("   > Generando imagen con DeepInfra (PrunaAI)...");
        
        const imgResponse = await axios.post(DEEPINFRA_API_URL, {
            prompt: content.image_prompt,
            num_inference_steps: 25, 
            width: 1024, 
            height: 768  
        }, { headers: { "Authorization": `Bearer ${process.env.DEEPINFRA_API_KEY}` } });

        let imageBase64 = imgResponse.data.images?.[0]?.image_base64 || imgResponse.data.images?.[0];
        if (!imageBase64) throw new Error("DeepInfra no devolvió imagen.");

        const rawBuffer = Buffer.from(imageBase64.replace(/^data:image\/png;base64,/, ""), 'base64');

        // ---------------------------------------------------------
        // 3. EDICIÓN GRÁFICA (LOGO A LA IZQUIERDA)
        // ---------------------------------------------------------
        console.log("   > Editando imagen...");

        // Ajustamos lienzo a 1280x720
        const resizedBuffer = await sharp(rawBuffer).resize(1280, 720).toBuffer();

        // TEXTO: Centrado abajo, pequeño, elegante, con sombra para que se lea sin cuadro negro
        const svgText = Buffer.from(`
        <svg width="1280" height="720">
            <defs>
                <filter id="shadow" x="-1" y="-1" width="3" height="3">
                    <feFlood flood-color="black" flood-opacity="0.9"/>
                    <feComposite in2="SourceGraphic" operator="in"/>
                    <feGaussianBlur stdDeviation="2"/>
                    <feOffset dx="2" dy="2" result="offsetblur"/>
                    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
            </defs>
            <text x="50%" y="695" font-family="Arial" font-size="20" fill="white" text-anchor="middle" font-weight="bold" letter-spacing="3" filter="url(#shadow)">
                DESDE RELAX STATION
            </text>
        </svg>`);

        const layers = [{ input: svgText }];

        // LOGO SPOTIFY: A la IZQUIERDA (separado del texto)
        const spotifyPath = path.join(ASSETS_DIR, 'spotify_logo.png');
        if (fs.existsSync(spotifyPath)) {
            const logoBuffer = await sharp(spotifyPath).resize(32, 32).toBuffer();
            
            // Posición:
            // left: 480 -> Bastante a la izquierda del centro (640) para no tocar el texto
            // top: 672 -> Alineado verticalmente con el texto
            layers.push({ input: logoBuffer, top: 672, left: 425 });
        }

        await sharp(resizedBuffer)
            .composite(layers)
            .jpeg({ quality: 90, mozjpeg: true })
            .toFile(tempFilePath);

        // ---------------------------------------------------------
        // 4. SUBIDA A BUNNY Y GUARDADO EN DB
        // ---------------------------------------------------------
        console.log("   > Subiendo a Bunny.net...");
        const bunnyData = await uploadToBunny(tempFilePath, tempFileName);

        console.log("   > Guardando en MongoDB...");
        const newStream = new Stream({
            title: content.title,
            description: content.description,
            concept_reasoning: content.concept_reasoning,
            image_prompt: content.image_prompt,
            bunny_image_url: bunnyData.url,
            bunny_file_path: bunnyData.path,
            status: 'READY'
        });

        await newStream.save();
        
        console.log("✅ ¡CONTENIDO LISTO!");
        console.log(`   ID: ${newStream._id}`);

        // Borramos el archivo temporal
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

        return newStream;

    } catch (error) {
        console.error("❌ Error Generación IA:", error.message);
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        throw error;
    }
}

module.exports = { prepareNextStream };