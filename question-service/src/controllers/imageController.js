import pool from '../db/index.js';
import { uploadImage, deleteImage } from '../services/s3Service.js';

// ── POST /questions/:id/images ────────────────────────────────
const uploadQuestionImages = async (req, res) => {
  const { id } = req.params;

  if (isNaN(parseInt(id))) {
    return res.status(400).json({ error: 'Bad Request', message: 'Question ID must be a number.' });
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'No images provided. Send files under the "images" field.',
    });
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const invalidFiles = req.files.filter(f => !allowedTypes.includes(f.mimetype));
  if (invalidFiles.length > 0) {
    return res.status(400).json({
      error: 'Validation Error',
      message: `Invalid file type(s): ${invalidFiles.map(f => f.originalname).join(', ')}. Allowed: jpeg, png, gif, webp.`,
    });
  }

  const maxSize = 5 * 1024 * 1024;
  const oversizedFiles = req.files.filter(f => f.size > maxSize);
  if (oversizedFiles.length > 0) {
    return res.status(400).json({
      error: 'Validation Error',
      message: `File(s) too large: ${oversizedFiles.map(f => f.originalname).join(', ')}. Max size is 5MB.`,
    });
  }

  try {
    const existing = await pool.query('SELECT * FROM questions WHERE question_id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: `Question with ID ${id} not found.` });
    }

    const uploadPromises = req.files.map(file =>
      uploadImage(file.buffer, file.originalname, file.mimetype)
    );
    const newUrls = await Promise.all(uploadPromises);

    const result = await pool.query(
      `UPDATE questions
       SET image_urls = image_urls || $1::text[]
       WHERE question_id = $2
       RETURNING *`,
      [newUrls, id]
    );

    return res.status(200).json({
      message: `${newUrls.length} image(s) uploaded successfully.`,
      uploadedUrls: newUrls,
      imageUrls: result.rows[0].image_urls,
    });
  } catch (err) {
    console.error('[uploadQuestionImages]', err);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

// ── DELETE /questions/:id/images ──────────────────────────────
const deleteQuestionImage = async (req, res) => {
  const { id } = req.params;
  const { imageUrl } = req.body;

  if (isNaN(parseInt(id))) {
    return res.status(400).json({ error: 'Bad Request', message: 'Question ID must be a number.' });
  }

  if (!imageUrl) {
    return res.status(400).json({ error: 'Bad Request', message: 'imageUrl is required in the request body.' });
  }

  try {
    const existing = await pool.query('SELECT * FROM questions WHERE question_id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: `Question with ID ${id} not found.` });
    }

    const currentUrls = existing.rows[0].image_urls;
    if (!currentUrls.includes(imageUrl)) {
      return res.status(404).json({ error: 'Not Found', message: 'Image URL not found on this question.' });
    }

    await deleteImage(imageUrl);

    const updatedUrls = currentUrls.filter(url => url !== imageUrl);
    const result = await pool.query(
      'UPDATE questions SET image_urls = $1 WHERE question_id = $2 RETURNING image_urls',
      [updatedUrls, id]
    );

    return res.status(200).json({
      message: 'Image deleted successfully.',
      imageUrls: result.rows[0].image_urls,
    });
  } catch (err) {
    console.error('[deleteQuestionImage]', err);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};

export { uploadQuestionImages, deleteQuestionImage };