require('dotenv').config();
const mongoose = require('mongoose');

const mongoUri = process.env.MONGO_URI;

const TestPhoto = mongoose.model('Photo', new mongoose.Schema({
  filename: String,
  author: String,
  approved: Boolean,
  hash: String,
  prompt: String
}), 'photos'); // ← "photos" コレクション名そのまま指定

async function run() {
  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  // "test" データベースの Photo モデルとして再定義
  const db = mongoose.connection.useDb('test');
  const testPhotos = db.collection('photos');

  const result = await testPhotos.deleteMany({});
  console.log(`🗑️ test.photos の削除完了: ${result.deletedCount} 件`);

  process.exit(0);
}

run();
