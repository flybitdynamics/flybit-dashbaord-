"use client";

import { useState } from "react";

interface FileUploadProps {
  label?: string;
  folder?: string;
  initialUrl?: string;
  onUploadComplete: (url: string, data: { key: string; fileName: string }) => void;
  onRemove?: () => void;
}

export function FileUpload({
  label = "Upload Image / File",
  folder = "CRM",
  initialUrl = "",
  onUploadComplete,
  onRemove,
}: FileUploadProps) {
  const [fileUrl, setFileUrl] = useState<string>(initialUrl);
  const [uploading, setUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to upload file");
      }

      setFileUrl(data.url);
      onUploadComplete(data.url, { key: data.key, fileName: data.fileName });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error uploading file";
      setError(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    setFileUrl("");
    setError(null);
    if (onRemove) onRemove();
  };

  return (
    <div className="flex flex-col gap-2">
      {label && <label className="text-xs font-medium text-neutral-700">{label}</label>}

      {fileUrl ? (
        <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <div className="flex items-center gap-3 overflow-hidden">
            {fileUrl.match(/\.(jpeg|jpg|gif|png|webp|svg)/i) ? (
              <img
                src={fileUrl}
                alt="Uploaded file preview"
                className="h-10 w-10 rounded-md object-cover border border-neutral-200"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-neutral-200 text-xs font-bold text-neutral-600">
                FILE
              </div>
            )}
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              className="truncate text-xs font-medium text-neutral-800 hover:underline"
            >
              {fileUrl.split("/").pop()}
            </a>
          </div>

          <button
            type="button"
            onClick={handleRemove}
            className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1"
          >
            Remove
          </button>
        </div>
      ) : (
        <div className="relative flex flex-col items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-white p-4 text-center transition-colors hover:border-neutral-400">
          <input
            type="file"
            onChange={handleFileChange}
            disabled={uploading}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
          {uploading ? (
            <span className="text-xs text-neutral-500 font-medium animate-pulse">
              Uploading to Cloudflare R2 ({folder}/)...
            </span>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs font-medium text-neutral-700">
                Click or drag file to upload
              </span>
              <span className="text-[11px] text-neutral-400">
                Files are saved to <code className="bg-neutral-100 px-1 py-0.5 rounded">{folder}/</code> in R2
              </span>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
    </div>
  );
}
