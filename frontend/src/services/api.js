import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Upload video file
export async function uploadVideo(file, onProgress) {
  const formData = new FormData();
  formData.append('video', file);

  return api.post('/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const percentCompleted = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
        onProgress(percentCompleted);
      }
    },
  });
}

// Get video info
export async function getVideoInfo(videoId) {
  return api.get(`/video/${videoId}/info`);
}

// Get video stream URL
export function getVideoUrl(videoId) {
  return `${API_BASE_URL}/video/${videoId}`;
}

// Get video thumbnails
export async function getVideoThumbnails(videoId) {
  return api.get(`/video/${videoId}/thumbnails`);
}

// Get absolute thumbnail URL
export function getThumbnailUrl(thumbnailPath) {
  return `${import.meta.env.VITE_API_URL || ''}${thumbnailPath}`;
}

// Get waveform URL
export function getWaveformUrl(videoId) {
  return `${API_BASE_URL}/video/${videoId}/waveform`;
}

// Trim video
export async function trimVideo(videoId, startTime, duration) {
  return api.post('/video/trim', {
    videoId,
    startTime,
    duration,
  });
}

// Split video
export async function splitVideo(videoId, splitTime) {
  return api.post('/video/split', {
    videoId,
    splitTime,
  });
}

// Start export
export async function startExport(projectData) {
  return api.post('/export', projectData);
}

// Get export status
export async function getExportStatus(jobId) {
  return api.get(`/export/${jobId}/status`);
}

// Get export download URL
export function getExportDownloadUrl(jobId) {
  return `${API_BASE_URL}/export/${jobId}/download`;
}

// Save project
export async function saveProject(projectData) {
  return api.post('/projects', projectData);
}

// Load project
export async function loadProject(projectId) {
  return api.get(`/projects/${projectId}`);
}

// Load project from file content
export async function loadProjectFromContent(content) {
  return api.post('/projects/load-from-content', { content });
}

export default api;
