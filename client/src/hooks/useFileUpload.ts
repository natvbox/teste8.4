import { useState } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadResult {
  success: boolean;
  fileId?: number;
  publicUrl?: string;
  error?: string;
}

// remove "data:mime;base64," se vier DataURL
function stripDataUrlPrefix(dataUrl: string) {
  const idx = dataUrl.indexOf("base64,");
  if (idx >= 0) return dataUrl.slice(idx + "base64,".length);
  return dataUrl;
}

export function useFileUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress>({
    loaded: 0,
    total: 0,
    percentage: 0,
  });

  const uploadMutation = trpc.upload.upload.useMutation();

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = (error) => reject(error);
    });

  const uploadFile = async (
    file: File,
    relatedNotificationId?: number
  ): Promise<UploadResult> => {
    try {
      setUploading(true);
      setProgress({ loaded: 0, total: file.size, percentage: 5 });

      // ✅ Mantém só imagem/vídeo (coerente com FileUploader)
      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "video/mp4",
        "video/webm",
        "video/quicktime",
      ];

      if (!allowedTypes.includes(file.type)) {
        const msg = "Tipo de arquivo não permitido";
        toast.error(msg);
        return { success: false, error: msg };
      }

      const maxSize = 100 * 1024 * 1024; // 100MB
      if (file.size > maxSize) {
        const msg = "Arquivo muito grande (máximo 100MB)";
        toast.error(msg);
        return { success: false, error: msg };
      }

      setProgress((p) => ({ ...p, percentage: 15 }));

      // ⚠️ ainda é base64 via tRPC (vamos migrar depois para multipart/presigned)
      const dataUrl = await fileToDataUrl(file);
      const base64 = stripDataUrlPrefix(dataUrl);

      setProgress((p) => ({ ...p, percentage: 55 }));

      const result = await uploadMutation.mutateAsync({
        filename: file.name,
        fileData: base64, // ✅ manda base64 puro (menos payload)
        mimeType: file.type,
        relatedNotificationId,
      });

      if (result?.success) {
        setProgress({ loaded: file.size, total: file.size, percentage: 100 });
        toast.success("Arquivo enviado com sucesso");

        return {
          success: true,
          fileId: result.fileId ? Number(result.fileId) : undefined,
          publicUrl: result.url,
        };
      }

      // se o backend retornar {success:false, error:"..."}
      const backendMsg =
        (result as any)?.error || "Erro no upload";

      toast.error(backendMsg);
      return { success: false, error: backendMsg };
    } catch (error) {
      console.error("Erro no upload:", error);
      const msg = error instanceof Error ? error.message : "Erro ao enviar arquivo";
      toast.error(msg);
      return { success: false, error: msg };
    } finally {
      setUploading(false);
    }
  };

  const uploadMultipleFiles = async (
    files: File[],
    relatedNotificationId?: number
  ): Promise<UploadResult[]> => {
    const results: UploadResult[] = [];
    for (const file of files) {
      // serial (evita overload)
      const r = await uploadFile(file, relatedNotificationId);
      results.push(r);
    }
    return results;
  };

  return {
    uploadFile,
    uploadMultipleFiles,
    uploading,
    progress,
  };
}
