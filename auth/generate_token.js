const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const readline = require('readline');

// --- CONFIGURACIÓN ---
const SCOPES = [
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.force-ssl'
];

// Rutas de archivos (ajustadas para ejecutarse desde la raíz o desde la carpeta auth)
const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'client_secret.json');

/**
 * Carga las credenciales y comienza el flujo de autorización.
 */
function main() {
    console.log("🔐 --- GENERADOR DE TOKENS YOUTUBE (MODO AUTO-REFRESH) ---");

    fs.readFile(CREDENTIALS_PATH, (err, content) => {
        if (err) {
            console.error('❌ Error cargando client_secret.json:', err);
            console.error('👉 Asegúrate de haber puesto el archivo descargado de Google Cloud en la carpeta auth/ y renombrado a client_secret.json');
            return;
        }
        
        // Autorizar cliente
        authorize(JSON.parse(content));
    });
}

/**
 * Crea el cliente OAuth2 y llama al prompt si no hay token, o avisa si ya existe.
 */
function authorize(credentials) {
    // Manejo flexible de la estructura del JSON (a veces viene como 'installed' o 'web')
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    
    const oAuth2Client = new google.auth.OAuth2(
        client_id, 
        client_secret, 
        redirect_uris[0] // Usamos localhost por defecto
    );

    // Verificamos si ya existe un token para no sobrescribirlo por accidente
    if (fs.existsSync(TOKEN_PATH)) {
        console.log("⚠️ YA EXISTE un archivo token.json.");
        console.log("Si quieres generar uno nuevo, borra el archivo auth/token.json y vuelve a ejecutar este script.");
        return;
    }

    getNewToken(oAuth2Client);
}

/**
 * Pide al usuario que visite la URL y obtenga el código de autorización.
 */
function getNewToken(oAuth2Client) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline', // CRUCIAL: Esto nos da el Refresh Token para que nunca caduque
        scope: SCOPES,
        prompt: 'consent' // Forzamos el consentimiento para asegurar que nos den el refresh_token
    });

    console.log('\n👉 Autoriza la aplicación visitando esta URL:\n');
    console.log(authUrl);
    console.log('\n---------------------------------------------------------');

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.question('📋 Pega aquí el código que te dio la página: ', (code) => {
        rl.close();
        
        oAuth2Client.getToken(code, (err, token) => {
            if (err) {
                console.error('❌ Error obteniendo el token de acceso:', err);
                return;
            }
            
            oAuth2Client.setCredentials(token);
            
            // Guardar el token en disco
            fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                if (err) return console.error(err);
                console.log('\n✅ ¡ÉXITO! Token almacenado en:', TOKEN_PATH);
                console.log('Ahora el bot podrá conectarse automáticamente sin pedirte nada.');
            });
        });
    });
}

// Ejecutar
main();