// client/src/hooks/useFileUpload.ts
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
  fileId?: number | bigint;
  publicUrl?: string;
  error?: string;
}

export function useFileUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress>({
    loaded: 0,
    total: 0,
    percentage: 0,
  });

  const uploadMutation = trpc.upload.upload.useMutation();

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  // ✅ ADICIONADO: tenantId?: number (necessário pro owner)
  const uploadFile = async (
    file: File,
    relatedNotificationId?: number,
    tenantId?: number
  ): Promise<UploadResult> => {
    try {
      setUploading(true);
      setProgress({ loaded: 0, total: file.size, percentage: 10 });

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
        toast.error("Tipo de arquivo não permitido");
        setUploading(false);
        return { success: false, error: "Tipo de arquivo não permitido" };
      }

      const maxSize = 100 * 1024 * 1024;
      if (file.size > maxSize) {
        toast.error("Arquivo muito grande (máximo 100MB)");
        setUploading(false);
        return { success: false, error: "Arquivo muito grande" };
      }

      setProgress((prev) => ({ ...prev, percentage: 30 }));

      const base64Data = await fileToBase64(file);

      setProgress((prev) => ({ ...prev, percentage: 60 }));

      const result = await uploadMutation.mutateAsync({
        filename: file.name,
        fileData: base64Data,
        mimeType: file.type,
        relatedNotificationId,

        // ✅ NOVO: manda tenantId quando existir (owner)
        tenantId,
      });

      if (result.success) {
        toast.success("Arquivo enviado com sucesso");
        setProgress({ loaded: file.size, total: file.size, percentage: 100 });
        setUploading(false);
        return {
          success: true,
          fileId:
            typeof result.fileId === "bigint" ? Number(result.fileId) : result.fileId,
          publicUrl: result.url,
        };
      } else {
        throw new Error("Erro no upload");
      }
    } catch (error) {
      console.error("Erro no upload:", error);

      const errorMessage =
        error instanceof Error ? error.message : "Erro ao enviar arquivo";
      toast.error(errorMessage);

      setUploading(false);
      return { success: false, error: errorMessage };
    }
  };

  const uploadMultipleFiles = async (
    files: File[],
    relatedNotificationId?: number,
    tenantId?: number
  ): Promise<UploadResult[]> => {
    const results: UploadResult[] = [];
    for (const file of files) {
      const result = await uploadFile(file, relatedNotificationId, tenantId);
      results.push(result);
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
