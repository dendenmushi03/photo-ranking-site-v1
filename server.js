// ✅ 環境変数を使うためのdotenvを読み込み
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { Readable } = require('stream');
const { GridFSBucket } = require('mongodb');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const imghash = require('imghash');

const app = express();

const mongoUri = process.env.MONGO_URI || 'mongodb+srv://89bouzu19970307yuchan:zQXcCGTSAFEY824I@cluster0.ze31ydc.mongodb.net/photo-ranking?retryWrites=true&w=majority&appName=Cluster0';
mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

const conn = mongoose.connection;
let gfs;

const storage = multer.memoryStorage();
const upload = multer({ storage });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'supersecretkey',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 3600000, sameSite: 'lax', secure: false }
}));

const Photo = mongoose.model('Photo', new mongoose.Schema({
  filename: String,
  author: String,
  approved: { type: Boolean, default: false },
  hash: String
}));

const VoteLog = mongoose.model('VoteLog', new mongoose.Schema({
  photoId: String,
  votedAt: { type: Date, default: Date.now }
}));

const Comment = mongoose.model('Comment', new mongoose.Schema({
  photoId: String,
  text: String
}));

const AccessLog = mongoose.model('AccessLog', new mongoose.Schema({
  type: String,
  timestamp: { type: Date, default: Date.now }
}));

console.log("DEBUG - USER:", process.env.ADMIN_USERNAME);
console.log("DEBUG - PASS:", process.env.ADMIN_PASSWORD);

const adminUser = {
  username: process.env.ADMIN_USERNAME,
  passwordHash: bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10)
};

async function computePerceptualHash(buffer) {
  const tmpPath = path.join(__dirname, 'temp-' + Date.now() + '.jpg');
  fs.writeFileSync(tmpPath, buffer);
  try {
    const hash = await imghash.hash(tmpPath, 16, 'hex');
    fs.unlinkSync(tmpPath);
    return hash;
  } catch (err) {
    fs.unlinkSync(tmpPath);
    throw err;
  }
}

conn.once('open', () => {
  gfs = new GridFSBucket(conn.db, { bucketName: 'uploads' });
  console.log('✅ MongoDB & GridFS ready');

  app.post('/upload-photo', upload.array('photo', 50), async (req, res) => {
    try {
      const author = req.body.author;
      const files = req.files;
      if (!author || !files || files.length === 0) {
        return res.status(400).json({ message: 'Missing author or files' });
      }

      const savedPhotos = [];
      for (const file of files) {
        const hash = await computePerceptualHash(file.buffer);
        console.log('📷 pHash:', hash);
        const stream = Readable.from(file.buffer);
        const randomName = crypto.randomBytes(16).toString('hex') + path.extname(file.originalname);
        const uploadStream = gfs.openUploadStream(randomName, { contentType: file.mimetype });

        await new Promise((resolve, reject) => {
          stream.pipe(uploadStream)
            .on('error', reject)
            .on('finish', async () => {
              const photo = new Photo({ filename: randomName, author, approved: false, hash });
              await photo.save();
              savedPhotos.push(photo);
              resolve();
            });
        });
      }
      res.json({ message: 'Upload successful (pending approval)', photos: savedPhotos });
    } catch (err) {
      console.error('❌ Upload error:', err);
      res.status(500).json({ message: 'Upload failed', error: err.message });
    }
  });

  app.get('/image/:filename', async (req, res) => {
    try {
      const files = await gfs.find({ filename: req.params.filename }).toArray();
      if (!files || files.length === 0) return res.status(404).send('File not found');
      const stream = gfs.openDownloadStreamByName(req.params.filename);
      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => {
        res.set('Content-Type', files[0].contentType || 'application/octet-stream');
        res.send(Buffer.concat(chunks));
      });
      stream.on('error', () => res.sendStatus(500));
    } catch {
      res.sendStatus(500);
    }
  });

  app.get('/api/pending-photos', requireAdmin, async (req, res) => {
    console.log('--- pending-photos start ---');
    const approved = await Photo.find({ approved: true, hash: { $ne: null } });
    const pending = await Photo.find({ approved: false });

    function hammingDistance(a, b) {
      let dist = 0;
      for (let i = 0; i < a.length && i < b.length; i++) {
        if (a[i] !== b[i]) dist++;
      }
      return dist + Math.abs(a.length - b.length);
    }

    const results = pending.map(p => {
      let isDuplicate = false;
      for (const a of approved) {
        if (p.hash && a.hash) {
          const dist = hammingDistance(p.hash, a.hash);
          console.log(`🔍 比較: ${p.filename} vs ${a.filename} | 距離 = ${dist}`);
          if (dist <= 10) {
            isDuplicate = true;
            break;
          }
        }
      }
      return {
        filename: p.filename,
        author: p.author,
        isDuplicate
      };
    });

    res.json(results);
  });
  app.post('/api/approve-photo', requireAdmin, async (req, res) => {
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ message: 'Missing filename' });
    await Photo.updateOne({ filename }, { approved: true });
    res.json({ message: 'Photo approved' });
  });

  app.delete('/api/photo/:filename', requireAdmin, async (req, res) => {
    await Photo.deleteOne({ filename: req.params.filename });
    try {
      const file = await gfs.find({ filename: req.params.filename }).toArray();
      if (file.length > 0) await gfs.delete(file[0]._id);
      res.json({ message: 'Photo deleted' });
    } catch {
      res.status(500).json({ message: 'Deletion error' });
    }
  });

  app.post('/vote-photo', async (req, res) => {
    const { photoId } = req.body;
    if (!photoId) return res.status(400).json({ message: 'Invalid vote' });
    try {
      await new VoteLog({ photoId }).save();
      res.json({ message: 'Vote submitted' });
    } catch {
      res.status(500).json({ message: 'Vote failed' });
    }
  });

  app.get('/api/rankings', async (req, res) => {
    const photos = await Photo.find({ approved: true });
    const logs = await VoteLog.find();
    const voteMap = {};
    logs.forEach(log => {
      voteMap[log.photoId] = (voteMap[log.photoId] || 0) + 1;
    });
    const results = photos.map(p => ({
      id: p.filename,
      author: p.author,
      votes: voteMap[p.filename] || 0
    })).sort((a, b) => b.votes - a.votes);
    res.json(results);
  });

  app.get('/api/comments/all', async (req, res) => {
    const all = await Comment.find();
    const grouped = {};
    all.forEach(c => {
      if (!grouped[c.photoId]) grouped[c.photoId] = [];
      grouped[c.photoId].push(c.text);
    });
    res.json(grouped);
  });

  app.get('/api/comments/:photoId', async (req, res) => {
    const comments = await Comment.find({ photoId: req.params.photoId });
    res.json(comments.map(c => c.text));
  });

  app.post('/api/comments', async (req, res) => {
    const { photoId, comment } = req.body;
    if (!photoId || !comment) return res.status(400).json({ message: 'Invalid comment' });
    await new Comment({ photoId, text: comment }).save();
    res.json({ message: 'Comment added' });
  });

  app.delete('/api/comments', async (req, res) => {
    const { photoId } = req.body;
    if (!photoId) return res.status(400).json({ message: 'Invalid delete request' });
    await Comment.deleteMany({ photoId });
    res.json({ message: 'Comments deleted' });
  });
  app.post('/admin-login', (req, res) => {
    const { username, password } = req.body;
    const match = bcrypt.compareSync(password, adminUser.passwordHash);
    if (username === adminUser.username && match) {
      req.session.isAdmin = true;
      req.session.save(() => res.json({ message: 'Login successful' }));
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  });

  app.post('/admin-logout', (req, res) => {
    req.session.destroy(() => res.json({ message: 'Logged out' }));
  });

  app.get('/api/access-stats', requireAdmin, async (req, res) => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    const all = await AccessLog.countDocuments({ type: 'vote' });
    const daily = await AccessLog.countDocuments({ type: 'vote', timestamp: { $gte: startOfDay } });
    const weekly = await AccessLog.countDocuments({ type: 'vote', timestamp: { $gte: startOfWeek } });
    res.json({ all, daily, weekly });
  });

  app.post('/log-access', async (req, res) => {
    try {
      await new AccessLog({ type: 'vote' }).save();
      res.json({ message: 'Access logged' });
    } catch {
      res.status(500).json({ message: 'Logging error' });
    }
  });

  app.get('/photo-meta', async (req, res) => {
    const photos = await Photo.find({ approved: true });
    res.json(photos.map(p => ({ filename: p.filename, author: p.author })));
  });

  function requireAdmin(req, res, next) {
    if (req.session?.isAdmin) return next();
    res.status(403).json({ message: 'Forbidden' });
  }
  app.listen(3000, () => {
    console.log('✅ Server running on port 3000');
  });
});
