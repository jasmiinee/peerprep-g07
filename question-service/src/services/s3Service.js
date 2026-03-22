import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'ap-southeast-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.S3_BUCKET_NAME || 'peerprep-question-images';
const REGION = process.env.AWS_REGION || 'ap-southeast-1';

// ── Upload a file buffer to S3 ────────────────────────────────
// Returns the public URL of the uploaded image
const uploadImage = async (fileBuffer, originalFileName, mimeType) => {
  const ext = originalFileName.split('.').pop();
  const key = `questions/${uuidv4()}.${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType,
    })
  );

  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
};

// ── Delete a single image from S3 by its URL ─────────────────
const deleteImage = async (imageUrl) => {
  // Extract key from URL: https://bucket.s3.region.amazonaws.com/questions/uuid.ext
  const key = imageUrl.split('.amazonaws.com/')[1];
  if (!key) throw new Error(`Could not extract S3 key from URL: ${imageUrl}`);

  await s3.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );
};

// ── Delete multiple images from S3 ───────────────────────────
const deleteImages = async (imageUrls) => {
  if (!imageUrls || imageUrls.length === 0) return;
  await Promise.all(imageUrls.map(url => deleteImage(url)));
};

export { uploadImage, deleteImage, deleteImages };