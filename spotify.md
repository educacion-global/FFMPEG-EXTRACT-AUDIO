# Spotify to MP3 Downloader Integration

## Overview

This document outlines how to extend the existing YouTube to MP3 downloader to support Spotify tracks and playlists. This integration allows users to download audio from Spotify URLs by leveraging the existing infrastructure while adding Spotify-specific functionality.

## How It Works

The Spotify integration works by:
1. **Parsing Spotify URLs** to extract track/playlist information
2. **Finding equivalent tracks on YouTube** using metadata matching
3. **Using the existing YouTube download pipeline** for audio extraction
4. **Maintaining the same UI/UX** as the YouTube downloader

## Two Approaches Available

### Approach 1: With Spotify API Key (Recommended)
- **Pros**: Reliable metadata, official access, better track matching
- **Cons**: Requires Spotify Developer account and API key setup
- **Best for**: Production use, reliable service

### Approach 2: Without API Key (Alternative)
- **Pros**: No account setup required, works out of the box
- **Cons**: Limited to public content, may be less reliable, potential ToS issues
- **Best for**: Personal use, quick testing

## Setup Instructions

### Option 1: With Spotify API Key

1. **Get Spotify API Credentials**:
   ```bash
   # Visit https://developer.spotify.com/dashboard
   # Create an app and get:
   # - Client ID
   # - Client Secret
   ```

2. **Install Additional Dependencies**:
   ```bash
   npm install spotify-web-api-node
   ```

3. **Configure Environment**:
   ```bash
   # Add to .env file
   SPOTIFY_CLIENT_ID=your_client_id_here
   SPOTIFY_CLIENT_SECRET=your_client_secret_here
   ```

### Option 2: Without API Key

1. **Install spotdl** (Python tool):
   ```bash
   pip install spotdl
   ```

2. **No additional configuration needed** - works with public Spotify URLs

## Features

### Supported Spotify Content
- ✅ Individual tracks
- ✅ Public playlists
- ✅ Albums
- ✅ Artist top tracks
- ❌ Private playlists (API key required)
- ❌ User libraries (API key required)

### Existing Features That Work
- **Progress tracking** for playlist downloads
- **Custom file naming** templates
- **Drag & drop** Spotify URLs
- **Real-time progress** updates via Server-Sent Events
- **Error handling** and retry logic
- **Rate limiting** and queue management

## Usage

### Web Interface
1. Open `http://localhost:3000` in your browser
2. Paste a Spotify URL in the input field:
   - Track: `https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh`
   - Playlist: `https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M`
   - Album: `https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy`
3. Select output format (MP3, M4A, etc.)
4. Click "Download" and monitor progress

### Command Line Interface
```bash
# Single track
node download.js "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh"

# Playlist with custom naming
node download.js "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M" \
  --template "{artist} - {title}"

# Album with specific format
node download.js "https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy" \
  --format m4a
```

## Technical Implementation

### URL Detection
The system automatically detects Spotify URLs using pattern matching:
```javascript
const spotifyUrlPattern = /^https:\/\/open\.spotify\.com\/(track|playlist|album)\/([a-zA-Z0-9]+)/;
```

### Metadata Extraction

#### With API Key:
```javascript
// Use Spotify Web API for accurate metadata
const SpotifyWebApi = require('spotify-web-api-node');
// Get track info, search metadata, etc.
```

#### Without API Key:
```javascript
// Use spotdl or web scraping for public metadata
const { exec } = require('child_process');
// Parse public Spotify page content
```

### YouTube Search & Matching
```javascript
// Convert Spotify track to YouTube search query
const searchQuery = `${artist} ${title} ${album}`;
// Use existing YouTube search logic
// Apply intelligent filtering for best match
```

## File Naming Templates

Spotify-specific template variables:
- `{artist}` - Primary artist name
- `{title}` - Track title
- `{album}` - Album name
- `{year}` - Release year
- `{track_number}` - Track number in album
- `{duration}` - Track duration
- `{spotify_id}` - Spotify track ID

Example templates:
```javascript
"{artist} - {title}"                    // "The Beatles - Hey Jude"
"{artist}/{album}/{track_number} - {title}" // "The Beatles/Hey Jude/1 - Hey Jude"
"{year} - {artist} - {title}"           // "1968 - The Beatles - Hey Jude"
```

## Error Handling

### Common Issues & Solutions

1. **Track Not Found on YouTube**:
   - Try alternative search terms
   - Use different artist/title combinations
   - Fall back to manual search

2. **Spotify URL Invalid**:
   - Verify URL format
   - Check if content is available in your region
   - Ensure playlist/album is public

3. **API Rate Limits** (with API key):
   - Automatic retry with exponential backoff
   - Queue management for large playlists
   - Respect Spotify's rate limits

4. **Without API Key Limitations**:
   - Some tracks may not be accessible
   - Metadata quality may vary
   - Regional restrictions may apply

## Legal Considerations

### Important Notes
- **Personal Use Only**: This tool is intended for personal backup of music you own
- **Respect Copyright**: Don't distribute downloaded content
- **Terms of Service**: Be aware of Spotify's ToS regarding scraping
- **API Usage**: With API keys, follow Spotify's Developer Terms

### Recommendations
1. Use official API keys when possible
2. Only download music you have rights to
3. Don't share or distribute downloaded content
4. Consider subscribing to Spotify Premium to support artists

## Configuration Options

### Environment Variables
```bash
# Spotify API (optional)
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret

# Download settings
SPOTIFY_SEARCH_RETRIES=3
SPOTIFY_MATCH_THRESHOLD=0.8
SPOTIFY_FALLBACK_SEARCH=true

# Output settings
SPOTIFY_DEFAULT_FORMAT=mp3
SPOTIFY_DEFAULT_QUALITY=320k
```

### Advanced Settings
```javascript
// In config file
const spotifyConfig = {
  searchRetries: 3,
  matchThreshold: 0.8,
  fallbackSearch: true,
  preferredSources: ['youtube', 'soundcloud'],
  metadataTimeout: 30000,
  downloadTimeout: 300000
};
```

## Performance Tips

1. **Playlist Downloads**: Large playlists are processed in batches
2. **Caching**: Track metadata is cached to avoid duplicate API calls
3. **Parallel Processing**: Multiple downloads can run simultaneously
4. **Progress Updates**: Real-time progress via WebSocket/SSE

## Troubleshooting

### Debug Mode
```bash
# Enable detailed logging
DEBUG=spotify:* node server.js
```

### Common Commands
```bash
# Test Spotify URL parsing
node -e "console.log(require('./utils').parseSpotifyUrl('your_url_here'))"

# Check if spotdl is working (without API key)
spotdl --help

# Verify API credentials (with API key)
node -e "require('./spotifyAuth').testConnection()"
```

## Future Enhancements

### Planned Features
- **Lyrics embedding** in downloaded files
- **Playlist synchronization** with Spotify
- **Smart duplicate detection**
- **Artist discography downloads**
- **Integration with music library managers**

### Experimental Features
- **Real-time Spotify playlist monitoring**
- **Automatic quality selection based on source**
- **Cross-platform playlist conversion**

## Contributing

When adding Spotify-related features:
1. Maintain compatibility with existing YouTube functionality
2. Add comprehensive error handling
3. Include tests for both API and non-API modes
4. Update documentation for new features
5. Consider legal and ethical implications

## Support

For Spotify-specific issues:
1. Check the troubleshooting section
2. Verify your Spotify URLs are correct
3. Test with a simple track before trying playlists
4. Review the error logs for detailed information

Remember: This integration extends the existing YouTube downloader, so all the original features and documentation still apply!
