import { ENV } from "./_core/env";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "..", "dist", "public");
const uploadsDir = path.join(publicDir, "uploads");

type StorageConfig = { baseUrl: string };

function ensureUploadsDir() {
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
}

function getLocalUrl(fileKey: string) {
  // servido pelo express a partir do dist/public
  return `/uploads/${fileKey.replace(/^uploads\//, "")}`;
}

function getPublicBaseUrl() {
  // base pública se houver, ou vazio
  // se vazio, retornamos paths relativos (ex: /uploads/...)
  const base = (ENV.PUBLIC_URL || "").replace(/\/+$/, "");
  return base;
}

function withBaseUrl(relativeOrAbsolute: string) {
  const base = getPublicBaseUrl();
  if (!base) return relativeOrAbsolute;
  if (/^https?:\/\//i.test(relativeOrAbsolute)) return relativeOrAbsolute;
  return `${base}${relativeOrAbsolute.startsWith("/") ? "" : "/"}${relativeOrAbsolute}`;
}

function isS3Enabled() {
  return !!(ENV.AWS_S3_BUCKET && ENV.AWS_REGION);
}

function getS3Client() {
  // AWS SDK pega credenciais automaticamente via ENV/AWS metadata.
  // Se você definir AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY no Render, funciona.
  return new S3Client({
    region: ENV.AWS_REGION,
    credentials: ENV.AWS_ACCESS_KEY_ID && ENV.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: ENV.AWS_ACCESS_KEY_ID,
          secretAccessKey: ENV.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
  });
}

export async function storagePut(fileKey: string, buffer: Buffer, mimeType: string): Promise<{ url: string; key: string }> {
  // fileKey esperado: uploads/<tenant>/<user>/<...>
  if (isS3Enabled()) {
    const client = getS3Client();
    const bucket = ENV.AWS_S3_BUCKET!;

    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: fileKey,
      Body: buffer,
      ContentType: mimeType,
      ACL: ENV.AWS_S3_PUBLIC === "true" ? "public-read" : undefined,
    });

    await client.send(cmd);

    const base = ENV.AWS_S3_PUBLIC_URL?.replace(/\/+$/, "");
    // se tiver base pública configurada, usa; senão tenta o padrão do S3
    const url = base ? `${base}/${fileKey}` : `https://${bucket}.s3.${ENV.AWS_REGION}.amazonaws.com/${fileKey}`;
    return { url, key: fileKey };
  }

  // Local storage (para dev / sem S3)
  ensureUploadsDir();

  // no disco local, salvamos dentro de dist/public/uploads
  // para não criar subpastas bizarras, removemos o prefixo "uploads/"
  const relativeKey = fileKey.replace(/^uploads\//, "");
  const diskPath = path.join(uploadsDir, relativeKey);

  // garante pastas
  fs.mkdirSync(path.dirname(diskPath), { recursive: true });

  fs.writeFileSync(diskPath, buffer);

  const url = withBaseUrl(getLocalUrl(fileKey));
  return { url, key: fileKey };
}

export async function storageDelete(fileKey: string): Promise<void> {
  if (isS3Enabled()) {
    const client = getS3Client();
    const bucket = ENV.AWS_S3_BUCKET!;

    const cmd = new DeleteObjectCommand({
      Bucket: bucket,
      Key: fileKey,
    });

    await client.send(cmd);
    return;
  }

  // local
  const relativeKey = fileKey.replace(/^uploads\//, "");
  const diskPath = path.join(uploadsDir, relativeKey);

  try {
    if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
  } catch {
    // ignore
  }
}

export async function storageGetSignedReadUrl(fileKey: string, expiresInSeconds = 3600): Promise<string> {
  if (!isS3Enabled()) {
    // local: já é público/servido
    return withBaseUrl(getLocalUrl(fileKey));
  }

  const client = getS3Client();
  const bucket = ENV.AWS_S3_BUCKET!;

  const cmd = new GetObjectCommand({
    Bucket: bucket,
    Key: fileKey,
  });

  const url = await getSignedUrl(client, cmd, { expiresIn: expiresInSeconds });
  return url;
}

export async function storageGetSignedPutUrl(
  fileKey: string,
  mimeType: string,
  expiresInSeconds = 3600
): Promise<string> {
  if (!isS3Enabled()) {
