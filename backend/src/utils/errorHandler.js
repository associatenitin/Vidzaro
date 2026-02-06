export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // FFmpeg errors
  if (err.message && err.message.includes('ffmpeg')) {
    return res.status(500).json({
      error: 'Video processing error',
      message: err.message,
    });
  }

  // Validation errors
  if (err.status === 400) {
    return res.status(400).json({
      error: 'Validation error',
      message: err.message,
    });
  }

  // File not found
  if (err.code === 'ENOENT') {
    return res.status(404).json({
      error: 'File not found',
      message: err.message,
    });
  }

  // Default error
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
