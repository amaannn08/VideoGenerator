import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';

const REGION = process.env.AWS_REGION || 'eu-north-1';
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'videogen-media-amannngupta-eun1';
const PRESIGNED_TTL_SECONDS = Number(process.env.S3_PRESIGNED_TTL_SECONDS || 3600);

// IAM Role attached to EC2 handles auth automatically
const s3Client = new S3Client({ region: REGION });

/**
 * Uploads a local file to S3 and returns a presigned read URL.
 * @param {string} localPath - Absolute path to the local file
 * @param {string} mimeType - e.g., 'image/jpeg', 'video/mp4'
 * @param {string} prefix - Optional prefix for the S3 key (e.g., 'sessions/xyz/images')
 * @returns {Promise<string>} A presigned S3 URL
 */
export async function uploadToS3(localPath, mimeType, prefix = 'misc') {
  try {
    const fileContent = fs.readFileSync(localPath);
    const fileName = path.basename(localPath);
    
    // Generate a unique key for the object
    const s3Key = `${prefix}/${fileName}`;
    
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: fileContent,
      ContentType: mimeType
    });

    await s3Client.send(command);

    const signedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key }),
      { expiresIn: PRESIGNED_TTL_SECONDS }
    );
    console.log(`[S3 Upload] Uploaded ${fileName} to s3://${BUCKET_NAME}/${s3Key}`);
    return signedUrl;
  } catch (error) {
    console.error('[S3 Upload] Error uploading to S3:', error);
    throw error;
  }
}
