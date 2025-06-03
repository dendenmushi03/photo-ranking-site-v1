const mongoose = require('mongoose');

const voteLogSchema = new mongoose.Schema({
  imageUrl: String,
  characterId: String,
  timestamp: Date,
  ip: String
});

module.exports = mongoose.model('VoteLog', voteLogSchema);
