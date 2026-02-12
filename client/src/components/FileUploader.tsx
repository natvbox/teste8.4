import React, { useRef, useState } from 'react';
import { Upload, X, Image, Video, FileIcon } from 'lucide-react';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { useFileUpload } from '../hooks/useFileUpload';
import { cn } from '../lib/utils';

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
}

export function FileUploader({
  onUploadComplete,
  relatedNotificationId,
  accept = 'image/*,video/*',
  maxFiles = 5,
  className,
  autoUpload = true,
}: FileUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const { uploadFile, uploading, progress } = useFileUpload();

  const resetSelection = () => {
    setSelectedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadFiles = async (files: File[]) => {
    for (const file of files) {
      const result = await uploadFile(file, relatedNotificationId);
      if (result.success && result.fileId && result.publicUrl) {
        onUploadComplete?.(Number(result.fileId), result.publicUrl);
      }
    }
    resetSelection();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    if (files.length + selectedFiles.length > maxFiles) {
      alert(`Você pode selecionar no máximo ${maxFiles} arquivos`);
      return;
    }

    const next = [...selectedFiles, ...files];
    setSelectedFiles(next);

    if (autoUpload && files.length > 0) {
      // Faz upload apenas dos arquivos recém selecionados
      await uploadFiles(files);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    await uploadFiles(selectedFiles);
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) {
      return <Image className="w-8 h-8 text-blue-500" />;
    } else if (file.type.startsWith('video/')) {
      return <Video className="w-8 h-8 text-purple-500" />;
    }
    return <FileIcon className="w-8 h-8 text-gray-500" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Área de seleção de arquivos */}
      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-gray-400 transition-colors"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <p className="text-sm text-gray-600 mb-2">
          Clique para selecionar arquivos ou arraste e solte
        </p>
        <p className="text-xs text-gray-500">
          Imagens (JPEG, PNG, GIF, WebP) e vídeos (MP4, WebM, MOV) até 100MB
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
              key={index}
              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
            >
              {getFileIcon(file)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
              </div>
              {!uploading && (
                <button
                  onClick={() => handleRemoveFile(index)}
                  className="p-1 hover:bg-gray-200 rounded"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Barra de progresso */}
      {uploading && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Enviando...</span>
            <span>{progress.percentage}%</span>
          </div>
          <Progress value={progress.percentage} />
        </div>
      )}

      {/* Botão de upload */}
      {selectedFiles.length > 0 && !uploading && !autoUpload && (
        <Button onClick={handleUpload} className="w-full">
          Enviar {selectedFiles.length} arquivo{selectedFiles.length > 1 ? 's' : ''}
        </Button>
      )}
    </div>
  );
}
