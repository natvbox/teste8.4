import React, { useRef, useState } from "react";
import { Upload, X, Image, Video, FileIcon } from "lucide-react";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { useFileUpload } from "../hooks/useFileUpload";
import { cn } from "../lib/utils";
import { toast } from "sonner";

interface FileUploaderProps {
  onUploadComplete?: (fileId: number, publicUrl: string) => void;
  relatedNotificationId?: number;
  accept?: string;
  maxFiles?: number;
  className?: string;
  /**
   * Se true, faz upload automaticamente após selecionar arquivos.
   * Isso evita ter um "segundo botão" de envio na tela.
   */
  autoUpload?: boolean;

  /**
   * Limite por arquivo (bytes). Default: 100MB
   */
  maxFileSizeBytes?: number;
}

const DEFAULT_MAX_BYTES = 100 * 1024 * 1024; // 100MB

function parseAccept(accept: string): string[] {
  return accept
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isAcceptedFile(file: File, accept: string): boolean {
  const rules = parseAccept(accept);
  if (rules.length === 0) return true;

  const mime = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();

  // regras:
  // - image/*, video/*
  // - image/png etc
  // - .png etc
  return rules.some((rule) => {
    if (rule.endsWith("/*")) {
      const prefix = rule.slice(0, -2); // image, video
      return mime.startsWith(prefix + "/");
    }
    if (rule.startsWith(".")) {
      return name.endsWith(rule);
    }
    // tipo exato
    return mime === rule;
  });
}

export function FileUploader({
  onUploadComplete,
  relatedNotificationId,
  accept = "image/*,video/*",
  maxFiles = 5,
  className,
  autoUpload = true,
  maxFileSizeBytes = DEFAULT_MAX_BYTES,
}: FileUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const { uploadFile, uploading, progress } = useFileUpload();

  const resetSelection = () => {
    setSelectedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const validateFiles = (files: File[]): { ok: boolean; reason?: string } => {
    if (!files.length) return { ok: true };

    for (const f of files) {
      if (!isAcceptedFile(f, accept)) {
        return {
          ok: false,
          reason: `Arquivo não permitido: ${f.name}`,
        };
      }
      if (f.size > maxFileSizeBytes) {
        const mb = (maxFileSizeBytes / (1024 * 1024)).toFixed(0);
        return {
          ok: false,
          reason: `Arquivo muito grande: ${f.name} (máx ${mb}MB)`,
        };
      }
    }
    return { ok: true };
  };

  const uploadFiles = async (files: File[]) => {
    for (const file of files) {
      try {
        const result = await uploadFile(file, relatedNotificationId);

        if (result?.success && result.fileId && result.publicUrl) {
          onUploadComplete?.(Number(result.fileId), result.publicUrl);
        } else if (result?.error) {
          toast.error(result.error);
          return;
        } else if (!result?.success) {
          toast.error("Falha no upload");
          return;
        }
      } catch (e: any) {
        toast.error(e?.message || "Falha no upload");
        return;
      }
    }

    resetSelection();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    // valida maxFiles
    if (files.length + selectedFiles.length > maxFiles) {
      toast.error(`Você pode selecionar no máximo ${maxFiles} arquivo(s)`);
      // limpa o input para permitir escolher de novo
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // valida tipo/tamanho
    const validation = validateFiles(files);
    if (!validation.ok) {
      toast.error(validation.reason || "Arquivo inválido");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const next = [...selectedFiles, ...files];
    setSelectedFiles(next);

    if (autoUpload) {
      // Faz upload apenas dos arquivos recém selecionados
      await uploadFiles(files);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (!selectedFiles.length) return;

    const validation = validateFiles(selectedFiles);
    if (!validation.ok) {
      toast.error(validation.reason || "Arquivo inválido");
      return;
    }

    await uploadFiles(selectedFiles);
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith("image/")) {
      return <Image className="w-8 h-8" />;
    } else if (file.type.startsWith("video/")) {
      return <Video className="w-8 h-8" />;
    }
    return <FileIcon className="w-8 h-8" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Área de seleção de arquivos */}
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
          "border-border hover:border-muted-foreground/50",
          uploading ? "opacity-70 pointer-events-none" : ""
        )}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-sm text-muted-foreground mb-2">
          Clique para selecionar arquivos ou arraste e solte
        </p>
        <p className="text-xs text-muted-foreground">
          Imagens e vídeos até {(maxFileSizeBytes / (1024 * 1024)).toFixed(0)}MB
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple={maxFiles > 1}
          className="hidden"
          onChange={handleFileSelect}
          disabled={uploading}
        />
      </div>

      {/* Lista de arquivos selecionados */}
      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Arquivos selecionados:</h3>
          {selectedFiles.map((file, index) => (
            <div
              key={`${file.name}-${file.size}-${index}`}
              className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg border border-border"
            >
              {getFileIcon(file)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(file.size)}
                </p>
              </div>

              {!uploading && (
                <button
                  type="button"
                  onClick={() => handleRemoveFile(index)}
                  className="p-1 hover:bg-muted rounded"
                  aria-label="Remover arquivo"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Barra de progresso */}
      {uploading && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Enviando...</span>
            <span>{progress.percentage}%</span>
          </div>
          <Progress value={progress.percentage} />
        </div>
      )}

      {/* Botão de upload manual */}
      {selectedFiles.length > 0 && !uploading && !autoUpload && (
        <Button onClick={handleUpload} className="w-full">
          Enviar {selectedFiles.length} arquivo
          {selectedFiles.length > 1 ? "s" : ""}
        </Button>
      )}
    </div>
  );
}
