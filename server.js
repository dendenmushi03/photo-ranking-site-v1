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

const mongoUri = process.env.MONGO_URI ||
  'mongodb+srv://user:pass@cluster.mongodb.net/photo-ranking?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const conn = mongoose.connection;
let gfs;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SECRET_KEY || 'fallback-secret',
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 3600000,
    sameSite: 'lax',
    secure: false
  }
}));

// ✅ トップページのルート定義を conn.once の外に出す
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  }
});

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

function requireAdmin(req, res, next) {
  if (req.session?.isAdmin) return next();
  res.status(403).json({ message: 'Forbidden' });
}

conn.once('open', () => {
  gfs = new GridFSBucket(conn.db, { bucketName: 'uploads' });

  app.post('/upload-photo', upload.array('photo', 50), async (req, res) => {
    try {
      const { author } = req.body;
      const files = req.files;
      if (!author || !files?.length) return res.status(400).json({ message: 'Missing author or files' });
      const savedPhotos = [];

      for (const file of files) {
        const hash = await computePerceptualHash(file.buffer);
        const uploadStream = gfs.openUploadStream(
          crypto.randomBytes(16).toString('hex') + path.extname(file.originalname),
          { contentType: file.mimetype }
        );

        Readable.from(file.buffer).pipe(uploadStream);
        await new Promise((resolve, reject) => {
          uploadStream.on('error', reject).on('finish', async () => {
            const photo = new Photo({ filename: uploadStream.id, author, approved: false, hash });
            await photo.save();
            savedPhotos.push(photo);
            resolve();
          });
        });
      }

      res.json({ message: 'Upload successful (pending approval)', photos: savedPhotos });
    } catch (err) {
      res.status(500).json({ message: 'Upload failed', error: err.message });
    }
  });

  app.get('/image/:filename', async (req, res) => {
    try {
      const id = new mongoose.Types.ObjectId(req.params.filename);
      gfs.openDownloadStream(id).pipe(res);
    } catch (err) {
      res.status(400).send('Invalid image ID');
    }
  });

  app.get('/api/pending-photos', requireAdmin, async (req, res) => {
    const approvedList = await Photo.find({ approved: true });
    const pendingList = await Photo.find({ approved: false });
    const results = pendingList.map(p => {
      const isDuplicate = approvedList.some(a => {
        const hd = [...p.hash].reduce((d, _, i) => d + (p.hash[i] !== a.hash[i] ? 1 : 0), 0);
        return hd <= 10;
      });
      return { filename: p.filename, author: p.author, isDuplicate };
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
    const files = await gfs.find({ _id: new mongoose.Types.ObjectId(req.params.filename) }).toArray();
    if (files.length) await gfs.delete(files[0]._id);
    res.json({ message: 'Photo deleted' });
  });

  app.post('/vote-photo', async (req, res) => {
    const { photoId } = req.body;
    if (!photoId) return res.status(400).json({ message: 'Invalid vote' });
    await new VoteLog({ photoId }).save();
    res.json({ message: 'Vote submitted' });
  });

  app.get('/api/rankings', async (req, res) => {
    const photos = await Photo.find({ approved: true });
    const logs = await VoteLog.find();
    const counts = logs.reduce((acc, l) => {
      acc[l.photoId] = (acc[l.photoId] || 0) + 1;
      return acc;
    }, {});
    res.json(photos.map(p => ({
      id: p.filename,
      author: p.author,
      votes: counts[p.filename] || 0
    })).sort((a, b) => b.votes - a.votes));
  });

  app.get('/api/comments/all', async (req, res) => {
    const comments = await Comment.find();
    const grouped = comments.reduce((g, c) => {
      g[c.photoId] = g[c.photoId] || [];
      g[c.photoId].push(c.text);
      return g;
    }, {});
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
    if (username === adminUser.username && bcrypt.compareSync(password, adminUser.passwordHash)) {
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
    const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startWeek = new Date(startDay.getTime() - 6 * 24 * 60 * 60 * 1000);
    const all = await AccessLog.countDocuments({ type: 'vote' });
    const daily = await AccessLog.countDocuments({ type: 'vote', timestamp: { $gte: startDay } });
    const weekly = await AccessLog.countDocuments({ type: 'vote', timestamp: { $gte: startWeek } });
    res.json({ all, daily, weekly });
  });

  app.post('/log-access', async (req, res) => {
    await new AccessLog({ type: 'vote' }).save();
    res.json({ message: 'Access logged' });
  });

  app.get('/photo-meta', async (req, res) => {
    const photos = await Photo.find({ approved: true });
    res.json(photos.map(p => ({ filename: p.filename, author: p.author })));
  });

    const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
}); 