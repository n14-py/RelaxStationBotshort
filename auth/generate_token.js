const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const readline = require('readline');

// Permisos necesarios para SUBIR videos y gestionar el canal
const SCOPES = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.force-ssl'
];

const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'client_secret.json');

// Cargar credenciales
fs.readFile(CREDENTIALS_PATH, (err, content) => {
    if (err) return console.log('❌ Error cargando client_secret.json:', err);
    authorize(JSON.parse(content));
});

function authorize(credentials) {
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    getNewToken(oAuth2Client);
}

function getNewToken(oAuth2Client) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
    
    console.log('\n🔐 --- AUTORIZACIÓN REQUERIDA ---');
    console.log('1. Abre este enlace en tu navegador:');
    console.log(authUrl);
    console.log('\n2. Autoriza con tu cuenta de YouTube.');
    console.log('3. Copia el código que te dan y pégalo aquí abajo.\n');

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.question('Pegar código aquí: ', (code) => {
        rl.close();
        oAuth2Client.getToken(code, (err, token) => {
            if (err) return console.error('❌ Error obteniendo token:', err);
            oAuth2Client.setCredentials(token);
            fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                if (err) return console.error(err);
                console.log('✅ ¡Token guardado exitosamente en auth/token.json!');
            });
        });
    });
}