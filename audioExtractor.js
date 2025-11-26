import { exec } from 'child_process';
import { promisify } from 'util';
import { validateAndSanitizeYouTubeURL, generateSafeFilename } from './utils.js';
import { 
  YouTubeDownloadError, 
  DependencyError, 
  NetworkError,
  classifyYouTubeError,
  classifyNetworkError,
  handleFileSystemError,
  handleError,
  RetryManager,
  logError
} from './errorHandler.js';

const execAsync = promisify(exec);

/**
 * Downloads and extracts audio from a YouTube URL using yt-dlp
 * @param {string} url - The YouTube URL to download
 * @param {object} options - Download options
 * @returns {Promise<object>} - Result object with success status and details
 */
export async function extractAudio(url, options = {}) {
  const {
    outputPath = process.cwd(),
    audioFormat = 'mp3',
    audioQuality = '0', // 0 = best quality
    onProgress = null,
    customFilename = null,
    maxRetries = 3
  } = options;

  console.log(`🎵 Starting audio extraction for: ${url}`);
  const retryManager = new RetryManager(maxRetries, 2000);

  try {
    // Validate and sanitize the URL
    const cleanURL = validateAndSanitizeYouTubeURL(url);
    console.log(`✅ URL validated successfully`);

    // Generate filename
    const baseFilename = customFilename || generateSafeFilename(cleanURL);
    
    // Execute download with retry logic
    const result = await retryManager.executeWithRetry(async () => {
      return await performDownload(cleanURL, {
        outputPath,
        audioFormat,
        audioQuality,
        baseFilename
      });
    }, 'YouTube audio extraction');

    console.log(`✅ Audio extraction completed successfully`);
    
    return {
      success: true,
      message: 'Audio extracted successfully',
      filename: `${baseFilename}.${audioFormat}`,
      outputPath,
      ...result
    };

  } catch (error) {
    logError(error, 'audio-extraction');
    
    // Classify and handle different types of errors
    let classifiedError;
    
    if (error.code && (error.code.startsWith('E') || error.syscall)) {
      // Network or system error
      if (error.code === 'ENOENT' || error.code === 'EACCES' || error.code === 'ENOSPC') {
        return handleFileSystemError(error, 'audio extraction');
      } else {
        classifiedError = classifyNetworkError(error);
      }
    } else if (error.name === 'ValidationError' || error.name === 'DependencyError') {
      throw error; // Re-throw validation/dependency errors as-is
    } else {
      // YouTube-specific error
      classifiedError = classifyYouTubeError(error, error.stderr || '');
    }

    const errorResponse = handleError(classifiedError, 'audio-extraction');
    return {
      ...errorResponse,
      stdout: error.stdout || '',
      stderr: error.stderr || ''
    };
  }
}

/**
 * Performs the actual download operation
 */
async function performDownload(url, options) {
  const { outputPath, audioFormat, audioQuality, baseFilename } = options;
  
  // Build the yt-dlp command
  const command = buildYtDlpCommand(url, options);
  
  console.log(`🔄 Executing: yt-dlp command`);
  
  try {
    // Execute the command with increased timeout for large files
    const result = await execAsync(command, {
      maxBuffer: 1024 * 1024 * 50, // 50MB buffer for output
      timeout: 600000, // 10 minutes timeout
      cwd: outputPath
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr
    };

  } catch (error) {
    // Enhance error with stderr information
    const enhancedError = new Error(error.message);
    enhancedError.stdout = error.stdout || '';
    enhancedError.stderr = error.stderr || '';
    enhancedError.code = error.code;
    enhancedError.signal = error.signal;
    
    throw enhancedError;
  }
}

/**
 * Builds the yt-dlp command with proper options
 * @param {string} url - Sanitized YouTube URL
 * @param {object} options - Command options
 * @returns {string} - Complete yt-dlp command
 */
function buildYtDlpCommand(url, options) {
  const {
    outputPath,
    audioFormat,
    audioQuality,
    baseFilename
  } = options;

  // Build the output template
  const outputTemplate = `${outputPath}/${baseFilename}.%(ext)s`;

  // Build command parts
  const commandParts = [
    'yt-dlp',
    '--extract-audio',                    // Extract audio only
    `--audio-format ${audioFormat}`,      // Set audio format
    `--audio-quality ${audioQuality}`,    // Set audio quality (0 = best)
    '--no-playlist',                      // Don't download playlists (individual videos only)
    '--no-warnings',                      // Reduce output noise
    '--progress',                         // Show progress
    `--output "${outputTemplate}"`,       // Set output path and filename
    `"${url}"`                           // The URL (quoted for safety)
  ];

  return commandParts.join(' ');
}

/**
 * Checks if required dependencies (yt-dlp and ffmpeg) are available
 * @returns {Promise<object>} - Status of dependencies
 */
export async function checkDependencies() {
  console.log(`🔍 Checking system dependencies...`);
  
  const dependencies = {
    'yt-dlp': false,
    'ffmpeg': false
  };

  const errors = [];
  const versions = {};

  try {
    // Check yt-dlp
    const ytDlpResult = await execAsync('yt-dlp --version', { timeout: 10000 });
    dependencies['yt-dlp'] = true;
    versions['yt-dlp'] = ytDlpResult.stdout.trim();
    console.log(`✅ yt-dlp is available (version: ${versions['yt-dlp']})`);
  } catch (error) {
    errors.push('yt-dlp is not installed or not in PATH');
    console.log(`❌ yt-dlp is not available`);
    logError(error, 'dependency-check-yt-dlp');
  }

  try {
    // Check ffmpeg
    const ffmpegResult = await execAsync('ffmpeg -version', { timeout: 10000 });
    dependencies['ffmpeg'] = true;
    // Extract version from first line
    const versionMatch = ffmpegResult.stdout.match(/ffmpeg version ([^\s]+)/);
    versions['ffmpeg'] = versionMatch ? versionMatch[1] : 'unknown';
    console.log(`✅ ffmpeg is available (version: ${versions['ffmpeg']})`);
  } catch (error) {
    errors.push('ffmpeg is not installed or not in PATH');
    console.log(`❌ ffmpeg is not available`);
    logError(error, 'dependency-check-ffmpeg');
  }

  const allAvailable = Object.values(dependencies).every(available => available);

  if (!allAvailable) {
    const missingDeps = Object.entries(dependencies)
      .filter(([name, available]) => !available)
      .map(([name]) => name);
    
    throw new DependencyError(
      `Missing dependencies: ${missingDeps.join(', ')}`,
      missingDeps
    );
  }

  return {
    dependencies,
    versions,
    allAvailable,
    errors,
    installInstructions: allAvailable ? null : getInstallInstructions(dependencies)
  };
}

/**
 * Provides installation instructions for missing dependencies
 * @param {object} dependencies - Status of each dependency
 * @returns {string} - Installation instructions
 */
function getInstallInstructions(dependencies) {
  const missing = Object.entries(dependencies)
    .filter(([name, available]) => !available)
    .map(([name]) => name);

  if (missing.length === 0) {
    return null;
  }

  let instructions = "Missing dependencies detected. To install:\n\n";

  if (missing.includes('yt-dlp')) {
    instructions += "• Install yt-dlp:\n";
    instructions += "  brew install yt-dlp\n";
    instructions += "  (or visit: https://github.com/yt-dlp/yt-dlp#installation)\n\n";
  }

  if (missing.includes('ffmpeg')) {
    instructions += "• Install ffmpeg:\n";
    instructions += "  brew install ffmpeg\n";
    instructions += "  (or visit: https://ffmpeg.org/download.html)\n\n";
  }

  instructions += "After installation, restart your terminal and try again.";
  
  return instructions;
}

/**
 * Gets information about a YouTube video without downloading it
 * @param {string} url - YouTube URL
 * @returns {Promise<object>} - Video information
 */
export async function getVideoInfo(url) {
  try {
    const cleanURL = validateAndSanitizeYouTubeURL(url);
    
    console.log(`📹 Getting video info for: ${cleanURL}`);
    
    const command = `yt-dlp --print title --print duration --print uploader --print view_count --print upload_date "${cleanURL}"`;
    const result = await execAsync(command, {
      timeout: 30000, // 30 second timeout
      maxBuffer: 1024 * 1024 // 1MB buffer
    });
    
    const lines = result.stdout.trim().split('\n');
    
    const videoInfo = {
      success: true,
      title: lines[0] || 'Unknown Title',
      duration: lines[1] || 'Unknown Duration', 
      uploader: lines[2] || 'Unknown Uploader',
      viewCount: lines[3] || 'Unknown',
      uploadDate: lines[4] || 'Unknown'
    };

    console.log(`✅ Video info retrieved: ${videoInfo.title}`);
    return videoInfo;
    
  } catch (error) {
    logError(error, 'video-info');
    
    // Classify the error for better user messaging
    let classifiedError;
    if (error.code && error.code.startsWith('E')) {
      classifiedError = classifyNetworkError(error);
    } else {
      classifiedError = classifyYouTubeError(error, error.stderr || '');
    }

    return {
      success: false,
      error: classifiedError.message,
      code: classifiedError.code
    };
  }
}
