const Minio = require('minio');
require('dotenv').config();

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || '127.0.0.1',
  port: parseInt(process.env.MINIO_PORT) || 9000,
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
});

const bucketName = process.env.MINIO_BUCKET || 'emergency-incidents';

async function initMinio() {
  try {
    const exists = await minioClient.bucketExists(bucketName);
    if (!exists) {
      await minioClient.makeBucket(bucketName, 'us-east-1');
      console.log(`MinIO bucket "${bucketName}" created.`);

      // Set public read policy so that images are directly accessible via HTTP URL
      const policy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${bucketName}/*`]
          }
        ]
      };
      await minioClient.setBucketPolicy(bucketName, JSON.stringify(policy));
      console.log(`MinIO bucket policy set to public read.`);
    } else {
      console.log(`MinIO bucket "${bucketName}" already exists.`);
    }
  } catch (err) {
    console.error('Error initializing MinIO:', err.message);
  }
}

async function uploadFile(buffer, filename, mimeType) {
  const metaData = {
    'Content-Type': mimeType
  };
  await minioClient.putObject(bucketName, filename, buffer, buffer.length, metaData);
  // Construct the public URL
  // Format: http://<MINIO_ENDPOINT>:<MINIO_PORT>/<BUCKET>/<FILENAME>
  const endpoint = process.env.MINIO_ENDPOINT === '127.0.0.1' ? 'localhost' : process.env.MINIO_ENDPOINT;
  const port = process.env.MINIO_PORT || 9000;
  return `http://${endpoint}:${port}/${bucketName}/${filename}`;
}

module.exports = {
  minioClient,
  initMinio,
  uploadFile
};
