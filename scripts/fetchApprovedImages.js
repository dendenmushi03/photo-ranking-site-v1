// scripts/fetchApprovedImages.js
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { GridFSBucket } = require('mongodb');

const downloadDir = path.join(__dirname, '../public/image');
const mongoUri = process.env.MONGO_URI;

// ✅ 明示的に "photos" を使う
const Photo = mongoose.model('Photo', new mongoose.Schema({
  filename: String,
  author: String,
  approved: Boolean,
  hash: String,
  prompt: String
}), "photos");

async function run() {
  await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
  const db = mongoose.connection.db;
  const bucket = new GridFSBucket(db, { bucketName: 'uploads' });

  const photos = await Photo.find({ approved: true });
  console.log(`✅ 承認済み写真: ${photos.length} 件`);

  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }

  for (const photo of photos) {
    const outPath = path.join(downloadDir, photo.filename);
    if (fs.existsSync(outPath)) {
      console.log(`🟡 スキップ: ${photo.filename}`);
      continue;
    }

    try {
      const stream = bucket.openDownloadStream(new mongoose.Types.ObjectId(photo.filename));
      const writeStream = fs.createWriteStream(outPath);

      await new Promise((resolve, reject) => {
        stream.pipe(writeStream)
          .on('finish', () => {
            console.log(`⬇️ 保存: ${photo.filename}`);
            resolve();
          })
          .on('error', (err) => {
            console.error(`❌ 失敗: ${photo.filename}`, err.message);
            reject(err);
          });
      });
    } catch (err) {
      console.error(`❌ GridFS取得エラー: ${photo.filename}`, err.message);
    }
  }

  console.log('🎉 すべての画像取得が完了しました');
  process.exit(0);
}

run();
