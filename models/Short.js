const mongoose = require('mongoose');

const ShortSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    description: {
        type: String, // Aquí guardaremos la descripción generada por IA con tus links
        required: true
    },
    video_url: {
        type: String, // La URL pública de Bunny.net para descargar el video .mp4 final
        required: true
    },
    cover_url: {
        type: String // La URL de la imagen vertical generada (por si la necesitas)
    },
    bunny_storage_path: {
        type: String, // Ruta interna en Bunny (útil para borrar archivos viejos y ahorrar espacio)
        required: true
    },
    music_track: {
        type: String // Nombre de la canción utilizada
    },
    status: {
        type: String,
        enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
        default: 'GENERATED'
    },
    youtube_id: {
        type: String // ID del video si se sube automáticamente a YouTube
    },
    created_at: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Short', ShortSchema);