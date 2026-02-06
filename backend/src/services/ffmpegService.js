import ffmpeg from 'fluent-ffmpeg';
import { promisify } from 'util';
import { fileExists } from '../utils/fileHandler.js';

// Promisify ffprobe
const ffprobeAsync = promisify(ffmpeg.ffprobe);

/**
 * Get video metadata (duration, resolution, codec, etc.)
 */
export async function getVideoInfo(filePath) {
  if (!(await fileExists(filePath))) {
    throw new Error(`Video file not found: ${filePath}`);
  }

  try {
    const metadata = await ffprobeAsync(filePath);
    const videoStream = metadata.streams.find(s => s.codec_type === 'video');
    const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

    return {
      duration: parseFloat(metadata.format.duration) || 0,
      size: parseInt(metadata.format.size) || 0,
      bitrate: parseInt(metadata.format.bit_rate) || 0,
      format: metadata.format.format_name,
      video: videoStream
        ? {
            codec: videoStream.codec_name,
            width: videoStream.width,
            height: videoStream.height,
            fps: videoStream.r_frame_rate
              ? parseFloat(videoStream.r_frame_rate.split('/').reduce((a, b) => parseFloat(a) / parseFloat(b))) || 30
              : 30,
          }
        : null,
      audio: audioStream
        ? {
            codec: audioStream.codec_name,
            sampleRate: audioStream.sample_rate,
            channels: audioStream.channels,
          }
        : null,
    };
  } catch (error) {
    throw new Error(`Failed to get video info: ${error.message}`);
  }
}

/**
 * Trim video clip
 * FFmpeg command: ffmpeg -i input.mp4 -ss START -t DURATION -c copy output.mp4
 */
export async function trimVideo(inputPath, outputPath, startTime, duration) {
  if (!(await fileExists(inputPath))) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .seekInput(startTime)
      .duration(duration)
      .outputOptions('-c copy') // Stream copy (fast, no re-encoding)
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => {
        reject(new Error(`FFmpeg trim error: ${err.message}`));
      })
      .run();
  });
}

/**
 * Split video at timestamp (creates two clips)
 */
export async function splitVideo(inputPath, outputPath1, outputPath2, splitTime) {
  if (!(await fileExists(inputPath))) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const videoInfo = await getVideoInfo(inputPath);
  const totalDuration = videoInfo.duration;

  if (splitTime <= 0 || splitTime >= totalDuration) {
    throw new Error(`Split time must be between 0 and ${totalDuration}`);
  }

  // First clip: from start to splitTime
  await trimVideo(inputPath, outputPath1, 0, splitTime);

  // Second clip: from splitTime to end
  const secondDuration = totalDuration - splitTime;
  await trimVideo(inputPath, outputPath2, splitTime, secondDuration);

  return { firstClip: outputPath1, secondClip: outputPath2 };
}

/**
 * Concatenate multiple videos
 * Uses concat demuxer for better performance
 */
export async function concatVideos(videoPaths, outputPath, concatFile) {
  // Verify all input files exist
  for (const videoPath of videoPaths) {
    if (!(await fileExists(videoPath))) {
      throw new Error(`Input file not found: ${videoPath}`);
    }
  }

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatFile)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions([
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '192k',
      ])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => {
        reject(new Error(`FFmpeg concat error: ${err.message}`));
      })
      .run();
  });
}

/**
 * Export final video from project data
 * Applies trims and concatenates clips in order
 */
export async function exportVideo(projectData, outputPath, tempDir) {
  const fs = await import('fs/promises');
  const path = await import('path');

  // Create temporary trimmed clips
  const trimmedClips = [];
  const concatList = [];

  try {
    for (let i = 0; i < projectData.clips.length; i++) {
      const clip = projectData.clips[i];
      const trimmedPath = path.join(tempDir, `trimmed-${clip.id}.mp4`);

      // Calculate trim parameters
      const startTime = clip.trimStart || 0;
      const clipDuration = (clip.trimEnd || clip.endTime) - startTime;

      // Trim the clip
      await trimVideo(clip.videoPath, trimmedPath, startTime, clipDuration);
      trimmedClips.push(trimmedPath);

      // Add to concat list
      concatList.push(`file '${trimmedPath.replace(/\\/g, '/')}'`);
    }

    // Create concat file
    const concatFilePath = path.join(tempDir, 'concat.txt');
    await fs.writeFile(concatFilePath, concatList.join('\n'));

    // Concatenate all clips
    await concatVideos(trimmedClips, outputPath, concatFilePath);

    // Cleanup temporary files
    for (const tempFile of trimmedClips) {
      await fs.unlink(tempFile).catch(() => {});
    }
    await fs.unlink(concatFilePath).catch(() => {});

    return outputPath;
  } catch (error) {
    // Cleanup on error
    for (const tempFile of trimmedClips) {
      await fs.unlink(tempFile).catch(() => {});
    }
    throw error;
  }
}
