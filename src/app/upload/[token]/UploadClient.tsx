"use client";

import { useState, useRef, useCallback } from "react";
import { extractExifData, isExifSupported } from "@/lib/utils/exif";

interface UploadedPhoto {
  url: string;
  name: string;
}

interface FailedUpload {
  name: string;
  error: string;
}

export function UploadClient({ token }: { token: string }) {
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedPhoto[]>([]);
  const [failedUploads, setFailedUploads] = useState<FailedUpload[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileList) => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;

      setIsUploading(true);
      setTotalFiles(fileArray.length);
      setCurrentIndex(0);

      for (let i = 0; i < fileArray.length; i++) {
        setCurrentIndex(i + 1);
        const file = fileArray[i];

        try {
          // Extract EXIF data if supported
          let exifData = {};
          if (isExifSupported(file)) {
            exifData = await extractExifData(file);
          }

          const formData = new FormData();
          formData.append("file", file);
          formData.append("token", token);
          formData.append("exifData", JSON.stringify(exifData));

          const response = await fetch("/api/upload/public", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Upload failed (${response.status})`);
          }

          const data = await response.json();

          setUploadedPhotos((prev) => [
            ...prev,
            { url: data.photoUrl || URL.createObjectURL(file), name: file.name },
          ]);
        } catch (error) {
          setFailedUploads((prev) => [
            ...prev,
            {
              name: file.name,
              error: error instanceof Error ? error.message : "Upload failed",
            },
          ]);
        }
      }

      setIsUploading(false);
    },
    [token]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
    // Reset input so the same files can be re-selected
    e.target.value = "";
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const hasUploaded = uploadedPhotos.length > 0;
  const totalUploaded = uploadedPhotos.length;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4 text-center">
        <h1 className="text-xl font-bold text-gray-900">
          🏄 SurfSync
        </h1>
      </header>

      <div className="flex-1 px-4 py-6">
        {/* Upload area */}
        <div className="mb-6">
          {!isUploading && !hasUploaded && (
            <>
              <p className="text-gray-600 text-center mb-6 text-sm">
                Select surf photos from your phone to upload them to your
                SurfSync account.
              </p>
              <button
                onClick={openFilePicker}
                className="w-full rounded-xl bg-blue-600 px-6 py-4 text-lg font-semibold text-white active:bg-blue-700 transition-colors"
              >
                Select Photos
              </button>
            </>
          )}

          {isUploading && (
            <div className="text-center">
              <div className="mb-4">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-r-transparent" />
              </div>
              <p className="text-gray-700 font-medium">
                Uploading {currentIndex} of {totalFiles} photos...
              </p>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-300"
                  style={{
                    width: `${(currentIndex / totalFiles) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          {!isUploading && hasUploaded && (
            <div className="text-center mb-6">
              <div className="text-3xl mb-2">✓</div>
              <p className="text-gray-900 font-semibold text-lg">
                {totalUploaded} photo{totalUploaded !== 1 ? "s" : ""} uploaded!
              </p>
              <p className="text-gray-500 text-sm mt-1">
                You can close this page or add more photos.
              </p>
            </div>
          )}
        </div>

        {/* Failed uploads */}
        {failedUploads.length > 0 && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-3">
            <p className="text-red-800 text-sm font-medium mb-1">
              {failedUploads.length} upload{failedUploads.length !== 1 ? "s" : ""} failed
            </p>
            {failedUploads.map((f, i) => (
              <p key={i} className="text-red-600 text-xs truncate">
                {f.name}: {f.error}
              </p>
            ))}
          </div>
        )}

        {/* Photo thumbnails grid */}
        {uploadedPhotos.length > 0 && (
          <div className="mb-6">
            <p className="text-gray-500 text-xs font-medium uppercase tracking-wide mb-2">
              Uploaded Photos
            </p>
            <div className="grid grid-cols-3 gap-2">
              {uploadedPhotos.map((photo, i) => (
                <div
                  key={i}
                  className="aspect-square overflow-hidden rounded-lg bg-gray-200"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.name}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add more photos button */}
        {!isUploading && hasUploaded && (
          <button
            onClick={openFilePicker}
            className="w-full rounded-xl border-2 border-blue-600 px-6 py-4 text-lg font-semibold text-blue-600 active:bg-blue-50 transition-colors"
          >
            Add More Photos
          </button>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </div>
  );
}
