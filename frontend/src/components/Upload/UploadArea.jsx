import { useState, useCallback } from 'react';
import { uploadVideo } from '../../services/api';

export default function UploadArea({ onUpload, compact = false }) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await processFile(files[0]);
    }
  }, []);

  const handleFileSelect = async (e) => {
    if (e.target.files.length > 0) {
      await processFile(e.target.files[0]);
    }
  };

  const processFile = async (file) => {
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    const isAudio = file.type.startsWith('audio/');

    if (!isVideo && !isImage && !isAudio) {
      alert('Please upload a video, image, or audio file');
      return;
    }

    setUploading(true);
    try {
      // images and audios might need different endpoints if backend splits them, 
      // but usually uploadVideo handles generic multipart
      const response = await uploadVideo(file, (percent) => {
        setProgress(percent);
      });

      const assetData = response.data;
      // Backend now returns type, but ensure duration is set for images
      if (assetData.type === 'image' && !assetData.duration) {
        assetData.duration = 5; // Default 5 seconds for images
      }

      onUpload(assetData);
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload file');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  if (compact) {
    return (
      <div className="w-full">
        {uploading ? (
          <div className="h-10 flex items-center justify-center bg-slate-800 rounded border border-slate-600">
            <div className="w-full px-2">
              <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
          </div>
        ) : (
          <label
            className={`flex items-center justify-center h-10 w-full border-2 border-dashed rounded cursor-pointer transition-colors ${isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-slate-600 hover:border-slate-500 hover:bg-slate-700'}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input type="file" className="hidden" accept="video/*,image/*,audio/*" onChange={handleFileSelect} />
            <span className="text-xs text-slate-400 font-medium">+ Import Media</span>
          </label>
        )}
      </div>
    );
  }

  // Full Screen / Large version (Original)
  return (
    <div
      className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed m-8 rounded-xl transition-colors ${isDragging
        ? 'border-blue-500 bg-blue-500/10'
        : 'border-slate-700 hover:border-slate-600 bg-slate-800/50'
        }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {uploading ? (
        <div className="w-64 space-y-4 text-center">
          <div className="text-blue-400 font-medium">Uploading... {progress}%</div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center mx-auto text-3xl">
            📁
          </div>
          <div>
            <h3 className="text-lg font-medium text-white">Drop your media here</h3>
            <p className="text-slate-400 text-sm">or click to browse</p>
          </div>
          <label className="inline-block px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer font-medium text-white transition-colors">
            Select File
            <input
              type="file"
              className="hidden"
              accept="video/*,image/*,audio/*"
              onChange={handleFileSelect}
            />
          </label>
        </div>
      )}
    </div>
  );
}
