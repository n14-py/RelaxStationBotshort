const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// Rutas absolutas para evitar problemas al importar desde otros lados
const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'client_secret.json');

/**
 * Obtiene un cliente de YouTube autenticado y listo para usar.
 * Maneja automáticamente la renovación del token si es necesario.
 * @returns {Promise<google.youtube>} Cliente de YouTube v3
 */
async function getYoutubeClient() {
    return new Promise((resolve, reject) => {
        // 1. Cargar Credenciales (Client Secret)
        fs.readFile(CREDENTIALS_PATH, (err, content) => {
            if (err) {
                console.error('❌ [Auth] No se encontró client_secret.json en auth/');
                return reject(err);
            }
            
            const credentials = JSON.parse(content);
            const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
            
            // 2. Crear instancia OAuth2
            const oAuth2Client = new google.auth.OAuth2(
                client_id, 
                client_secret, 
                redirect_uris[0]
            );

            // 3. Cargar Token (Token.json)
            fs.readFile(TOKEN_PATH, (err, token) => {
                if (err) {
                    console.error('❌ [Auth] No se encontró token.json. EJECUTA: npm run auth');
                    return reject('FALTA_TOKEN');
                }
                
                const tokenParsed = JSON.parse(token);
                oAuth2Client.setCredentials(tokenParsed);

                // Configurar eventos de actualización de credenciales (Opcional pero recomendado para debug)
                oAuth2Client.on('tokens', (tokens) => {
                    if (tokens.refresh_token) {
                        console.log('🔄 [Auth] ¡Refresh Token actualizado automáticamente!');
                        // Podríamos guardar el nuevo token.json aquí si quisiéramos ser muy estrictos,
                        // pero la librería suele manejarlo en memoria para la sesión.
                    }
                });

                console.log('✅ [Auth] Cliente YouTube autenticado correctamente.');
                
                // 4. Devolver la instancia de la API de YouTube
                const youtube = google.youtube({
                    version: 'v3',
                    auth: oAuth2Client
                });
                
                resolve(youtube);
            });
        });
    });
}

module.exports = { getYoutubeClient };