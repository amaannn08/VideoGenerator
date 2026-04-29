import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';

const REGION = 'eu-north-1';
const BUCKET_NAME = 'videogen-media-amannngupta-eun1';

// IAM Role attached to EC2 handles auth automatically
const s3Client = new S3Client({ region: REGION });

/**
 * Uploads a local file to S3 and returns its public URL
 * @param {string} localPath - Absolute path to the local file
 * @param {string} mimeType - e.g., 'image/jpeg', 'video/mp4'
 * @param {string} prefix - Optional prefix for the S3 key (e.g., 'sessions/xyz/images')
 * @returns {Promise<string>} The public S3 URL
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

    // Construct the public URL
    const publicUrl = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${s3Key}`;
    
    console.log(`[S3 Upload] Successfully uploaded ${fileName} to ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    console.error('[S3 Upload] Error uploading to S3:', error);
    throw error;
  }
}
