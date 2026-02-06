const ALLOWED_VIDEO_TYPES = ['.mp4', '.webm', '.mov', '.avi'];
const ALLOWED_IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
const ALLOWED_AUDIO_TYPES = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

export function validateVideoFile(file) {
  if (!file) {
    throw new Error('No file provided');
  }

  const ext = file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (!ext || !ALLOWED_VIDEO_TYPES.includes(ext)) {
    throw new Error(
      `Invalid file type. Allowed types: ${ALLOWED_VIDEO_TYPES.join(', ')}`
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  return true;
}

export function validateMediaFile(file) {
  if (!file) {
    throw new Error('No file provided');
  }

  const ext = file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0];
  const allAllowedTypes = [...ALLOWED_VIDEO_TYPES, ...ALLOWED_IMAGE_TYPES, ...ALLOWED_AUDIO_TYPES];
  
  if (!ext || !allAllowedTypes.includes(ext)) {
    throw new Error(
      `Invalid file type. Allowed types: ${allAllowedTypes.join(', ')}`
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  return true;
}

export function getFileType(file) {
  const ext = file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (ALLOWED_VIDEO_TYPES.includes(ext)) return 'video';
  if (ALLOWED_IMAGE_TYPES.includes(ext)) return 'image';
  if (ALLOWED_AUDIO_TYPES.includes(ext)) return 'audio';
  return 'unknown';
}

export function validateTimestamp(timestamp) {
  if (typeof timestamp !== 'number' || timestamp < 0) {
    throw new Error('Timestamp must be a non-negative number');
  }
  return true;
}

export function validateDuration(duration) {
  if (typeof duration !== 'number' || duration <= 0) {
    throw new Error('Duration must be a positive number');
  }
  return true;
}

export function validateProjectData(projectData) {
  if (!projectData || !Array.isArray(projectData.clips)) {
    throw new Error('Invalid project data: clips array is required');
  }
  return true;
}
