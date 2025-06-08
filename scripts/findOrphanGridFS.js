// scripts/findOrphanGridFS.js
require("dotenv").config();
const mongoose = require("mongoose");
const { GridFSBucket } = require("mongodb");

const mongoUri = process.env.MONGO_URI;

// Photo スキーマ
const Photo = mongoose.model("Photo", new mongoose.Schema({
  filename: String,
  author: String,
  approved: Boolean,
  hash: String,
  prompt: String
}), "photos");

async function run() {
  await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
  const db = mongoose.connection.db;
  const bucket = new GridFSBucket(db, { bucketName: "uploads" });

  const gridfsFiles = await db.collection("uploads.files").find().toArray();
  const photoDocs = await Photo.find();
  const registeredIds = new Set(photoDocs.map(p => p.filename));

  const orphanFiles = gridfsFiles.filter(file => !registeredIds.has(file._id.toString()));

  console.log(`✅ GridFS内のファイル総数: ${gridfsFiles.length}`);
  console.log(`✅ Photoコレクション登録済み: ${photoDocs.length}`);
  console.log(`⚠️  未登録のGridFS画像: ${orphanFiles.length} 件`);

  if (orphanFiles.length > 0) {
    orphanFiles.forEach(file => {
      console.log(`🟡 孤立ファイル: ${file._id.toString()} (${file.filename})`);
    });
  } else {
    console.log("🎉 孤立ファイルは存在しません");
  }

  process.exit(0);
}

run();
