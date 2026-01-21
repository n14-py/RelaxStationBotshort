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
 * Genera el Short con Títulos de "Llamada a la Acción" y Escenarios Variados.
 */
async function generateShortData() {
    console.log("🧠 [IA] Iniciando proceso creativo (Modo Variedad + Marketing Directo)...");

    const tempFileName = `temp_short_bg_${Date.now()}.jpg`;
    const tempFilePath = path.join(__dirname, `../${tempFileName}`);

    try {
        // -------------------------------------------------------------------------
        // 1. ELEGIR ESCENARIO AL AZAR (Para evitar repetición)
        // -------------------------------------------------------------------------
        const scenarios = [
            "Futuristic Cyberpunk Bedroom with Neon Lights",
            "Cozy Ancient Library with Floating Books",
            "Midnight Train traveling through a glowing city",
            "Magical Forest with Bioluminescent Plants",
            "Rooftop view of a rainy Tokyo street at night",
            "Underwater Glass Observatory relaxing view",
            "Coffee Shop window on a snowy evening",
            "Space Station observation deck looking at Earth",
            "Abandoned Greenhouse filled with flowers",
            "Sunset at a lonely Bus Stop in the countryside"
        ];
        // Seleccionamos uno al azar para forzar variedad
        const selectedScenario = scenarios[Math.floor(Math.random() * scenarios.length)];
        console.log(`   🌍 Escenario elegido por el sistema: "${selectedScenario}"`);

        // -------------------------------------------------------------------------
        // 2. GENERACIÓN DE TEXTO (Marketing Agresivo)
        // -------------------------------------------------------------------------
        const websiteUrl = process.env.WEBSITE_URL;
        
        const systemPrompt = `Eres el Marketing Manager de "Relax Station".
        Tu objetivo es que la gente haga CLICK y entre al LIVE ahora mismo.
        
        REGLAS ESTRICTAS PARA EL TÍTULO (Call to Action):
        - 🚫 PROHIBIDO: Frases cursis como "Recuerdas...", "Nostalgia...", "Paz interior".
        - ✅ OBLIGATORIO: Títulos que inviten a entrar al directo o generen urgencia.
        - Ejemplos Aprobados: "🔴 ¡ESTAMOS EN VIVO!", "¿Ya entraste?", "Tu refugio está activo 24/7", "¡Corre al Live!", "¿Necesitas dormir?", "Música para estudiar 📚".
        
        REGLAS PARA LA DESCRIPCIÓN:
        - Primera línea: "🔴 ¡ESTAMOS EN VIVO! Entra al PERFIL para escuchar."
        - Tags obligatorios al final: #desderelaxstation #lofi #live
        
        TUS TAREAS:
        1. Título Llamativo (Directo al grano).
        2. Descripción corta.
        3. Prompt Visual: Te doy este escenario base: "${selectedScenario}". 
           Mejora ese prompt añadiendo detalles de "Masterpiece Anime Style, Makoto Shinkai lighting".
        
        Responde SOLO JSON:
        {
            "title": "Título...",
            "description": "Descripción...",
            "image_prompt": "Prompt visual mejorado..."
        }`;

        const textResponse = await axios.post(DEEPSEEK_API_URL, {
            model: "deepseek-chat",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: "Genera el contenido ahora." }
            ],
            response_format: { type: "json_object" }
        }, { headers: { "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}` } });

        const content = JSON.parse(textResponse.data.choices[0].message.content);
        console.log(`   📝 Título generado: "${content.title}"`);

        // -------------------------------------------------------------------------
        // 3. GENERACIÓN DE IMAGEN (Estilo Visual Coherente pero Variado)
        // -------------------------------------------------------------------------
        console.log("   🎨 Generando arte único con PrunaAI...");
        
        // Mantenemos la "firma visual" (estilo) pero cambiamos el contenido (escenario)
        const masterStyle = "anime style, highly detailed, 8k resolution, cinematic lighting, sharp focus, masterpiece, no text";
        
        const finalImagePrompt = `(Vertical orientation, 9:16 aspect ratio), ${content.image_prompt}, ${masterStyle}`;

        const imgResponse = await axios.post(DEEPINFRA_API_URL, {
            prompt: finalImagePrompt,
            num_inference_steps: 30, 
            width: 768,   // Ancho seguro
            height: 1344  // Alto seguro
        }, { headers: { "Authorization": `Bearer ${process.env.DEEPINFRA_API_KEY}` } });

        let imageBase64 = imgResponse.data.images?.[0]?.image_base64 || imgResponse.data.images?.[0];
        if (!imageBase64) throw new Error("La IA no devolvió imagen.");

        const rawBuffer = Buffer.from(imageBase64.replace(/^data:image\/png;base64,/, ""), 'base64');

        // -------------------------------------------------------------------------
        // 4. EDICIÓN Y BRANDING (Full HD 1080x1920)
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