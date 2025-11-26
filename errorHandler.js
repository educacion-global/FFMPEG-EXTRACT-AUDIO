/**
 * Error handling utilities and custom error classes
 */

export class YouTubeDownloadError extends Error {
  constructor(message, code = 'DOWNLOAD_ERROR', details = {}) {
    super(message);
    this.name = 'YouTubeDownloadError';
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

export class DependencyError extends Error {
  constructor(message, missingDependencies = []) {
    super(message);
    this.name = 'DependencyError';
    this.missingDependencies = missingDependencies;
  }
}

export class NetworkError extends Error {
  constructor(message, originalError = null) {
    super(message);
    this.name = 'NetworkError';
    this.originalError = originalError;
  }
}

/**
 * Enhanced error handler with user-friendly messages
 */
export function handleError(error, context = 'general') {
  const errorInfo = {
    timestamp: new Date().toISOString(),
    context,
    type: error.name || 'Unknown',
    message: error.message,
    code: error.code || 'UNKNOWN_ERROR'
  };

  // Log technical details for debugging
  console.error(`[${errorInfo.timestamp}] ${errorInfo.context.toUpperCase()} ERROR:`, errorInfo);

  // Return user-friendly error response
  switch (error.name) {
    case 'ValidationError':
      return {
        success: false,
        message: `Invalid input: ${error.message}`,
        userMessage: 'Please check your YouTube URL and try again.',
        troubleshooting: [
          'Ensure the URL starts with https://youtube.com or https://youtu.be',
          'Make sure the video is public and accessible',
          'Check for any typos in the URL'
        ],
        code: 'VALIDATION_ERROR'
      };

    case 'DependencyError':
      return {
        success: false,
        message: error.message,
        userMessage: 'System dependencies are missing. Please install required tools.',
        troubleshooting: [
          'Install yt-dlp: brew install yt-dlp',
          'Install ffmpeg: brew install ffmpeg',
          'Restart your terminal after installation',
          'Run: node download.js --check-deps'
        ],
        code: 'DEPENDENCY_ERROR',
        missingDependencies: error.missingDependencies || []
      };

    case 'NetworkError':
      return {
        success: false,
        message: 'Network connection failed',
        userMessage: 'Unable to connect to YouTube. Please check your internet connection.',
        troubleshooting: [
          'Check your internet connection',
          'Try accessing YouTube in your browser',
          'Check if you\'re behind a firewall or proxy',
          'Try again in a few minutes'
        ],
        code: 'NETWORK_ERROR'
      };

    case 'YouTubeDownloadError':
      const downloadTroubleshooting = [
        'Check if the video is available in your region',
        'Ensure the video is not private or unlisted',
        'Try updating yt-dlp: brew upgrade yt-dlp',
        'Check if the video has age restrictions'
      ];

      if (error.code === 'VIDEO_UNAVAILABLE') {
        downloadTroubleshooting.unshift('This video may have been deleted or made private');
      } else if (error.code === 'REGION_BLOCKED') {
        downloadTroubleshooting.unshift('This video is not available in your region');
      }

      return {
        success: false,
        message: error.message,
        userMessage: 'Failed to download the YouTube video.',
        troubleshooting: downloadTroubleshooting,
        code: error.code,
        details: error.details
      };

    case 'ENOTFOUND':
    case 'ECONNREFUSED':
    case 'ETIMEDOUT':
      return {
        success: false,
        message: 'Connection failed',
        userMessage: 'Unable to connect to YouTube servers.',
        troubleshooting: [
          'Check your internet connection',
          'Try again in a few minutes',
          'Check if YouTube is accessible from your location'
        ],
        code: 'CONNECTION_ERROR'
      };

    default:
      return {
        success: false,
        message: 'An unexpected error occurred',
        userMessage: 'Something went wrong. Please try again.',
        troubleshooting: [
          'Try again in a few minutes',
          'Check the YouTube URL is correct',
          'Ensure you have a stable internet connection',
          'Contact support if the problem persists'
        ],
        code: 'UNEXPECTED_ERROR',
        originalError: error.message
      };
  }
}

/**
 * Network error detection and classification
 */
export function classifyNetworkError(error) {
  const message = error.message.toLowerCase();
  const code = error.code;

  if (code === 'ENOTFOUND' || message.includes('getaddrinfo')) {
    return new NetworkError('DNS resolution failed - cannot reach YouTube servers', error);
  }

  if (code === 'ECONNREFUSED') {
    return new NetworkError('Connection refused by YouTube servers', error);
  }

  if (code === 'ETIMEDOUT' || message.includes('timeout')) {
    return new NetworkError('Connection timed out', error);
  }

  if (message.includes('certificate') || message.includes('ssl')) {
    return new NetworkError('SSL/Certificate error', error);
  }

  return new NetworkError('Network connection failed', error);
}

/**
 * YouTube-specific error detection and classification
 */
export function classifyYouTubeError(error, stderr = '') {
  const message = error.message.toLowerCase();
  const stderrLower = stderr.toLowerCase();

  if (message.includes('video unavailable') || stderrLower.includes('video unavailable')) {
    return new YouTubeDownloadError(
      'Video is unavailable or has been removed',
      'VIDEO_UNAVAILABLE',
      { originalError: error.message }
    );
  }

  if (message.includes('private video') || stderrLower.includes('private')) {
    return new YouTubeDownloadError(
      'Video is private and cannot be accessed',
      'PRIVATE_VIDEO',
      { originalError: error.message }
    );
  }

  if (message.includes('blocked') || stderrLower.includes('blocked')) {
    return new YouTubeDownloadError(
      'Video is blocked in your region',
      'REGION_BLOCKED',
      { originalError: error.message }
    );
  }

  if (message.includes('age') || stderrLower.includes('age')) {
    return new YouTubeDownloadError(
      'Video has age restrictions',
      'AGE_RESTRICTED',
      { originalError: error.message }
    );
  }

  if (message.includes('copyright') || stderrLower.includes('copyright')) {
    return new YouTubeDownloadError(
      'Video is not available due to copyright restrictions',
      'COPYRIGHT_RESTRICTION',
      { originalError: error.message }
    );
  }

  if (message.includes('too many requests') || stderrLower.includes('429')) {
    return new YouTubeDownloadError(
      'Rate limited by YouTube. Please try again later.',
      'RATE_LIMITED',
      { originalError: error.message }
    );
  }

  return new YouTubeDownloadError(
    'Failed to download video',
    'DOWNLOAD_FAILED',
    { originalError: error.message, stderr }
  );
}

/**
 * File system error handling
 */
export function handleFileSystemError(error, operation = 'file operation') {
  const code = error.code;
  const path = error.path || 'unknown';

  switch (code) {
    case 'ENOENT':
      return {
        success: false,
        message: `File or directory not found: ${path}`,
        userMessage: 'Required file or directory is missing.',
        troubleshooting: [
          'Check if the output directory exists',
          'Verify file permissions',
          'Try running from your home directory'
        ],
        code: 'FILE_NOT_FOUND'
      };

    case 'EACCES':
    case 'EPERM':
      return {
        success: false,
        message: `Permission denied: ${path}`,
        userMessage: 'Insufficient permissions to write files.',
        troubleshooting: [
          'Check file and directory permissions',
          'Try running from a different directory',
          'Make sure you have write access to the current directory'
        ],
        code: 'PERMISSION_DENIED'
      };

    case 'ENOSPC':
      return {
        success: false,
        message: 'No space left on device',
        userMessage: 'Not enough disk space to save the file.',
        troubleshooting: [
          'Free up disk space',
          'Try saving to a different location',
          'Check available storage'
        ],
        code: 'DISK_FULL'
      };

    default:
      return {
        success: false,
        message: `File system error: ${error.message}`,
        userMessage: `Failed to perform ${operation}.`,
        troubleshooting: [
          'Check file permissions',
          'Try running from a different directory',
          'Ensure you have sufficient disk space'
        ],
        code: 'FILE_SYSTEM_ERROR'
      };
  }
}

/**
 * Rate limiting and retry logic
 */
export class RetryManager {
  constructor(maxRetries = 3, baseDelay = 1000) {
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
  }

  async executeWithRetry(fn, context = 'operation') {
    let lastError;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🔄 Attempt ${attempt}/${this.maxRetries} for ${context}`);
        return await fn();
      } catch (error) {
        lastError = error;
        console.log(`❌ Attempt ${attempt} failed: ${error.message}`);

        // Don't retry for certain errors
        if (this.shouldNotRetry(error)) {
          console.log(`🚫 Not retrying due to error type: ${error.name}`);
          throw error;
        }

        // Don't wait after the last attempt
        if (attempt < this.maxRetries) {
          const delay = this.baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
          console.log(`⏳ Waiting ${delay}ms before retry...`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  shouldNotRetry(error) {
    const noRetryErrors = [
      'ValidationError',
      'DependencyError',
      'PRIVATE_VIDEO',
      'AGE_RESTRICTED',
      'COPYRIGHT_RESTRICTION',
      'VIDEO_UNAVAILABLE'
    ];

    return noRetryErrors.includes(error.name) || noRetryErrors.includes(error.code);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Graceful error logging
 */
export function logError(error, context = 'general') {
  const timestamp = new Date().toISOString();
  const errorData = {
    timestamp,
    context,
    name: error.name,
    message: error.message,
    code: error.code,
    stack: error.stack
  };

  // Log to console with formatting
  console.error('\n' + '='.repeat(80));
  console.error(`🚨 ERROR [${timestamp}] - ${context.toUpperCase()}`);
  console.error('='.repeat(80));
  console.error(`Type: ${errorData.name || 'Unknown'}`);
  console.error(`Message: ${errorData.message}`);
  if (errorData.code) {
    console.error(`Code: ${errorData.code}`);
  }
  console.error('='.repeat(80) + '\n');

  // In production, you might want to log to a file or external service
  // logToFile(errorData);
  // logToService(errorData);

  return errorData;
}
