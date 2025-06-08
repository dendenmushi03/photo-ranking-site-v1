// scripts/fetchGridFsToLocal.js
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { GridFSBucket } = require('mongodb');

const mongoUri = process.env.MONGO_URI;
const downloadDir = path.join(__dirname, '../public/image');

async function fetchImagesFromGridFS() {
  try {
    await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
    const db = mongoose.connection.db;
    const bucket = new GridFSBucket(db, { bucketName: 'uploads' });

    const files = await db.collection('uploads.files').find().toArray();
    console.log(`🔍 GridFS内の画像ファイル数: ${files.length}`);

    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    for (const file of files) {
      const outPath = path.join(downloadDir, file.filename);
      if (fs.existsSync(outPath)) {
        console.log(`✅ スキップ: ${file.filename}`);
        continue;
      }

      const downloadStream = bucket.openDownloadStreamByName(file.filename);
      const writeStream = fs.createWriteStream(outPath);

      await new Promise((resolve, reject) => {
        downloadStream.pipe(writeStream)
          .on('finish', () => {
            console.log(`⬇️ 保存: ${file.filename}`);
            resolve();
          })
          .on('error', (err) => {
            console.error(`❌ エラー: ${file.filename}`, err);
            reject(err);
          });
      });
    }

    console.log('🎉 すべての画像を保存しました');
    process.exit(0);
  } catch (err) {
    console.error('エラー:', err);
    process.exit(1);
  }
}

fetchImagesFromGridFS();
