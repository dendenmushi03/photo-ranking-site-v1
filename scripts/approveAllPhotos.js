require('dotenv').config();
const mongoose = require('mongoose');

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

  const result = await Photo.updateMany({}, { approved: true });
  console.log(`✅ 承認済みに更新: ${result.modifiedCount} 件`);
  process.exit(0);
}

run();
