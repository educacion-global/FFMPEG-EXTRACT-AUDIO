# YouTube to MP3 Downloader

A local YouTube to MP3 downloader for macOS that runs entirely on your machine. Extract high-quality audio from YouTube videos using both CLI and web interfaces.

## ⚠️ Legal Disclaimer

**This tool is intended only for downloading content you own or have legal rights to use.** Please respect copyright laws and YouTube's Terms of Service. Use responsibly.

## Features

- 🎵 **High-quality MP3 extraction** using yt-dlp and ffmpeg
- 💻 **CLI interface** for command-line users
- 🌐 **Web interface** with modern, responsive design  
- 📋 **Playlist downloads** - Download entire YouTube playlists
- 📊 **Real-time progress bars** - Track download progress with detailed status
- 🎯 **Drag & drop interface** - Simply drag YouTube URLs onto the web interface
- 🏷️ **Smart filename templates** - Multiple naming options for organized files
- 🔒 **100% local** - no data sent to external servers
- 🛡️ **Secure** - input validation and rate limiting
- ⚡ **Fast** - direct system tool integration
- 📱 **Responsive** - modern web UI that works on all screen sizes

## Prerequisites

This app requires the following to be installed on your Mac:

- **Node.js 18+** - [Download from nodejs.org](https://nodejs.org/)
- **yt-dlp** - YouTube downloader
- **ffmpeg** - Media conversion tool

## Quick Setup

### 1. Install Dependencies

```bash
# Install yt-dlp (recommended method)
brew install yt-dlp

# Install ffmpeg
brew install ffmpeg

# Verify installations
yt-dlp --version
ffmpeg -version
```

### 2. Clone and Setup Project

```bash
# Clone the repository
git clone https://github.com/lxps/FFMPEG-EXTRACT-AUDIO.git
cd FFMPEG-EXTRACT-AUDIO

# Install Node.js dependencies
npm install
```

### 3. Verify Installation

```bash
# Check if all dependencies are available
npm run cli -- --check-deps
```

## Usage

### CLI Mode

Download videos or entire playlists directly from the command line:

```bash
# Single video download
npm run cli -- "https://www.youtube.com/watch?v=VIDEO_ID"
node download.js "https://www.youtube.com/watch?v=VIDEO_ID"

# Playlist download (default: 25 videos)
npm run playlist -- "https://www.youtube.com/playlist?list=PLAYLIST_ID"
node download.js --playlist "https://www.youtube.com/playlist?list=PLAYLIST_ID"

# Playlist download (limited number)
npm run playlist -- "https://www.youtube.com/playlist?list=PLAYLIST_ID" 10
node download.js --playlist "https://www.youtube.com/playlist?list=PLAYLIST_ID" 10

# Show help
npm run cli -- --help
node download.js --help

# Check dependencies
npm run deps
node download.js --check-deps
```

**Example:**
```bash
# Download single video
npm run cli -- "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# Download first 5 videos from a playlist
npm run playlist -- "https://www.youtube.com/playlist?list=PLrAXtmRdnEQy6nuLMfJJuaP73-5MzX9tb" 5
```

### Web Interface

Start the local web server:

```bash
# Start the server
npm start
# or
node server.js
```

Then open your browser to: **http://localhost:3000**

The web interface provides:
- YouTube URL input field with drag & drop support
- Video info preview (title, duration, etc.)
- Playlist support with progress tracking
- Multiple filename template options
- One-click download with real-time progress bars
- Download history and status tracking
- Responsive design for mobile and desktop

## API Endpoints

The web server exposes a REST API:

### GET `/health`
Check if the server is running.

### GET `/api/check-dependencies`
Verify yt-dlp and ffmpeg are installed.

### GET `/api/video-info?url=<youtube_url>`
Get video information without downloading.

### GET `/api/playlist-info?url=<playlist_url>`
Get playlist information without downloading.

### POST `/api/download`
Download and convert video to MP3.

**Request body:**
```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "audioQuality": "0",
  "namingTemplate": "DEFAULT",
  "customTemplate": ""
}
```

### POST `/api/download-playlist`
Download and convert playlist to MP3 files.

**Request body:**
```json
{
  "url": "https://www.youtube.com/playlist?list=PLAYLIST_ID",
  "maxVideos": 25,
  "audioQuality": "0",
  "namingTemplate": "PLAYLIST_INDEX"
}
```

## File Structure

```
FFMPEG-EXTRACT-AUDIO/
├── download.js         # CLI script
├── server.js          # Express web server with inline HTML
├── audioExtractor.js  # Core audio extraction logic
├── utils.js           # URL validation and utilities
├── errorHandler.js    # Error handling and classification
├── package.json       # Project configuration
└── README.md          # This file
```

## Output Files

Downloaded MP3 files are saved in the project directory with various naming options:

### Naming Templates

- **DEFAULT**: `[Video Title] [Video ID].mp3`
- **ARTIST_TITLE**: `[Uploader] - [Video Title].mp3`
- **DATE_TITLE**: `[Upload Date] - [Video Title].mp3`
- **DURATION_TITLE**: `[Video Title] ([Duration]s).mp3`
- **PLAYLIST_INDEX**: `01. [Video Title].mp3` (for playlists)
- **CUSTOM**: User-defined template with variables

### Examples
```
Rick Astley - Never Gonna Give You Up [dQw4w9WgXcQ].mp3
Rick Astley - Never Gonna Give You Up.mp3
2009-10-25 - Never Gonna Give You Up.mp3
Never Gonna Give You Up (212s).mp3
01. Never Gonna Give You Up.mp3
```

### Template Variables
Available in custom templates:
- `{title}` - Video title
- `{uploader}` - Channel name
- `{upload_date}` - Upload date
- `{duration}` - Video duration in seconds
- `{id}` - Video ID
- `{playlist_index:02d}` - Playlist position (padded)

## Security Features

- **URL validation** - Only YouTube URLs accepted
- **Input sanitization** - Prevents command injection  
- **Rate limiting** - Prevents abuse (10 requests per minute)
- **Security headers** - HTTPS, CSP, and other protections
- **Error handling** - Safe error messages without exposing system info

## Troubleshooting

### Common Issues

#### "yt-dlp not found" or "ffmpeg not found"

**Solution:** Install the missing dependencies using Homebrew:

```bash
# Install Homebrew if not already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install yt-dlp and ffmpeg
brew install yt-dlp ffmpeg

# Verify installation
which yt-dlp
which ffmpeg
```

#### "Permission denied" errors

**Solution:** Ensure the download.js script is executable:

```bash
chmod +x download.js
```

#### Downloads failing with network errors

**Potential causes:**
- Video is private, deleted, or region-restricted
- YouTube has changed their API (update yt-dlp)
- Network connectivity issues

**Solutions:**
```bash
# Update yt-dlp to latest version
brew update && brew upgrade yt-dlp

# Test with a different video URL
npm run cli -- "https://www.youtube.com/watch?v=jNQXAC9IVRw"
```

#### Port 3000 already in use

**Solution:** Kill the process using port 3000 or use a different port:

```bash
# Find and kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Or set a different port
PORT=3001 npm start
```

#### Node.js version compatibility

**Error:** `SyntaxError: Cannot use import statement outside a module`

**Solution:** Ensure you're using Node.js 18+ and the project uses ES modules:

```bash
# Check Node.js version
node --version

# Update Node.js if needed (using nvm)
nvm install 18
nvm use 18
```

### Debug Mode

Run with verbose output to troubleshoot issues:

```bash
# CLI debug mode
DEBUG=* npm run cli -- "https://www.youtube.com/watch?v=VIDEO_ID"

# Server debug mode  
DEBUG=* npm start
```

### Logs and Error Messages

The app provides detailed error messages for common issues:

- **Invalid URL format** - Check that the URL is a valid YouTube link
- **Video unavailable** - Video may be private, deleted, or region-restricted  
- **Conversion failed** - Check ffmpeg installation and disk space
- **Rate limit exceeded** - Wait before making additional requests

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b my-new-feature`
3. Commit changes: `git commit -am 'Add some feature'`
4. Push to branch: `git push origin my-new-feature`
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - YouTube downloader
- [FFmpeg](https://ffmpeg.org/) - Media conversion library
- [Express.js](https://expressjs.com/) - Web server framework

---

**Note:** This tool is for educational and personal use only. Always respect copyright laws and platform terms of service.