const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const Stream = require('/models/Stream'); // Importamos el modelo de la BD
const { uploadToBunny } = require('./bunnyHandler'); // Importamos el gestor de Bunny

// --- CONFIGURACIÓN DE RECURSOS ---
sharp.cache(false); // Desactivar caché para ahorrar RAM
sharp.concurrency(1); // Usar solo 1 núcleo para editar

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEEPINFRA_API_URL = "https://api.deepinfra.com/v1/inference/stabilityai/sdxl-turbo";
const ASSETS_DIR = path.join(__dirname, '../assets');

/**
 * FUNCIÓN MAESTRA:
 * 1. Genera Texto (IA)
 * 2. Genera Imagen (IA)
 * 3. Edita Imagen (Branding)
 * 4. Sube a Bunny.net
 * 5. Guarda todo en MongoDB
 * * @returns {Promise<Object>} El documento del stream guardado en la BD
 */
async function prepareNextStream() {
    console.log("🧠 [Director IA] Iniciando proceso de creación...");

    const tempFileName = `cover_${Date.now()}.jpg`;
    const tempFilePath = path.join(__dirname, `../${tempFileName}`);

    try {
        // ---------------------------------------------------------
        // 1. GENERACIÓN DE TEXTO (DEEPSEEK)
        // ---------------------------------------------------------
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
            "image_prompt": "Prompt detallado en inglés para SDXL (lofi style, aesthetic, 8k)"
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
        
        // Agregar footer de marketing
        content.description += `\n\n👇 **LINKS OFICIALES** 👇\n🎧 Spotify: ${spotifyLink}\n🌐 Web: ${webLink}\n\n📻 *Transmitiendo desde Relax Station*`;

        console.log(`   💡 Concepto: ${content.concept_reasoning}`);

        // ---------------------------------------------------------
        // 2. GENERACIÓN DE IMAGEN (DEEPINFRA)
        // ---------------------------------------------------------
        console.log("   > Generando imagen con DeepInfra...");
        const imgResponse = await axios.post(DEEPINFRA_API_URL, {
            prompt: content.image_prompt,
            num_inference_steps: 4,
            width: 1280,
            height: 720
        }, { headers: { "Authorization": `Bearer ${process.env.DEEPINFRA_API_KEY}` } });

        let imageBase64 = imgResponse.data.images?.[0]?.image_base64 || imgResponse.data.images?.[0];
        if (!imageBase64) throw new Error("DeepInfra no devolvió imagen.");

        // Limpieza del base64
        const rawBuffer = Buffer.from(imageBase64.replace(/^data:image\/png;base64,/, ""), 'base64');

        // ---------------------------------------------------------
        // 3. EDICIÓN GRÁFICA (SHARP)
        // ---------------------------------------------------------
        console.log("   > Editando imagen (Branding)...");
        
        // Capa de texto "DESDE RELAX STATION"
        const svgText = Buffer.from(`
        <svg width="1280" height="720">
            <rect x="0" y="660" width="1280" height="60" fill="black" opacity="0.6" />
            <text x="50%" y="700" font-family="Arial" font-size="30" fill="white" text-anchor="middle" font-weight="bold">DESDE RELAX STATION</text>
        </svg>`);

        const layers = [{ input: svgText }];

        // Logo Spotify (Opcional)
        const spotifyPath = path.join(ASSETS_DIR, 'spotify_logo.png');
        if (fs.existsSync(spotifyPath)) {
            const logoBuffer = await sharp(spotifyPath).resize(50, 50).toBuffer();
            layers.push({ input: logoBuffer, top: 665, left: 450 });
        }

        // Procesar y guardar como JPG optimizado
        await sharp(rawBuffer)
            .composite(layers)
            .jpeg({ quality: 85, mozjpeg: true })
            .toFile(tempFilePath);

        // ---------------------------------------------------------
        // 4. SUBIDA A BUNNY.NET
        // ---------------------------------------------------------
        console.log("   > Subiendo a Bunny.net...");
        const bunnyData = await uploadToBunny(tempFilePath, tempFileName);

        // ---------------------------------------------------------
        // 5. GUARDAR EN MONGODB
        // ---------------------------------------------------------
        console.log("   > Guardando registro en Base de Datos...");
        const newStream = new Stream({
            title: content.title,
            description: content.description,
            concept_reasoning: content.concept_reasoning,
            image_prompt: content.image_prompt,
            bunny_image_url: bunnyData.url,
            bunny_file_path: bunnyData.path,
            status: 'READY' // Importante: Lo marcamos como LISTO para ser transmitido
        });

        await newStream.save();
        
        console.log("✅ ¡PREPARACIÓN COMPLETADA CON ÉXITO!");
        console.log(`   ID del Stream: ${newStream._id}`);

        // Limpiar archivo local para no llenar el disco
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

        return newStream;

    } catch (error) {
        console.error("❌ Error en la preparación del contenido:", error.message);
        // Limpiar archivo local si quedó a medias
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        throw error;
    }
}

module.exports = { prepareNextStream };