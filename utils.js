import { URL } from 'url';
import { ValidationError } from './errorHandler.js';

/**
 * Enhanced YouTube URL validation with security checks
 * @param {string} url - The URL to validate
 * @returns {boolean} - True if valid YouTube URL, false otherwise
 */
export function isValidYouTubeURL(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Security check: Reject excessively long URLs (potential DoS)
  if (url.length > 2000) {
    return false;
  }

  // Security check: Basic malicious pattern detection
  const maliciousPatterns = [
    /javascript:/i,
    /data:/i,
    /vbscript:/i,
    /<script/i,
    /onload=/i,
    /onerror=/i
  ];

  if (maliciousPatterns.some(pattern => pattern.test(url))) {
    return false;
  }

  try {
    const urlObj = new URL(url.trim());
    
    // Security check: Only allow HTTPS
    if (urlObj.protocol !== 'https:') {
      return false;
    }

    // Check for YouTube domains
    const validDomains = [
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
      'youtu.be',
      'www.youtu.be'
    ];

    const hostname = urlObj.hostname.toLowerCase();
    
    // Security check: Exact domain matching (prevent subdomain attacks)
    if (!validDomains.includes(hostname)) {
      return false;
    }

    // Additional validation for youtube.com URLs
    if (hostname.includes('youtube.com')) {
      // Must have /watch path with v parameter OR be a playlist
      const hasVideoParam = urlObj.searchParams.has('v');
      const hasPlaylistParam = urlObj.searchParams.has('list');
      const isWatchPath = urlObj.pathname === '/watch';
      
      // Security check: Validate video ID format
      if (hasVideoParam) {
        const videoId = urlObj.searchParams.get('v');
        if (!isValidVideoId(videoId)) {
          return false;
        }
      }

      return (isWatchPath && hasVideoParam) || hasPlaylistParam;
    }

    // For youtu.be, the video ID should be in the path
    if (hostname.includes('youtu.be')) {
      const pathVideoId = urlObj.pathname.slice(1);
      return pathVideoId.length > 0 && isValidVideoId(pathVideoId);
    }

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Validates YouTube video ID format
 * @param {string} videoId - The video ID to validate
 * @returns {boolean} - True if valid format
 */
function isValidVideoId(videoId) {
  // YouTube video IDs are typically 11 characters, alphanumeric with - and _
  const videoIdPattern = /^[a-zA-Z0-9_-]{11}$/;
  return videoIdPattern.test(videoId);
}

/**
 * Enhanced URL sanitization with comprehensive security measures
 * @param {string} url - The URL to sanitize
 * @returns {string} - Sanitized URL
 */
export function sanitizeURL(url) {
  if (!url || typeof url !== 'string') {
    throw new ValidationError('URL must be a non-empty string');
  }

  // Remove any potential shell injection characters and malicious content
  let sanitized = url.trim()
    // Remove shell special characters
    .replace(/[`$(){}[\]|&;<>]/g, '')
    // Remove potential command injection patterns
    .replace(/&&/g, '')
    .replace(/\|\|/g, '')
    // Remove all types of quotes that might be dangerous in shell context
    .replace(/['"]/g, '')
    // Remove newlines and tabs that could break command structure
    .replace(/[\n\r\t]/g, '')
    // Remove null bytes and other control characters
    .replace(/[\x00-\x1f\x7f]/g, '')
    // Remove extra whitespace
    .replace(/\s+/g, '');

  if (!sanitized) {
    throw new ValidationError('URL became empty after sanitization');
  }

  // Additional length check after sanitization
  if (sanitized.length > 2000) {
    throw new ValidationError('URL is too long');
  }

  return sanitized;
}

/**
 * Comprehensive URL validation and sanitization with detailed error messages
 * @param {string} url - The URL to process
 * @returns {string} - Clean, validated YouTube URL
 * @throws {ValidationError} - If URL is invalid with specific reason
 */
export function validateAndSanitizeYouTubeURL(url) {
  if (!url) {
    throw new ValidationError('URL is required', 'url');
  }

  if (typeof url !== 'string') {
    throw new ValidationError('URL must be a string', 'url');
  }

  // Length check before processing
  if (url.length > 2000) {
    throw new ValidationError('URL is too long (maximum 2000 characters)', 'url');
  }

  // Check for obviously malicious content before sanitization
  const suspiciousPatterns = [
    { pattern: /javascript:/i, message: 'JavaScript URLs are not allowed' },
    { pattern: /data:/i, message: 'Data URLs are not allowed' },
    { pattern: /<script/i, message: 'Script tags are not allowed' },
    { pattern: /\x00/g, message: 'Null bytes are not allowed' }
  ];

  for (const { pattern, message } of suspiciousPatterns) {
    if (pattern.test(url)) {
      throw new ValidationError(message, 'url');
    }
  }

  // Sanitize to prevent injection
  const sanitizedURL = sanitizeURL(url);
  
  // Validate it's a proper YouTube URL
  if (!isValidYouTubeURL(sanitizedURL)) {
    // Try to provide specific feedback about why the URL is invalid
    let reason = 'Invalid YouTube URL format';
    
    try {
      const urlObj = new URL(sanitizedURL);
      
      if (urlObj.protocol !== 'https:') {
        reason = 'Only HTTPS YouTube URLs are allowed';
      } else if (!urlObj.hostname.includes('youtube.com') && !urlObj.hostname.includes('youtu.be')) {
        reason = 'URL must be from youtube.com or youtu.be';
      } else if (urlObj.hostname.includes('youtube.com') && !urlObj.searchParams.has('v')) {
        reason = 'YouTube URL must include a video ID (v parameter)';
      }
    } catch (e) {
      reason = 'Malformed URL structure';
    }
    
    throw new ValidationError(`${reason}. Please provide a valid YouTube video URL.`, 'url');
  }

  return sanitizedURL;
}

/**
 * Generates a secure filename from a YouTube URL
 * @param {string} url - The YouTube URL
 * @returns {string} - Safe filename base
 */
export function generateSafeFilename(url) {
  try {
    const urlObj = new URL(url);
    let filename = 'youtube_audio';

    // Extract video ID if possible
    if (urlObj.hostname.includes('youtube.com')) {
      const videoId = urlObj.searchParams.get('v');
      if (videoId && isValidVideoId(videoId)) {
        filename = `youtube_${videoId}`;
      }
    } else if (urlObj.hostname.includes('youtu.be')) {
      const videoId = urlObj.pathname.slice(1);
      if (videoId && isValidVideoId(videoId)) {
        filename = `youtube_${videoId}`;
      }
    }

    // Ensure filename is safe for filesystem and shell
    // Only allow alphanumeric characters, underscores, and hyphens
    const safeFilename = filename.replace(/[^a-zA-Z0-9_-]/g, '_');
    
    // Ensure filename isn't too long (filesystem limits)
    const maxLength = 200;
    if (safeFilename.length > maxLength) {
      return safeFilename.substring(0, maxLength);
    }

    return safeFilename;
  } catch (error) {
    // Fallback to timestamp-based filename if URL parsing fails
    const timestamp = Date.now();
    return `youtube_audio_${timestamp}`;
  }
}

/**
 * File naming templates for different formats
 */
export const NAMING_TEMPLATES = {
  DEFAULT: '{title} [{id}]',
  ARTIST_TITLE: '{uploader} - {title}',
  DATE_TITLE: '{upload_date} - {title}',
  DURATION_TITLE: '{title} ({duration}s)',
  PLAYLIST_INDEX: '{playlist_index:02d}. {title}',
  CUSTOM: '{custom}'
};

/**
 * Generate filename using a template
 * @param {object} videoInfo - Video information object
 * @param {string} template - Template string
 * @param {string} customName - Custom name for CUSTOM template
 * @returns {string} - Generated filename
 */
export function generateFilenameFromTemplate(videoInfo, template = NAMING_TEMPLATES.DEFAULT, customName = '') {
  const {
    title = 'Unknown',
    id = 'unknown',
    uploader = 'Unknown',
    upload_date = 'unknown',
    duration = 0,
    playlist_index = 0
  } = videoInfo;

  let filename = template;

  // Replace template variables
  const replacements = {
    '{title}': sanitizeFilename(title),
    '{id}': id,
    '{uploader}': sanitizeFilename(uploader),
    '{upload_date}': upload_date,
    '{duration}': Math.round(duration || 0),
    '{playlist_index:02d}': String(playlist_index).padStart(2, '0'),
    '{custom}': sanitizeFilename(customName)
  };

  for (const [placeholder, value] of Object.entries(replacements)) {
    filename = filename.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
  }

  // Clean up any remaining brackets and extra spaces
  filename = filename.replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
  
  // Ensure we have a valid filename
  if (!filename || filename.length < 1) {
    filename = `download_${id}`;
  }

  return filename;
}

/**
 * Progress tracking utility for downloads
 */
export class ProgressTracker {
  constructor() {
    this.downloads = new Map();
  }

  /**
   * Start tracking a download
   * @param {string} id - Download ID
   * @param {object} info - Initial info
   */
  startDownload(id, info = {}) {
    this.downloads.set(id, {
      id,
      startTime: Date.now(),
      status: 'starting',
      progress: 0,
      speed: 0,
      eta: 0,
      totalSize: 0,
      downloadedSize: 0,
      ...info
    });
  }

  /**
   * Update download progress
   * @param {string} id - Download ID
   * @param {object} update - Progress update
   */
  updateProgress(id, update) {
    const download = this.downloads.get(id);
    if (download) {
      Object.assign(download, update, {
        lastUpdate: Date.now()
      });
    }
  }

  /**
   * Complete a download
   * @param {string} id - Download ID
   * @param {object} result - Final result
   */
  completeDownload(id, result = {}) {
    const download = this.downloads.get(id);
    if (download) {
      download.status = 'completed';
      download.endTime = Date.now();
      download.duration = download.endTime - download.startTime;
      Object.assign(download, result);
    }
  }

  /**
   * Mark download as failed
   * @param {string} id - Download ID
   * @param {string} error - Error message
   */
  failDownload(id, error) {
    const download = this.downloads.get(id);
    if (download) {
      download.status = 'failed';
      download.endTime = Date.now();
      download.error = error;
    }
  }

  /**
   * Get download status
   * @param {string} id - Download ID
   * @returns {object|null} - Download status or null
   */
  getDownload(id) {
    return this.downloads.get(id) || null;
  }

  /**
   * Get all downloads
   * @returns {Array} - Array of all downloads
   */
  getAllDownloads() {
    return Array.from(this.downloads.values());
  }

  /**
   * Clean up old completed downloads
   * @param {number} maxAge - Max age in milliseconds (default: 1 hour)
   */
  cleanup(maxAge = 3600000) {
    const now = Date.now();
    for (const [id, download] of this.downloads.entries()) {
      if (download.endTime && (now - download.endTime) > maxAge) {
        this.downloads.delete(id);
      }
    }
  }
}

/**
 * Rate limiting helper
 */
export class RateLimiter {
  constructor(maxRequests = 10, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map();
  }

  isAllowed(identifier) {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get existing requests for this identifier
    const userRequests = this.requests.get(identifier) || [];
    
    // Remove old requests outside the window
    const recentRequests = userRequests.filter(time => time > windowStart);
    
    // Check if under limit
    if (recentRequests.length >= this.maxRequests) {
      return false;
    }

    // Add current request
    recentRequests.push(now);
    this.requests.set(identifier, recentRequests);

    // Cleanup old entries periodically
    this.cleanup();

    return true;
  }

  cleanup() {
    const now = Date.now();
    const cutoff = now - this.windowMs * 2; // Keep some buffer

    for (const [identifier, requests] of this.requests.entries()) {
      const filtered = requests.filter(time => time > cutoff);
      if (filtered.length === 0) {
        this.requests.delete(identifier);
      } else {
        this.requests.set(identifier, filtered);
      }
    }
  }
}

/**
 * Input validation for API endpoints
 */
export function validateApiInput(data, schema) {
  const errors = [];

  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];

    // Required check
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`${field} is required`);
      continue;
    }

    // Skip further validation if field is not required and empty
    if (!rules.required && (value === undefined || value === null || value === '')) {
      continue;
    }

    // Type check
    if (rules.type && typeof value !== rules.type) {
      errors.push(`${field} must be of type ${rules.type}`);
      continue;
    }

    // Length check
    if (rules.maxLength && value.length > rules.maxLength) {
      errors.push(`${field} must not exceed ${rules.maxLength} characters`);
    }

    if (rules.minLength && value.length < rules.minLength) {
      errors.push(`${field} must be at least ${rules.minLength} characters`);
    }

    // Pattern check
    if (rules.pattern && !rules.pattern.test(value)) {
      errors.push(`${field} has invalid format`);
    }

    // Custom validation
    if (rules.validate && !rules.validate(value)) {
      errors.push(`${field} ${rules.validateMessage || 'is invalid'}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
