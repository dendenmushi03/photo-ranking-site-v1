// scripts/migrateTestPhotos.js
require('dotenv').config();
const mongoose = require('mongoose');

const sourceConn = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'test',
  useNewUrlParser: true,
  useUnifiedTopology: true
});
const targetConn = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: 'photo-ranking',
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const photoSchema = new mongoose.Schema({
  filename: String,
  author: String,
  approved: Boolean,
  hash: String,
  prompt: String
}, { strict: false });

async function migrate() {
  try {
    const SourcePhoto = sourceConn.model('Photo', photoSchema, 'photos');
    const TargetPhoto = targetConn.model('Photo', photoSchema, 'photos');

    const photos = await SourcePhoto.find({});
    console.log(`📦 test.photos から取得: ${photos.length} 件`);

    if (photos.length === 0) return;

    const inserted = await TargetPhoto.insertMany(photos);
    console.log(`✅ photo-ranking.photos に挿入完了: ${inserted.length} 件`);

    process.exit(0);
  } catch (err) {
    console.error('❌ 移行エラー:', err);
    process.exit(1);
  }
}

migrate();
