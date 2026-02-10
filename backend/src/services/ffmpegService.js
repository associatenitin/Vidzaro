import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
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
 * Get media metadata for video, image, or audio files
 */
export async function getMediaInfo(filePath, fileType) {
  if (!(await fileExists(filePath))) {
    throw new Error(`Media file not found: ${filePath}`);
  }

  try {
    const metadata = await ffprobeAsync(filePath);
    const videoStream = metadata.streams.find(s => s.codec_type === 'video');
    const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

    if (fileType === 'image') {
      // For images, get dimensions from video stream (images are treated as video streams by ffprobe)
      return {
        duration: 0, // Images don't have duration
        size: parseInt(metadata.format.size) || 0,
        format: metadata.format.format_name,
        resolution: {
          width: videoStream?.width || 0,
          height: videoStream?.height || 0,
        },
        codec: videoStream?.codec_name || 'unknown',
      };
    } else if (fileType === 'audio') {
      // For audio files
      return {
        duration: parseFloat(metadata.format.duration) || 0,
        size: parseInt(metadata.format.size) || 0,
        bitrate: parseInt(metadata.format.bit_rate) || 0,
        format: metadata.format.format_name,
        audio: audioStream
          ? {
            codec: audioStream.codec_name,
            sampleRate: audioStream.sample_rate,
            channels: audioStream.channels,
          }
          : null,
      };
    } else {
      // For video files, use the existing getVideoInfo logic
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
    }
  } catch (error) {
    throw new Error(`Failed to get media info: ${error.message}`);
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
  const duration = videoInfo.duration || 1; // Fallback to 1s if duration is 0
  const count = Math.max(1, Math.ceil(duration / interval));

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        count: count,
        folder: outputDir,
        filename: 'thumb-%i.png',
        size: '160x90'
      })
      .on('end', () => {
        console.log(`Successfully generated ${count} thumbnails for ${path.basename(videoPath)}`);
        resolve();
      })
      .on('error', (err) => {
        console.error(`FFmpeg Error generating thumbnails for ${videoPath}:`, err.message);
        reject(new Error(`Thumbnail generation error: ${err.message}`));
      });
  });
}

/**
 * Generate waveform image for a video
 */
export async function generateWaveform(videoPath, outputDir) {
  if (!(await fileExists(videoPath))) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  try {
    const info = await getVideoInfo(videoPath);
    if (!info.audio) {
      console.log(`[FFMPEG] Skipping waveform for ${path.basename(videoPath)} (no audio)`);
      return;
    }

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .complexFilter('showwavespic=s=2048x120:colors=cyan|blue')
        .output(path.join(outputDir, 'waveform.png'))
        .frames(1)
        .on('end', () => resolve())
        .on('error', (err) => reject(new Error(`Waveform generation error: ${err.message}`)))
        .run();
    });
  } catch (err) {
    console.warn(`[FFMPEG] Failed to check audio/generate waveform: ${err.message}`);
  }
}

/**
 * Export final video from project data
 * Applies trims, filters, and concatenates clips in order
 */
export async function exportVideo(projectData, outputPath, tempDir) {
  const fs = await import('fs/promises');
  const path = await import('path');

  const processedClips = [];
  const inputs = [];

  try {
    const globalTextOverlays = projectData.textOverlays || [];

    // 1. Process each clip individually (trim, filters, speed, volume, per-clip/global text overlays)
    for (let i = 0; i < projectData.clips.length; i++) {
      const clip = projectData.clips[i];
      const processedPath = path.join(tempDir, `processed-${clip.id}.mp4`);

      const startTime = clip.trimStart || 0;
      const clipDuration = (clip.trimEnd || clip.endTime) - startTime;

      let command = ffmpeg(clip.videoPath)
        .seekInput(startTime)
        .duration(clipDuration);

      let videoFilters = [];
      let audioFilters = [];

      if (clip.reversed) {
        videoFilters.unshift('reverse');
        audioFilters.unshift('areverse');
      }

      if (clip.speed && clip.speed !== 1) {
        videoFilters.push(`setpts=${1 / clip.speed}*PTS`);
        audioFilters.push(`atempo=${clip.speed}`);
      }

      // Per-clip volume: support either a single scalar or an automation curve over time
      const hasAutomation = Array.isArray(clip.volumeAutomation) && clip.volumeAutomation.length > 0;

      if (hasAutomation) {
        const baseVolume = clip.volume !== undefined ? clip.volume : 1;
        const speed = clip.speed || 1;
        const timelineDuration = clipDuration / speed;

        const automationPoints = clip.volumeAutomation
          .map((p) => {
            const time = typeof p.time === 'number' ? Math.max(0, p.time) : 0;
            const value = typeof p.value === 'number' ? p.value : 1;
            return {
              time,
              value: Math.max(0, Math.min(2, value)),
            };
          })
          .sort((a, b) => a.time - b.time);

        if (automationPoints.length > 0 && timelineDuration > 0) {
          const clampedPoints = [];
          const maxTime = timelineDuration;

          automationPoints.forEach((p) => {
            const t = Math.max(0, Math.min(maxTime, p.time));
            const v = Math.max(0, Math.min(2, p.value));
            if (!clampedPoints.length || Math.abs(clampedPoints[clampedPoints.length - 1].time - t) > 1e-3) {
              clampedPoints.push({ time: t, value: v });
            } else {
              clampedPoints[clampedPoints.length - 1] = { time: t, value: v };
            }
          });

          if (clampedPoints.length === 1) {
            // Single point -> constant volume over the whole clip
            const v = Math.max(0, Math.min(2, clampedPoints[0].value * baseVolume));
            audioFilters.push(`volume=${v}`);
          } else {
            // Multiple points -> approximate as piecewise-constant segments over time
            const pointsForSegments = [];
            const first = clampedPoints[0];
            const last = clampedPoints[clampedPoints.length - 1];

            if (first.time > 0) {
              pointsForSegments.push({ time: 0, value: first.value });
            }
            clampedPoints.forEach((p) => pointsForSegments.push(p));
            if (last.time < maxTime) {
              pointsForSegments.push({ time: maxTime, value: last.value });
            }

            for (let j = 0; j < pointsForSegments.length - 1; j++) {
              const a = pointsForSegments[j];
              const b = pointsForSegments[j + 1];
              const start = a.time;
              const end = b.time;
              if (end <= start) continue;
              const segmentVolume = Math.max(0, Math.min(2, a.value * baseVolume));
              const enable = `between(t\\,${start.toFixed(3)}\\,${end.toFixed(3)})`;
              audioFilters.push(`volume=${segmentVolume}:enable='${enable}'`);
            }
          }
        }
      } else if (clip.volume !== undefined && clip.volume !== 1) {
        // Legacy/simple scalar volume without automation
        audioFilters.push(`volume=${clip.volume}`);
      }

      if (clip.filter) {
        // Handle new filter object structure
        if (typeof clip.filter === 'object' && clip.filter.effects) {
          const effects = clip.filter.effects.filter(e => e.enabled !== false);
          
          // Build FFmpeg filter chain from effects
          effects.forEach(effect => {
            switch (effect.type) {
              case 'grayscale':
                videoFilters.push('colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3');
                break;
              case 'sepia':
                // Adjust sepia intensity based on value (0-100%)
                const sepiaIntensity = effect.value / 100;
                videoFilters.push(`colorchannelmixer=.${Math.round(393 * sepiaIntensity)}:.${Math.round(769 * sepiaIntensity)}:.${Math.round(189 * sepiaIntensity)}:0:.${Math.round(349 * sepiaIntensity)}:.${Math.round(686 * sepiaIntensity)}:.${Math.round(168 * sepiaIntensity)}:0:.${Math.round(272 * sepiaIntensity)}:.${Math.round(534 * sepiaIntensity)}:.${Math.round(131 * sepiaIntensity)}`);
                break;
              case 'invert':
                if (effect.value >= 50) {
                  videoFilters.push('negate');
                }
                break;
              case 'brightness':
                videoFilters.push(`eq=brightness=${effect.value}`);
                break;
              case 'contrast':
                videoFilters.push(`eq=contrast=${effect.value}`);
                break;
              case 'saturate':
                videoFilters.push(`eq=saturation=${effect.value}`);
                break;
              case 'blur':
                videoFilters.push(`boxblur=${effect.value}:${effect.value}`);
                break;
              case 'hue-rotate':
                videoFilters.push(`hue=s=${effect.value}`);
                break;
              case 'sharpen':
                // FFmpeg unsharp filter: lx/ly=matrix size, la=amount (strength)
                // Map value (0-3) to unsharp amount (0.5-3.0)
                // Matrix size 5x5 is a good default for most cases
                const sharpenAmount = effect.value > 0 ? Math.max(0.5, Math.min(3.0, effect.value)) : 0;
                if (sharpenAmount > 0) {
                  videoFilters.push(`unsharp=lx=5:ly=5:la=${sharpenAmount.toFixed(2)}:cx=5:cy=5:ca=${(sharpenAmount * 0.3).toFixed(2)}`);
                }
                break;
            }
          });
        } else if (typeof clip.filter === 'string') {
          // Legacy string filters
          switch (clip.filter) {
            case 'grayscale': videoFilters.push('colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3'); break;
            case 'sepia': videoFilters.push('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131'); break;
            case 'invert': videoFilters.push('negate'); break;
            case 'brightness': videoFilters.push('eq=brightness=1.3'); break;
            case 'darken': videoFilters.push('eq=brightness=0.7'); break;
            case 'contrast': videoFilters.push('eq=contrast=1.5'); break;
            case 'saturate': videoFilters.push('eq=saturation=1.8'); break;
            case 'desaturate': videoFilters.push('eq=saturation=0.3'); break;
            case 'blur': videoFilters.push('boxblur=3:3'); break;
            case 'hue-rotate': videoFilters.push('hue=s=90'); break;
            case 'sharpen': videoFilters.push('unsharp=lx=5:ly=5:la=1.5:cx=5:cy=5:ca=0.5'); break;
            // Complex filters - convert to multiple effects
            case 'vintage':
              videoFilters.push('eq=brightness=0.9');
              videoFilters.push('eq=contrast=1.1');
              videoFilters.push('colorchannelmixer=.157:.314:.075:0:.140:.280:.068:0:.109:.214:.052');
              break;
            case 'cool':
              videoFilters.push('hue=s=180');
              videoFilters.push('eq=saturation=0.8');
              break;
            case 'warm':
              videoFilters.push('eq=brightness=1.05');
              videoFilters.push('eq=saturation=1.2');
              videoFilters.push('colorchannelmixer=.118:.231:.056:0:.105:.206:.050:0:.082:.160:.039');
              break;
          }
        }
      }

      // Per-clip text overlays (new model) + migration fallback from legacy clip.text
      const perClipOverlays = Array.isArray(clip.textOverlays) && clip.textOverlays.length > 0
        ? clip.textOverlays
        : (clip.text
          ? [{
              text: clip.text,
              x: 50,
              y: clip.textPos === 'top' ? 20 : clip.textPos === 'bottom' ? 80 : 50,
              size: clip.textSize || '4xl',
              color: clip.textColor || '#ffffff',
              animation: clip.textAnim || 'none',
              positionMode: 'percentage',
            }]
          : []);

      const sizeToFont = (size) => {
        switch (size) {
          case 'xl': return 32;
          case '2xl': return 40;
          case '6xl': return 72;
          default: return 48;
        }
      };

      perClipOverlays.forEach((ov) => {
        if (!ov || !ov.text) return;
        const escapedText = ov.text.replace(/'/g, "'\\''").replace(/,/g, '\\,');
        const fontSize = sizeToFont(ov.size);
        const color = ov.color || '#ffffff';
        const xExpr = ov.positionMode === 'pixels'
          ? (ov.x != null ? ov.x : '(w-text_w)/2')
          : `${ov.x != null ? ov.x : 50}*W/100`;
        const yExpr = ov.positionMode === 'pixels'
          ? (ov.y != null ? ov.y : '(h-text_h)/2')
          : `${ov.y != null ? ov.y : 50}*H/100`;
        videoFilters.push(
          `drawtext=text='${escapedText}':fontcolor=${color}:fontsize=${fontSize}:x=${xExpr}:y=${yExpr}:borderw=2:bordercolor=black`
        );
      });

      // Global text overlays applied with enable=between(t, start, end)
      if (globalTextOverlays.length > 0) {
        const clipStartPos = clip.startPos || 0;
        const clipDurTimeline = ((clip.trimEnd || clip.endTime) - (clip.trimStart || 0)) / (clip.speed || 1);
        const clipEndPos = clipStartPos + clipDurTimeline;

        globalTextOverlays.forEach((ov) => {
          if (!ov || !ov.text) return;
          const ovStart = ov.startTime ?? 0;
          const ovEnd = ov.endTime ?? ovStart;
          if (ovEnd <= clipStartPos || ovStart >= clipEndPos) return; // no intersection

          const interStart = Math.max(ovStart, clipStartPos);
          const interEnd = Math.min(ovEnd, clipEndPos);
          const relStart = interStart - clipStartPos; // seconds within this processed clip
          const relEnd = interEnd - clipStartPos;
          if (relEnd <= relStart) return;

          const escapedText = ov.text.replace(/'/g, "'\\''").replace(/,/g, '\\,');
          const fontSize = sizeToFont(ov.size);
          const color = ov.color || '#ffffff';
          const xExpr = ov.positionMode === 'pixels'
            ? (ov.x != null ? ov.x : '(w-text_w)/2')
            : `${ov.x != null ? ov.x : 50}*W/100`;
          const yExpr = ov.positionMode === 'pixels'
            ? (ov.y != null ? ov.y : '(h-text_h)/2')
            : `${ov.y != null ? ov.y : 50}*H/100`;
          const enable = `between(t\\,${relStart.toFixed(3)}\\,${relEnd.toFixed(3)})`;
          videoFilters.push(
            `drawtext=text='${escapedText}':fontcolor=${color}:fontsize=${fontSize}:x=${xExpr}:y=${yExpr}:borderw=2:bordercolor=black:enable='${enable}'`
          );
        });
      }

      if (videoFilters.length > 0) command = command.videoFilters(videoFilters);
      if (audioFilters.length > 0) command = command.audioFilters(audioFilters);

      await new Promise((resolve, reject) => {
        command.output(processedPath).on('end', resolve).on('error', reject).run();
      });

      processedClips.push({ ...clip, processedPath });
    }

    // 2. Build filter complex for final assembly
    // Parse export options (resolution and quality)
    const resolution = projectData.options?.resolution || '1080';
    const quality = projectData.options?.quality || 'medium';
    
    // Map resolution to dimensions
    const resolutionMap = {
      '1080': { width: 1920, height: 1080 },
      '720': { width: 1280, height: 720 },
      '480': { width: 854, height: 480 }
    };
    
    const { width: outputWidth, height: outputHeight } = resolutionMap[resolution] || resolutionMap['1080'];
    
    // Map quality to CRF (lower CRF = higher quality)
    const qualityMap = {
      'high': 18,
      'medium': 23,
      'low': 28
    };
    
    const crf = qualityMap[quality] || qualityMap['medium'];
    
    // We'll create a black background base first
    const maxEnd = Math.max(...processedClips.map(c => (c.startPos || 0) + ((c.trimEnd || c.endTime) - (c.trimStart || 0)) / (c.speed || 1)), 1);

    let filterGraph = [`color=s=${outputWidth}x${outputHeight}:d=${maxEnd}:c=black[vbase]`, `anullsrc=r=44100:cl=stereo:d=${maxEnd}[abase]`];
    let vIn = '[vbase]';
    let aIn = '[abase]';

    // Detect transitions between clips
    const detectTransitions = () => {
      const transitions = [];
      const sortedClips = [...processedClips].sort((a, b) => (a.startPos || 0) - (b.startPos || 0));
      
      for (let i = 0; i < sortedClips.length - 1; i++) {
        const clip1 = sortedClips[i];
        const clip2 = sortedClips[i + 1];
        
        if ((clip1.track || 0) !== (clip2.track || 0)) continue;
        
        const clip1Duration = ((clip1.trimEnd || clip1.endTime) - (clip1.trimStart || 0)) / (clip1.speed || 1);
        const clip1End = (clip1.startPos || 0) + clip1Duration;
        const clip2Start = clip2.startPos || 0;
        
        const transition = clip1.transitionOut || clip2.transitionIn;
        if (transition && transition.type && clip1End > clip2Start - 0.1) {
          transitions.push({
            fromClip: clip1,
            toClip: clip2,
            transition,
            overlapStart: Math.max(clip1End - transition.duration, clip2Start),
            overlapEnd: Math.min(clip1End, clip2Start + transition.duration)
          });
        }
      }
      
      return transitions;
    };

    const transitions = detectTransitions();

    // Sort by track index so lower tracks are processed first (drawn under)
    const sortedProcessed = [...processedClips].sort((a, b) => (a.track || 0) - (b.track || 0));

    let finalCommand = ffmpeg();
    sortedProcessed.forEach((c, i) => {
      finalCommand = finalCommand.input(c.processedPath);
      const startMs = Math.round((c.startPos || 0) * 1000);
      const clipDuration = ((c.trimEnd || c.endTime) - (c.trimStart || 0)) / (c.speed || 1);
      const clipEnd = (c.startPos || 0) + clipDuration;

      // Check if this clip has a transition
      const transitionOut = transitions.find(t => t.fromClip.id === c.id);
      const transitionIn = transitions.find(t => t.toClip.id === c.id);

      // Video overlay with transition support
      let videoFilter = `[${i}:v]setpts=PTS-STARTPTS+${c.startPos || 0}/TB`;
      
      // Apply fade out if transitioning
      if (transitionOut && transitionOut.transition.type === 'crossfade') {
        const fadeStart = transitionOut.overlapStart - (c.startPos || 0);
        const fadeDuration = transitionOut.transition.duration;
        videoFilter += `,fade=t=out:st=${fadeStart}:d=${fadeDuration}`;
      }
      
      // Apply fade in if transitioning in
      if (transitionIn && transitionIn.transition.type === 'crossfade') {
        const fadeStart = 0;
        const fadeDuration = transitionIn.transition.duration;
        videoFilter += `,fade=t=in:st=${fadeStart}:d=${fadeDuration}`;
      }
      
      videoFilter += `[v${i}]`;
      filterGraph.push(videoFilter);
      filterGraph.push(`${vIn}[v${i}]overlay=shortest=0:eof_action=pass[vnext${i}]`);
      vIn = `[vnext${i}]`;

      // Audio delay and mix with crossfade support
      let audioFilter = `[${i}:a]adelay=${startMs}|${startMs}`;
      
      // Apply audio crossfade
      if (transitionOut && transitionOut.transition.type === 'crossfade') {
        const fadeStart = transitionOut.overlapStart - (c.startPos || 0);
        const fadeDuration = transitionOut.transition.duration;
        audioFilter += `,afade=t=out:st=${fadeStart}:d=${fadeDuration}`;
      }
      
      if (transitionIn && transitionIn.transition.type === 'crossfade') {
        const fadeStart = 0;
        const fadeDuration = transitionIn.transition.duration;
        audioFilter += `,afade=t=in:st=${fadeStart}:d=${fadeDuration}`;
      }
      
      audioFilter += `[a${i}]`;
      filterGraph.push(audioFilter);
      filterGraph.push(`${aIn}[a${i}]amix=inputs=2:duration=longest[anext${i}]`);
      aIn = `[anext${i}]`;
    });

    await new Promise((resolve, reject) => {
      finalCommand
        // Use format filter for video and anull for audio to finalize streams
        // Scale to output resolution if needed
        .complexFilter(filterGraph.concat([
          `${vIn}scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=decrease,pad=${outputWidth}:${outputHeight}:(ow-iw)/2:(oh-ih)/2,format=yuv420p[vfinal]`,
          `${aIn}anull[afinal]`
        ]))
        .map('[vfinal]')
        .map('[afinal]')
        .outputOptions(['-c:v libx264', '-preset fast', `-crf ${crf}`, '-c:a aac', '-b:a 192k'])
        .output(outputPath)
        .on('end', resolve)
        .on('error', (err) => reject(new Error(`FFmpeg assembly error: ${err.message}`)))
        .run();
    });

    // Clean up
    for (const c of processedClips) await fs.unlink(c.processedPath).catch(() => { });
    return outputPath;
  } catch (error) {
    for (const c of processedClips) await fs.unlink(c.processedPath).catch(() => { });
    throw error;
  }
}

/**
 * Convert WebM recording to MP4 or MKV with optional trim and output settings
 */
export async function convertRecording(inputPath, outputPath, options = {}) {
  if (!(await fileExists(inputPath))) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const {
    format = 'mp4',
    fps,
    width,
    height,
    videoBitrate,
    trimStart = 0,
    trimEnd,
  } = options;

  const duration = trimEnd != null && trimEnd > trimStart ? trimEnd - trimStart : undefined;

  return new Promise((resolve, reject) => {
    let command = ffmpeg(inputPath);

    if (trimStart > 0) command = command.seekInput(trimStart);
    if (duration != null) command = command.duration(duration);

    const outputOpts = [];
    if (format === 'mp4') {
      outputOpts.push('-c:v', 'libx264', '-preset', 'fast', '-c:a', 'aac');
      if (videoBitrate) outputOpts.push('-b:v', String(videoBitrate));
      if (fps) outputOpts.push('-r', String(fps));
    } else if (format === 'mkv') {
      outputOpts.push('-c:v', 'libx264', '-preset', 'fast', '-c:a', 'aac');
      if (videoBitrate) outputOpts.push('-b:v', String(videoBitrate));
      if (fps) outputOpts.push('-r', String(fps));
    } else if (format === 'webm') {
      outputOpts.push('-c:v', 'libvpx-vp9', '-c:a', 'libopus');
      if (videoBitrate) outputOpts.push('-b:v', String(videoBitrate));
      if (fps) outputOpts.push('-r', String(fps));
    }

    const scale = width && height ? `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2` : null;
    if (scale) command = command.videoFilters(scale);

    command
      .outputOptions(outputOpts)
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(new Error(`Conversion error: ${err.message}`)))
      .run();
  });
}
