const mongoose = require('mongoose');

const ShortSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    video_url: {
        type: String,
        required: true
    },
    cover_url: {
        type: String
    },
    bunny_storage_path: {
        type: String,
        required: true
    },
    music_track: {
        type: String
    },
    status: {
        type: String,
        // 👇 AQUÍ ESTÁ EL CAMBIO IMPORTANTE: Agregamos todas las opciones posibles
        enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'UPLOADED', 'GENERATED', 'GENERATED_ONLY'],
        default: 'GENERATED'
    },
    youtube_id: {
        type: String
    },
    created_at: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Short', ShortSchema);