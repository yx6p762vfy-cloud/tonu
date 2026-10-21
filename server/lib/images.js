const path = require('path');
const fs = require('fs/promises');
const { randomUUID } = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const config = require('../config');

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: config.maxPhotos },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.has(file.mimetype)) return cb(null, true);
    const err = new Error('Format image non supporté (JPG, PNG ou WebP)');
    err.code = 'UNSUPPORTED_IMAGE';
    cb(err);
  },
});

async function processImage(file) {
  try {
    const image = sharp(file.buffer, { limitInputPixels: 50_000_000 });
    const meta = await image.metadata();
    if (!meta.width || !meta.height) {
      const err = new Error('Fichier image illisible');
      err.code = 'UNSUPPORTED_IMAGE';
      throw err;
    }
    if (meta.width < 200 || meta.height < 200) {
      const err = new Error('Image trop petite (minimum 200 × 200 px)');
      err.code = 'UNSUPPORTED_IMAGE';
      throw err;
    }
    const fileName = `${randomUUID()}.jpg`;
    await image
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(path.join(config.uploadsDir, fileName));
    return fileName;
  } catch (err) {
    if (err.code === 'UNSUPPORTED_IMAGE') throw err;
    const invalid = new Error('Image invalide ou corrompue');
    invalid.code = 'UNSUPPORTED_IMAGE';
    throw invalid;
  }
}

async function saveUploads(files) {
  const saved = [];
  try {
    for (const file of files) {
      saved.push(await processImage(file));
    }
    return saved;
  } catch (err) {
    await deleteFiles(saved);
    throw err;
  }
}

async function deleteFiles(fileNames) {
  await Promise.all(
    fileNames
      .filter((name) => name && !String(name).startsWith('images/'))
      .map((name) => fs.unlink(path.join(config.uploadsDir, path.basename(name))).catch(() => {}))
  );
}

function multerErrorResponse(err, res) {
  if (err?.code === 'UNSUPPORTED_IMAGE') {
    return res.status(400).json({ error: err.message });
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: `Image trop lourde (max ${Math.round(config.maxUploadBytes / 1024 / 1024)} Mo)` });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: `Maximum ${config.maxPhotos} photos` });
    }
    return res.status(400).json({ error: err.message });
  }
  return null;
}

module.exports = { upload, saveUploads, deleteFiles, multerErrorResponse };
