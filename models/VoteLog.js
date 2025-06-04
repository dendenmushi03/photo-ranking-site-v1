const mongoose = require('mongoose');

const voteLogSchema = new mongoose.Schema({
  photoId: String,          // 必要なら残す（使ってるならOK）
  imageUrl: String,
  characterId: String,
  timestamp: { type: Date, default: Date.now },
  userId: String            // ✅ セッション識別用に追加
});

module.exports = mongoose.model('VoteLog', voteLogSchema);
