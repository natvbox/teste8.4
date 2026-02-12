import { ENV } from './_core/env';
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, '..', 'dist', 'public', 'uploads');

type StorageConfig = { baseUrl: string; apiKey: string; mode: 'local' | 's3' | 'proxy' };

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

function getStorageConfig(): StorageConfig {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;

  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_S3_BUCKET) {
    return { baseUrl: "s3", apiKey: "s3", mode: 's3' };
  }

  if (baseUrl && apiKey) {
    return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, mode: 'proxy' };
  }

  return { baseUrl: "", apiKey: "", mode: 'local' };
}

function ensureUploadsDir(): void {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function buildUploadUrl(baseUrl: string, relKey: string): URL {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}

async function buildDownloadUrl(
  baseUrl: string,
  relKey: string,
  apiKey: string
): Promise<string> {
  const downloadApiUrl = new URL(
    "v1/storage/downloadUrl",
    ensureTrailingSlash(baseUrl)
  );
  downloadApiUrl.searchParams.set("path", normalizeKey(relKey));
  const response = await fetch(downloadApiUrl, {
    method: "GET",
    headers: buildAuthHeaders(apiKey),
  });
  return (await response.json()).url;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function toFormData(
  data: Buffer | Uint8Array | string,
  contentType: string,
  fileName: string
): FormData {
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}

function buildAuthHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const config = getStorageConfig();
  const key = normalizeKey(relKey);

  if (config.mode === 'local') {
    ensureUploadsDir();
    const filename = key.split('/').pop() || key;
    const localPath = path.join(uploadsDir, filename);
    
    const buffer = data instanceof Buffer ? data : Buffer.from(data as any);
    fs.writeFileSync(localPath, buffer);
    
    const url = `/uploads/${filename}`;
    console.log(`[Storage] Arquivo salvo localmente: ${localPath}`);
    return { key, url };
  }

  if (config.mode === 's3') {
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Body: data instanceof Buffer ? data : Buffer.from(data as any),
      ContentType: contentType,
    });
    await s3Client.send(command);
    const url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com/${key}`;
    return { key, url };
  }

  const { baseUrl, apiKey } = config;
  const uploadUrl = buildUploadUrl(baseUrl, key);
  const formData = toFormData(data, contentType, key.split("/").pop() ?? key);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: buildAuthHeaders(apiKey),
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Storage upload failed (${response.status} ${response.statusText}): ${message}`
    );
  }
  const url = (await response.json()).url;
  return { key, url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string; }> {
  const config = getStorageConfig();
  const key = normalizeKey(relKey);

  if (config.mode === 'local') {
    const filename = key.split('/').pop() || key;
    const url = `/uploads/${filename}`;
    return { key, url };
  }

  if (config.mode === 's3') {
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
    });
    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    return { key, url };
  }

  const { baseUrl, apiKey } = config;
  return {
    key,
    url: await buildDownloadUrl(baseUrl, key, apiKey),
  };
}
