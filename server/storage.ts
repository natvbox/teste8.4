import { ENV } from "./_core/env";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "..", "dist", "public");
const uploadsDir = path.join(publicDir, "uploads");

type StorageConfig = { baseUrl: string; apiKey: string; mode: "local" | "s3" | "proxy" };

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
    return { baseUrl: "s3", apiKey: "s3", mode: "s3" };
  }

  if (baseUrl && apiKey) {
    return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, mode: "proxy" };
  }

  return { baseUrl: "", apiKey: "", mode: "local" };
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function normalizeKey(relKey: string): string {
  // remove leading slashes
  const key = relKey.replace(/^\/+/, "");

  // bloqueia path traversal básico
  if (key.includes("..")) {
    throw new Error("Invalid storage key");
  }
  return key;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function buildUploadUrl(baseUrl: string, relKey: string): URL {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}

async function buildDownloadUrl(baseUrl: string, relKey: string, apiKey: string): Promise<string> {
  const downloadApiUrl = new URL("v1/storage/downloadUrl", ensureTrailingSlash(baseUrl));
  downloadApiUrl.searchParams.set("path", normalizeKey(relKey));
  const response = await fetch(downloadApiUrl, { method: "GET", headers: buildAuthHeaders(apiKey) });
  const json = await response.json();
  return json.url;
}

function toFormData(data: Buffer | Uint8Array | string, contentType: string, fileName: string): FormData {
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

function localAbsolutePathForKey(key: string): string {
  // grava preservando subpastas: uploads/<tenant>/<user>/<...>
  return path.join(uploadsDir, key.replace(/^uploads\//, ""));
}

function localPublicUrlForKey(key: string): string {
  // publica preservando subpastas
  const clean = key.startsWith("uploads/") ? key.slice("uploads/".length) : key;
  return `/uploads/${clean}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const config = getStorageConfig();
  const key = normalizeKey(relKey);

  if (config.mode === "local") {
    ensureDir(uploadsDir);

    const abs = localAbsolutePathForKey(key);
    ensureDir(path.dirname(abs));

    const body =
      data instanceof Buffer
        ? data
        : data instanceof Uint8Array
          ? Buffer.from(data)
          : Buffer.from(data, "utf8"); // string = texto (não base64)

    fs.writeFileSync(abs, body);

    const url = localPublicUrlForKey(key);
    console.log(`[Storage] Local write: ${abs}`);
    return { key, url };
  }

  if (config.mode === "s3") {
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Body: data instanceof Buffer ? data : data instanceof Uint8Array ? Buffer.from(data) : Buffer.from(data, "utf8"),
      ContentType: contentType,
    });
    await s3Client.send(command);

    const url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com/${key}`;
    return { key, url };
  }

  const { baseUrl, apiKey } = config;
  const uploadUrl = buildUploadUrl(baseUrl, key);
  const formData = toFormData(data, contentType, key.split("/").pop() ?? "file");
  const response = await fetch(uploadUrl, { method: "POST", headers: buildAuthHeaders(apiKey), body: formData });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Storage upload failed (${response.status} ${response.statusText}): ${message}`);
  }

  const url = (await response.json()).url;
  return { key, url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const config = getStorageConfig();
  const key = normalizeKey(relKey);

  if (config.mode === "local") {
    return { key, url: localPublicUrlForKey(key) };
  }

  if (config.mode === "s3") {
    const command = new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key });
    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    return { key, url };
  }

  const { baseUrl, apiKey } = config;
  return { key, url: await buildDownloadUrl(baseUrl, key, apiKey) };
}

export async function storageDelete(relKey: string): Promise<void> {
  const config = getStorageConfig();
  const key = normalizeKey(relKey);

  if (config.mode === "local") {
    const abs = localAbsolutePathForKey(key);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
    return;
  }

  if (config.mode === "s3") {
    const command = new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key });
    await s3Client.send(command);
    return;
  }

  // proxy mode: se existir endpoint delete, aqui seria o lugar.
  // se não existir, pelo menos não quebra.
  return;
}
