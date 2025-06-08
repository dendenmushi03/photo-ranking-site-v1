require('dotenv').config();
const mongoose = require('mongoose');

const mongoUri = process.env.MONGO_URI;

// モデル定義（photo-ranking.photos）
const Photo = mongoose.model('Photo', new mongoose.Schema({
  filename: String,
  author: String,
  approved: Boolean,
  hash: String,
  prompt: String
}), 'photos'); // ← コレクション名を固定で指定

async function run() {
  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  const db = mongoose.connection.useDb('photo-ranking');
  const photoCol = db.collection('photos');

  const result = await photoCol.deleteMany({});
  console.log(`🗑️ photo-ranking.photos の削除完了: ${result.deletedCount} 件`);

  process.exit(0);
}

run();
