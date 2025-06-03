const mongoose = require('mongoose');

const voteLogSchema = new mongoose.Schema({
  imageUrl: String,
  characterId: String,
  timestamp: { type: Date, default: Date.now },  // ✅ 修正ポイント
  ip: String
});

module.exports = mongoose.model('VoteLog', voteLogSchema);
