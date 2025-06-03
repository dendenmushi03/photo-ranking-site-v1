const mongoose = require('mongoose');

const voteLogSchema = new mongoose.Schema({
  photoId: String,          // 🔽 追加！
  imageUrl: String,
  characterId: String,
  timestamp: { type: Date, default: Date.now },
  ip: String
});

module.exports = mongoose.model('VoteLog', voteLogSchema);
