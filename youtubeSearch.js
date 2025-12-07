import { exec } from 'child_process';
import { promisify } from 'util';
import { ProcessingError } from './errorHandler.js';

const execAsync = promisify(exec);

/**
 * Search for videos on YouTube using yt-dlp
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Promise<string>} - YouTube URL of the best match
 */
export async function searchYoutube(query, options = {}) {
  const maxResults = options.maxResults || 5;
  const timeout = options.timeout || 30000;

  if (!query || typeof query !== 'string') {
    throw new ProcessingError('Search query is required');
  }

  // Sanitize search query
  const sanitizedQuery = query
    .replace(/[`$(){}[\]|&;<>]/g, '')
    .replace(/['"]/g, '')
    .trim();

  if (!sanitizedQuery) {
    throw new ProcessingError('Search query became empty after sanitization');
  }

  try {
    console.log(`Searching YouTube for: ${sanitizedQuery}`);
    
    // Use yt-dlp to search YouTube
    const searchCommand = `yt-dlp "ytsearch${maxResults}:${sanitizedQuery}" --get-url --get-title --get-duration --no-playlist`;
    
    const { stdout, stderr } = await execAsync(searchCommand, { 
      timeout,
      maxBuffer: 1024 * 1024 // 1MB buffer
    });

    if (stderr && !stderr.includes('WARNING')) {
      console.warn('YouTube search warning:', stderr);
    }

    const lines = stdout.trim().split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      throw new ProcessingError(`No YouTube results found for: ${query}`);
    }

    // Parse results (yt-dlp outputs title, duration, url in groups)
    const results = [];
    for (let i = 0; i < lines.length; i += 3) {
      if (i + 2 < lines.length) {
        const title = lines[i];
        const duration = lines[i + 1];
        const url = lines[i + 2];
        
        // Basic validation that this looks like a YouTube URL
        if (url && url.includes('youtube.com')) {
          results.push({ title, duration, url });
        }
      }
    }

    if (results.length === 0) {
      throw new ProcessingError(`No valid YouTube URLs found for: ${query}`);
    }

    // Return the first (best) result
    console.log(`Found ${results.length} results, using: ${results[0].title}`);
    return results[0].url;

  } catch (error) {
    if (error.code === 'ETIMEDOUT') {
      throw new ProcessingError(`YouTube search timed out for: ${query}`);
    }
    
    if (error.message.includes('No video results')) {
      throw new ProcessingError(`No YouTube results found for: ${query}`);
    }

    console.error('YouTube search error:', error);
    throw new ProcessingError(`YouTube search failed: ${error.message}`);
  }
}

/**
 * Advanced YouTube search with filtering options
 * @param {string} query - Search query
 * @param {Object} filters - Search filters
 * @returns {Promise<Array>} - Array of YouTube search results
 */
export async function searchYoutubeAdvanced(query, filters = {}) {
  const {
    maxResults = 10,
    duration = 'any', // short, medium, long
    type = 'video', // video, playlist, channel
    sortBy = 'relevance' // relevance, date, rating, viewcount
  } = filters;

  try {
    // Build search URL with filters
    let searchUrl = `ytsearch${maxResults}:${query}`;
    
    // Add filters (these are yt-dlp specific options)
    const ytDlpOptions = [];
    
    if (duration !== 'any') {
      ytDlpOptions.push(`--match-filter "duration < 600" if duration == "short"`);
      ytDlpOptions.push(`--match-filter "duration > 240 & duration < 1200" if duration == "medium"`);
      ytDlpOptions.push(`--match-filter "duration > 1200" if duration == "long"`);
    }

    const command = `yt-dlp "${searchUrl}" ${ytDlpOptions.join(' ')} --get-url --get-title --get-duration --get-description --no-playlist`;
    
    const { stdout } = await execAsync(command, { 
      timeout: 60000,
      maxBuffer: 2 * 1024 * 1024 // 2MB buffer
    });

    const lines = stdout.trim().split('\n').filter(line => line.trim());
    const results = [];

    // Parse results (title, duration, description, url pattern)
    for (let i = 0; i < lines.length; i += 4) {
      if (i + 3 < lines.length) {
        results.push({
          title: lines[i],
          duration: lines[i + 1],
          description: lines[i + 2],
          url: lines[i + 3]
        });
      }
    }

    return results;

  } catch (error) {
    console.error('Advanced YouTube search error:', error);
    throw new ProcessingError(`Advanced YouTube search failed: ${error.message}`);
  }
}

/**
 * Search for the best matching YouTube video for a Spotify track
 * @param {Object} track - Spotify track metadata
 * @returns {Promise<string>} - Best matching YouTube URL
 */
export async function findBestYouTubeMatch(track) {
  const searchStrategies = [
    // Strategy 1: Exact match with quotes
    `"${track.artist}" "${track.title}"`,
    
    // Strategy 2: Artist and title with album
    `${track.artist} ${track.title} ${track.album}`,
    
    // Strategy 3: Just artist and title
    `${track.artist} ${track.title}`,
    
    // Strategy 4: Title with artist (reversed order)
    `${track.title} ${track.artist}`,
    
    // Strategy 5: Title only (last resort)
    track.title
  ];

  for (let i = 0; i < searchStrategies.length; i++) {
    const query = searchStrategies[i];
    console.log(`Trying search strategy ${i + 1}: ${query}`);

    try {
      const results = await searchYoutubeAdvanced(query, {
        maxResults: 3,
        duration: track.duration ? getDurationFilter(track.duration) : 'any'
      });

      if (results.length > 0) {
        // Score each result based on title similarity
        const scoredResults = results.map(result => ({
          ...result,
          score: calculateSimilarityScore(track, result)
        }));

        // Sort by score (highest first)
        scoredResults.sort((a, b) => b.score - a.score);

        console.log(`Best match (score: ${scoredResults[0].score}): ${scoredResults[0].title}`);
        
        // Return the best match if score is above threshold
        if (scoredResults[0].score > 0.6) {
          return scoredResults[0].url;
        }
      }
    } catch (error) {
      console.warn(`Search strategy ${i + 1} failed:`, error.message);
      continue;
    }
  }

  throw new ProcessingError(
    `Could not find a good YouTube match for "${track.title}" by ${track.artist}`
  );
}

/**
 * Calculate similarity score between Spotify track and YouTube result
 * @param {Object} track - Spotify track
 * @param {Object} result - YouTube search result
 * @returns {number} - Similarity score (0-1)
 */
function calculateSimilarityScore(track, result) {
  const trackTitle = track.title.toLowerCase();
  const trackArtist = track.artist.toLowerCase();
  const resultTitle = result.title.toLowerCase();

  let score = 0;

  // Check if artist name appears in YouTube title
  if (resultTitle.includes(trackArtist)) {
    score += 0.4;
  }

  // Check if track title appears in YouTube title
  if (resultTitle.includes(trackTitle)) {
    score += 0.4;
  }

  // Check for exact title match
  if (resultTitle === trackTitle) {
    score += 0.3;
  }

  // Penalty for common non-music indicators
  const nonMusicKeywords = ['cover', 'remix', 'live', 'acoustic', 'instrumental', 'karaoke'];
  const hasNonMusicKeywords = nonMusicKeywords.some(keyword => 
    resultTitle.includes(keyword) && !trackTitle.includes(keyword)
  );
  
  if (hasNonMusicKeywords) {
    score -= 0.2;
  }

  // Duration comparison if available
  if (track.duration && result.duration) {
    const trackDurationSec = track.duration;
    const resultDurationSec = parseDuration(result.duration);
    
    if (resultDurationSec > 0) {
      const durationDiff = Math.abs(trackDurationSec - resultDurationSec);
      const durationSimilarity = 1 - (durationDiff / Math.max(trackDurationSec, resultDurationSec));
      score += durationSimilarity * 0.2;
    }
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Parse duration string (e.g., "3:45") to seconds
 * @param {string} duration - Duration string
 * @returns {number} - Duration in seconds
 */
function parseDuration(duration) {
  if (!duration || typeof duration !== 'string') return 0;
  
  const parts = duration.split(':').map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

/**
 * Get duration filter based on track length
 * @param {number} durationSec - Duration in seconds
 * @returns {string} - Duration filter
 */
function getDurationFilter(durationSec) {
  if (durationSec < 240) return 'short'; // < 4 minutes
  if (durationSec < 1200) return 'medium'; // 4-20 minutes
  return 'long'; // > 20 minutes
}

export default {
  searchYoutube,
  searchYoutubeAdvanced,
  findBestYouTubeMatch
};
