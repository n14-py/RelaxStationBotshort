const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const Stream = require('../models/Stream');
const { uploadToBunny } = require('./bunnyHandler');

// --- CONFIGURACIÓN DE EFICIENCIA ---
sharp.cache(false);
sharp.concurrency(1);

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
// ✅ CAMBIO 1: Nuevo modelo de DeepInfra (PrunaAI/p-image)
const DEEPINFRA_API_URL = "https://api.deepinfra.com/v1/inference/PrunaAI/p-image";
const ASSETS_DIR = path.join(__dirname, '../assets');

/**
 * FUNCIÓN PRINCIPAL: Genera, Edita, Sube y Guarda.
 */
async function prepareNextStream() {
    console.log("🧠 [Director IA] Iniciando proceso creativo...");

    const tempFileName = `cover_${Date.now()}.jpg`;
    const tempFilePath = path.join(__dirname, `../${tempFileName}`);

    try {
        // 1. GENERACIÓN DE TEXTO (DEEPSEEK)
        console.log("   > Consultando a DeepSeek...");
        const webLink = process.env.WEBSITE_URL || "https://desderelaxstation.com";
        const spotifyLink = process.env.SPOTIFY_URL || "#";

        const systemPrompt = `Eres el Director Creativo de "Relax Station", una radio Lofi 24/7.
        Tu misión es crear un concepto único para las próximas 12 horas.
        
        Responde ÚNICAMENTE con este JSON:
        {
            "title": "Título atractivo con emojis (max 90 chars)",
            "description": "Descripción inspiradora (min 3 párrafos)",
            "concept_reasoning": "Breve explicación de por qué elegiste este tema",
            "image_prompt": "Prompt detallado en inglés para generar imagen (lofi style, aesthetic, 8k, detailed)"
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
        content.description += `\n\n👇 **LINKS OFICIALES** 👇\n🎧 Spotify: ${spotifyLink}\n🌐 Web: ${webLink}\n\n📻 *Transmitiendo desde Relax Station*`;

        console.log(`   💡 Concepto: ${content.concept_reasoning}`);

        // 2. GENERACIÓN DE IMAGEN (NUEVO MODELO)
        console.log("   > Generando imagen con DeepInfra (PrunaAI)...");
        
        const imgResponse = await axios.post(DEEPINFRA_API_URL, {
            prompt: content.image_prompt,
            num_inference_steps: 25, // Ajustado para mejor calidad en este modelo
            width: 1024, // Pruna suele trabajar mejor en 1024x1024 o 768x768
            height: 768  // Ajustamos un poco para ratio más estético
        }, { headers: { "Authorization": `Bearer ${process.env.DEEPINFRA_API_KEY}` } });

        let imageBase64 = imgResponse.data.images?.[0]?.image_base64 || imgResponse.data.images?.[0];
        if (!imageBase64) throw new Error("DeepInfra no devolvió imagen.");

        const rawBuffer = Buffer.from(imageBase64.replace(/^data:image\/png;base64,/, ""), 'base64');

        // 3. EDICIÓN GRÁFICA (SHARP) - ESTÉTICA NUEVA
        console.log("   > Editando imagen (Minimalista)...");
        
        // ✅ CAMBIO 2: Texto más chico, sin cuadro negro, con sombra sutil para lectura
        // Usamos sombras en el SVG para que se lea sobre cualquier fondo
        const svgText = Buffer.from(`
        <svg width="1280" height="720">
            <defs>
                <filter id="shadow" x="-1" y="-1" width="3" height="3">
                    <feFlood flood-color="black" flood-opacity="0.8"/>
                    <feComposite in2="SourceGraphic" operator="in"/>
                    <feGaussianBlur stdDeviation="1.5"/>
                    <feOffset dx="1" dy="1" result="offsetblur"/>
                    <feFlood flood-color="black" flood-opacity="1"/>
                    <feComposite in2="offsetblur" operator="in"/>
                    <feMerge>
                        <feMergeNode/>
                        <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                </filter>
            </defs>
            <text x="50%" y="690" font-family="Arial" font-size="20" fill="white" text-anchor="middle" font-weight="bold" filter="url(#shadow)">
                DESDE RELAX STATION
            </text>
        </svg>`);

        // Primero redimensionamos la imagen base a 1280x720 para asegurar el canvas
        const resizedBuffer = await sharp(rawBuffer).resize(1280, 720).toBuffer();

        const layers = [{ input: svgText }];

        // ✅ CAMBIO 3: Logo Spotify más chico y más a la derecha
        const spotifyPath = path.join(ASSETS_DIR, 'spotify_logo.png');
        if (fs.existsSync(spotifyPath)) {
            const logoBuffer = await sharp(spotifyPath)
                .resize(35, 35) // Antes 50x50, ahora más chico
                .toBuffer();
            
            // Posición: 
            // left: 560 (Antes 450, lo movemos ~100px a la derecha, más cerca del centro)
            // top: 668 (Alineado con el texto)
            layers.push({ input: logoBuffer, top: 668, left: 560 });
        }

        await sharp(resizedBuffer)
            .composite(layers)
            .jpeg({ quality: 85, mozjpeg: true })
            .toFile(tempFilePath);

        // 4. SUBIDA A BUNNY
        console.log("   > Subiendo a Bunny.net...");
        const bunnyData = await uploadToBunny(tempFilePath, tempFileName);

        // 5. GUARDAR EN BD
        console.log("   > Guardando registro en Base de Datos...");
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
        
        console.log("✅ ¡CONTENIDO PREPARADO Y GUARDADO!");
        console.log(`   ID: ${newStream._id}`);

        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

        return newStream;

    } catch (error) {
        console.error("❌ Error en Generación IA:", error.message);
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        throw error;
    }
}

module.exports = { prepareNextStream };