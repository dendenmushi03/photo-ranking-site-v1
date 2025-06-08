// scripts/registerOrphanPhotos.js
require('dotenv').config();
const mongoose = require('mongoose');
const { ObjectId, GridFSBucket } = require('mongodb');

const mongoUri = process.env.MONGO_URI;

const Photo = mongoose.model('Photo', new mongoose.Schema({
  filename: String,
  author: String,
  approved: Boolean,
  hash: String,
  prompt: String
}), 'photos');

async function run() {
  await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
  const db = mongoose.connection.db;
  const bucket = new GridFSBucket(db, { bucketName: 'uploads' });

  const gridFiles = await db.collection('uploads.files').find().toArray();
  const photoRecords = await Photo.find();
  const photoIds = new Set(photoRecords.map(p => p.filename));

  let added = 0;
  for (const file of gridFiles) {
    if (!photoIds.has(file._id.toString())) {
      await Photo.create({
        filename: file._id,
        author: '不明',
        approved: false,
        hash: '',
        prompt: ''
      });
      console.log(`🆕 追加: ${file.filename} (${file._id})`);
      added++;
    }
  }

  console.log(`✅ 登録完了: ${added} 件`);
  process.exit(0);
}

run();
