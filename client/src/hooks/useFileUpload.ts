import { useState } from "react";
import { trpc } from "../lib/trpcClient";

interface UploadProgress {
  percentage: number;
  loaded: number;
  total: number;
}

interface UploadResult {
  success: boolean;
  fileId?: number;
  publicUrl?: string;
  error?: string;
}

export function useFileUpload() {
  const uploadMutation = trpc.upload.upload.useMutation();

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress>({
    percentage: 0,
    loaded: 0,
    total: 0,
  });

  const resetProgress = () => {
    setProgress({
      percentage: 0,
      loaded: 0,
      total: 0,
    });
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        resolve(reader.result as string);
      };

      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const uploadFile = async (
    file: File,
    relatedNotificationId?: number
  ): Promise<UploadResult> => {
    try {
      setUploading(true);
      resetProgress();

      // 🔥 Simula progresso enquanto converte para base64
      setProgress({
        percentage: 10,
        loaded: 0,
        total: file.size,
      });

      const base64 = await fileToBase64(file);

      setProgress({
        percentage: 40,
        loaded: file.size * 0.4,
        total: file.size,
      });

      const result = await uploadMutation.mutateAsync({
        filename: file.name,
        fileData: base64,
        mimeType: file.type,
        relatedNotificationId,
      });

      setProgress({
        percentage: 100,
        loaded: file.size,
        total: file.size,
      });

      return {
        success: true,
        fileId: result.fileId,
        publicUrl: result.url,
      };
    } catch (error: any) {
      console.error("Erro no upload:", error);

      return {
        success: false,
        error: error?.message || "Erro no upload",
      };
    } finally {
      setUploading(false);
      setTimeout(resetProgress, 800);
    }
  };

  return {
    uploadFile,
    uploading,
    progress,
  };
}
