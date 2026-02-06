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
 * Generate thumbnails for a video at fixed intervals
 */
export async function generateThumbnails(videoPath, outputDir, interval = 1) {
  if (!(await fileExists(videoPath))) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  const videoInfo = await getVideoInfo(videoPath);
  const duration = videoInfo.duration;

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        count: Math.ceil(duration / interval),
        folder: outputDir,
        filename: 'thumb-%i.png',
        size: '160x90'
      })
      .on('end', () => resolve())
      .on('error', (err) => reject(new Error(`Thumbnail generation error: ${err.message}`)));
  });
}

/**
 * Export final video from project data
 * Applies trims, filters, and concatenates clips in order
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

      // Prepare FFmpeg command for the clip
      let command = ffmpeg(clip.videoPath)
        .seekInput(startTime)
        .duration(clipDuration);

      // Apply filter if specified
      if (clip.filter) {
        switch (clip.filter) {
          case 'grayscale':
            command = command.videoFilters('colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3');
            break;
          case 'sepia':
            command = command.videoFilters('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131');
            break;
          case 'invert':
            command = command.videoFilters('negate');
            break;
        }
      } else {
        command = command.outputOptions('-c copy');
      }

      // Trim and process the clip
      await new Promise((resolve, reject) => {
        command
          .output(trimmedPath)
          .on('end', () => resolve(trimmedPath))
          .on('error', (err) => reject(new Error(`FFmpeg processing error for clip ${clip.id}: ${err.message}`)))
          .run();
      });
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
      await fs.unlink(tempFile).catch(() => { });
    }
    await fs.unlink(concatFilePath).catch(() => { });

    return outputPath;
  } catch (error) {
    // Cleanup on error
    for (const tempFile of trimmedClips) {
      await fs.unlink(tempFile).catch(() => { });
    }
    throw error;
  }
}
