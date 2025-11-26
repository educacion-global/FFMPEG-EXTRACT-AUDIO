import express from 'express';
import { extractAudio, checkDependencies, getVideoInfo, extractPlaylistAudio, getPlaylistInfo } from './audioExtractor.js';
import { validateAndSanitizeYouTubeURL, RateLimiter, validateApiInput, NAMING_TEMPLATES, generateFilenameFromTemplate, ProgressTracker } from './utils.js';
import { handleError, logError } from './errorHandler.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Security and rate limiting
const downloadRateLimiter = new RateLimiter(5, 300000); // 5 downloads per 5 minutes
const apiRateLimiter = new RateLimiter(50, 60000); // 50 API calls per minute

// Middleware
app.use(express.json({ limit: '10mb' })); // Limit JSON payload size
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Rate limiting middleware
function rateLimitMiddleware(limiter, errorMessage = 'Too many requests') {
  return (req, res, next) => {
    const identifier = req.ip || 'unknown';
    
    if (!limiter.isAllowed(identifier)) {
      return res.status(429).json({
        success: false,
        message: errorMessage,
        code: 'RATE_LIMITED'
      });
    }
    
    next();
  };
}

// Store active downloads and progress tracker
const activeDownloads = new Map();
const progressTracker = new ProgressTracker();

// Cleanup old downloads every hour
setInterval(() => {
  progressTracker.cleanup();
}, 3600000);

/**
 * Serves the main HTML interface
 */
app.get('/', (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FFMPEG-EXTRACT-AUDIO - YouTube to MP3 Converter</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            padding: 40px;
            max-width: 800px;
            margin: 0 auto;
            text-align: center;
        }

        .logo {
            font-size: 3rem;
            margin-bottom: 10px;
        }

        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 2rem;
        }

        .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 1.1rem;
        }

        .tabs {
            display: flex;
            margin-bottom: 30px;
            background: #f8f9fa;
            border-radius: 10px;
            padding: 5px;
        }

        .tab {
            flex: 1;
            padding: 12px 20px;
            border: none;
            background: transparent;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s ease;
        }

        .tab.active {
            background: #667eea;
            color: white;
        }

        .tab-content {
            display: none;
            text-align: left;
        }

        .tab-content.active {
            display: block;
        }

        .form-group {
            margin-bottom: 25px;
        }

        label {
            display: block;
            margin-bottom: 8px;
            color: #555;
            font-weight: 600;
        }

        input, select {
            width: 100%;
            padding: 15px;
            border: 2px solid #e0e0e0;
            border-radius: 10px;
            font-size: 16px;
            transition: border-color 0.3s ease;
        }

        input:focus, select:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .drag-drop-area {
            border: 3px dashed #ccc;
            border-radius: 15px;
            padding: 40px;
            text-align: center;
            margin-bottom: 20px;
            transition: all 0.3s ease;
            cursor: pointer;
        }

        .drag-drop-area.dragover {
            border-color: #667eea;
            background: rgba(102, 126, 234, 0.05);
        }

        .drag-drop-area:hover {
            border-color: #667eea;
        }

        .btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 15px 30px;
            border-radius: 10px;
            font-size: 18px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s ease;
            width: 100%;
            margin: 10px 0;
        }

        .btn:hover:not(:disabled) {
            transform: translateY(-2px);
        }

        .btn:disabled {
            opacity: 0.7;
            cursor: not-allowed;
        }

        .btn.secondary {
            background: #6c757d;
        }

        .progress-container {
            margin: 20px 0;
            display: none;
        }

        .progress-bar {
            width: 100%;
            height: 8px;
            background: #e0e0e0;
            border-radius: 4px;
            overflow: hidden;
        }

        .progress-bar-fill {
            height: 100%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            width: 0%;
            transition: width 0.3s ease;
        }

        .progress-text {
            margin-top: 10px;
            font-size: 14px;
            color: #666;
            text-align: center;
        }

        .status {
            margin-top: 25px;
            padding: 20px;
            border-radius: 10px;
            display: none;
        }

        .status.success {
            background: #d4edda;
            border: 1px solid #c3e6cb;
            color: #155724;
        }

        .status.error {
            background: #f8d7da;
            border: 1px solid #f5c6cb;
            color: #721c24;
        }

        .status.info {
            background: #d1ecf1;
            border: 1px solid #bee5eb;
            color: #0c5460;
        }

        .video-info, .playlist-info {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
            text-align: left;
            display: none;
        }

        .video-info h3, .playlist-info h3 {
            color: #333;
            margin-bottom: 10px;
        }

        .playlist-item {
            background: white;
            border-radius: 8px;
            padding: 15px;
            margin: 10px 0;
            border-left: 4px solid #667eea;
        }

        .download-history {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 20px;
            margin-top: 30px;
            max-height: 300px;
            overflow-y: auto;
        }

        .history-item {
            background: white;
            padding: 15px;
            margin: 10px 0;
            border-radius: 8px;
            display: flex;
            justify-content: between;
            align-items: center;
        }

        .history-item .title {
            flex: 1;
            font-weight: 600;
        }

        .history-item .status {
            padding: 5px 10px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
        }

        .disclaimer {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            color: #856404;
            padding: 20px;
            border-radius: 10px;
            margin-top: 30px;
            text-align: left;
        }

        .disclaimer strong {
            color: #d63031;
        }

        @media (max-width: 768px) {
            .container {
                padding: 20px;
                margin: 10px;
            }
            
            .tabs {
                flex-direction: column;
            }
            
            .tab {
                margin: 2px 0;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🎵</div>
        <h1>FFMPEG-EXTRACT-AUDIO</h1>
        <p class="subtitle">Convert YouTube videos and playlists to high-quality MP3 files</p>
        
        <div class="tabs">
            <button class="tab active" onclick="showTab('single')">Single Video</button>
            <button class="tab" onclick="showTab('playlist')">Playlist</button>
            <button class="tab" onclick="showTab('settings')">Settings</button>
        </div>

        <!-- Single Video Tab -->
        <div id="single-tab" class="tab-content active">
            <div class="drag-drop-area" id="dragDropArea" onclick="document.getElementById('urlInput').focus()">
                <div>📎</div>
                <p><strong>Drag & Drop a YouTube URL here</strong></p>
                <p>or paste it in the input below</p>
            </div>
            
            <div class="form-group">
                <label for="urlInput">YouTube Video URL:</label>
                <input type="url" id="urlInput" placeholder="https://www.youtube.com/watch?v=..." />
            </div>

            <button class="btn" onclick="getVideoInfo()">📄 Get Video Info</button>
            <button class="btn" onclick="downloadSingle()">⬇️ Download MP3</button>
            
            <div id="videoInfo" class="video-info">
                <h3>Video Information</h3>
                <div id="videoDetails"></div>
            </div>
        </div>

        <!-- Playlist Tab -->
        <div id="playlist-tab" class="tab-content">
            <div class="form-group">
                <label for="playlistUrlInput">YouTube Playlist URL:</label>
                <input type="url" id="playlistUrlInput" placeholder="https://www.youtube.com/playlist?list=..." />
            </div>

            <div class="form-group">
                <label for="maxVideos">Max Videos to Download:</label>
                <select id="maxVideos">
                    <option value="10">10 videos</option>
                    <option value="25" selected>25 videos</option>
                    <option value="50">50 videos</option>
                    <option value="100">100 videos</option>
                </select>
            </div>

            <button class="btn" onclick="getPlaylistInfo()">📋 Get Playlist Info</button>
            <button class="btn" onclick="downloadPlaylist()">⬇️ Download Playlist</button>

            <div id="playlistInfo" class="playlist-info">
                <h3>Playlist Information</h3>
                <div id="playlistDetails"></div>
            </div>
        </div>

        <!-- Settings Tab -->
        <div id="settings-tab" class="tab-content">
            <div class="form-group">
                <label for="audioQuality">Audio Quality:</label>
                <select id="audioQuality">
                    <option value="0">Best Quality</option>
                    <option value="128">128 kbps</option>
                    <option value="192">192 kbps</option>
                    <option value="256">256 kbps</option>
                    <option value="320">320 kbps</option>
                </select>
            </div>

            <div class="form-group">
                <label for="namingTemplate">File Naming Template:</label>
                <select id="namingTemplate">
                    <option value="DEFAULT">Title [ID] (Default)</option>
                    <option value="ARTIST_TITLE">Artist - Title</option>
                    <option value="DATE_TITLE">Date - Title</option>
                    <option value="DURATION_TITLE">Title (Duration)</option>
                    <option value="PLAYLIST_INDEX">01. Title (For playlists)</option>
                </select>
            </div>

            <div class="form-group">
                <label for="customTemplate">Custom Template:</label>
                <input type="text" id="customTemplate" placeholder="{title} by {uploader}" />
                <small>Available: {title}, {uploader}, {upload_date}, {duration}, {id}</small>
            </div>
        </div>

        <!-- Progress Bar -->
        <div id="progressContainer" class="progress-container">
            <div class="progress-bar">
                <div id="progressBarFill" class="progress-bar-fill"></div>
            </div>
            <div id="progressText" class="progress-text">Preparing download...</div>
        </div>

        <!-- Status Messages -->
        <div id="status" class="status"></div>

        <!-- Download History -->
        <div id="downloadHistory" class="download-history" style="display: none;">
            <h3>Download History</h3>
            <div id="historyList"></div>
        </div>

        <!-- Legal Disclaimer -->
        <div class="disclaimer">
            <strong>⚠️ Legal Disclaimer:</strong> This tool is intended only for downloading content you own or have legal rights to use. Please respect copyright laws and YouTube's Terms of Service. Use responsibly.
        </div>
    </div>

    <script>
        let currentDownloads = new Map();
        let downloadHistory = JSON.parse(localStorage.getItem('downloadHistory')) || [];

        // Tab Management
        function showTab(tabName) {
            // Hide all tab contents
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            // Remove active class from all tabs
            document.querySelectorAll('.tab').forEach(tab => {
                tab.classList.remove('active');
            });
            
            // Show selected tab content
            document.getElementById(tabName + '-tab').classList.add('active');
            
            // Add active class to selected tab
            event.target.classList.add('active');
        }

        // Drag and Drop Functionality
        const dragDropArea = document.getElementById('dragDropArea');
        const urlInput = document.getElementById('urlInput');

        dragDropArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            dragDropArea.classList.add('dragover');
        });

        dragDropArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dragDropArea.classList.remove('dragover');
        });

        dragDropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            dragDropArea.classList.remove('dragover');
            
            const text = e.dataTransfer.getData('text');
            if (text && (text.includes('youtube.com') || text.includes('youtu.be'))) {
                urlInput.value = text;
                getVideoInfo();
            }
        });

        // URL Input Paste Detection
        urlInput.addEventListener('paste', (e) => {
            setTimeout(() => {
                const url = urlInput.value.trim();
                if (url && (url.includes('youtube.com') || url.includes('youtu.be'))) {
                    getVideoInfo();
                }
            }, 100);
        });

        // Progress Management
        function showProgress(show = true) {
            const container = document.getElementById('progressContainer');
            container.style.display = show ? 'block' : 'none';
            if (!show) {
                updateProgress(0, '');
            }
        }

        function updateProgress(percentage, text) {
            document.getElementById('progressBarFill').style.width = percentage + '%';
            document.getElementById('progressText').textContent = text;
        }

        function showStatus(message, type = 'info') {
            const status = document.getElementById('status');
            status.textContent = message;
            status.className = 'status ' + type;
            status.style.display = 'block';
        }

        function hideStatus() {
            document.getElementById('status').style.display = 'none';
        }

        // Video Info Functions
        async function getVideoInfo() {
            const url = document.getElementById('urlInput').value.trim();
            if (!url) return;

            try {
                showStatus('Getting video information...', 'info');
                
                const response = await fetch('/api/video-info?url=' + encodeURIComponent(url));
                const data = await response.json();

                if (data.success) {
                    displayVideoInfo(data.info);
                    showStatus('Video information loaded successfully!', 'success');
                } else {
                    showStatus('Error: ' + data.message, 'error');
                }
            } catch (error) {
                showStatus('Error getting video info: ' + error.message, 'error');
            }
        }

        function displayVideoInfo(info) {
            const videoInfo = document.getElementById('videoInfo');
            const details = document.getElementById('videoDetails');
            
            const duration = Math.floor(info.duration / 60) + ':' + String(info.duration % 60).padStart(2, '0');
            
            details.innerHTML = \`
                <p><strong>Title:</strong> \${info.title}</p>
                <p><strong>Uploader:</strong> \${info.uploader}</p>
                <p><strong>Duration:</strong> \${duration}</p>
                <p><strong>Upload Date:</strong> \${info.upload_date}</p>
                \${info.description ? '<p><strong>Description:</strong> ' + info.description.substring(0, 200) + '...</p>' : ''}
            \`;
            
            videoInfo.style.display = 'block';
        }

        // Playlist Functions
        async function getPlaylistInfo() {
            const url = document.getElementById('playlistUrlInput').value.trim();
            if (!url) return;

            try {
                showStatus('Getting playlist information...', 'info');
                
                const response = await fetch('/api/playlist-info?url=' + encodeURIComponent(url));
                const data = await response.json();

                if (data.success) {
                    displayPlaylistInfo(data);
                    showStatus('Playlist information loaded successfully!', 'success');
                } else {
                    showStatus('Error: ' + data.message, 'error');
                }
            } catch (error) {
                showStatus('Error getting playlist info: ' + error.message, 'error');
            }
        }

        function displayPlaylistInfo(data) {
            const playlistInfo = document.getElementById('playlistInfo');
            const details = document.getElementById('playlistDetails');
            
            let videosHtml = '';
            data.info.entries.slice(0, 10).forEach((video, index) => {
                videosHtml += \`
                    <div class="playlist-item">
                        <strong>\${index + 1}. \${video.title}</strong><br>
                        <small>by \${video.uploader || 'Unknown'}</small>
                    </div>
                \`;
            });
            
            if (data.info.entries.length > 10) {
                videosHtml += \`<p><em>... and \${data.info.entries.length - 10} more videos</em></p>\`;
            }
            
            details.innerHTML = \`
                <p><strong>Playlist:</strong> \${data.info.title}</p>
                <p><strong>Total Videos:</strong> \${data.info.entries.length}</p>
                <div style="max-height: 200px; overflow-y: auto;">
                    \${videosHtml}
                </div>
            \`;
            
            playlistInfo.style.display = 'block';
        }

        // Download Functions
        async function downloadSingle() {
            const url = document.getElementById('urlInput').value.trim();
            if (!url) {
                showStatus('Please enter a YouTube URL', 'error');
                return;
            }

            const downloadId = Date.now().toString();
            currentDownloads.set(downloadId, { url, type: 'single' });

            try {
                showProgress(true);
                updateProgress(0, 'Starting download...');
                showStatus('Starting download...', 'info');

                const response = await fetch('/api/download', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url: url,
                        audioQuality: document.getElementById('audioQuality').value,
                        namingTemplate: document.getElementById('namingTemplate').value,
                        customTemplate: document.getElementById('customTemplate').value
                    })
                });

                const data = await response.json();

                if (data.success) {
                    updateProgress(100, 'Download completed!');
                    showStatus('Download completed successfully!', 'success');
                    addToHistory(url, data.filename, 'completed');
                } else {
                    showStatus('Download failed: ' + data.message, 'error');
                    addToHistory(url, null, 'failed');
                }
            } catch (error) {
                showStatus('Error: ' + error.message, 'error');
                addToHistory(url, null, 'failed');
            } finally {
                currentDownloads.delete(downloadId);
                setTimeout(() => showProgress(false), 2000);
            }
        }

        async function downloadPlaylist() {
            const url = document.getElementById('playlistUrlInput').value.trim();
            if (!url) {
                showStatus('Please enter a YouTube playlist URL', 'error');
                return;
            }

            const downloadId = Date.now().toString();
            const maxVideos = document.getElementById('maxVideos').value;
            currentDownloads.set(downloadId, { url, type: 'playlist' });

            try {
                showProgress(true);
                updateProgress(0, 'Starting playlist download...');
                showStatus('Starting playlist download...', 'info');

                const response = await fetch('/api/download-playlist', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url: url,
                        maxVideos: parseInt(maxVideos),
                        audioQuality: document.getElementById('audioQuality').value,
                        namingTemplate: document.getElementById('namingTemplate').value,
                        customTemplate: document.getElementById('customTemplate').value
                    })
                });

                const reader = response.body.getReader();
                let result = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    result += new TextDecoder().decode(value);
                    const lines = result.split('\\n');
                    
                    for (let i = 0; i < lines.length - 1; i++) {
                        const line = lines[i].trim();
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.substring(6));
                                if (data.progress) {
                                    const percentage = Math.round((data.progress.current / data.progress.total) * 100);
                                    updateProgress(percentage, \`\${data.progress.current}/\${data.progress.total}: \${data.progress.videoTitle}\`);
                                }
                            } catch (e) {
                                console.log('Parse error:', e);
                            }
                        }
                    }
                    
                    result = lines[lines.length - 1];
                }

                updateProgress(100, 'Playlist download completed!');
                showStatus('Playlist download completed!', 'success');

            } catch (error) {
                showStatus('Error: ' + error.message, 'error');
            } finally {
                currentDownloads.delete(downloadId);
                setTimeout(() => showProgress(false), 2000);
            }
        }

        // History Management
        function addToHistory(url, filename, status) {
            const historyItem = {
                url,
                filename,
                status,
                timestamp: new Date().toISOString(),
                title: document.querySelector('#videoInfo h3')?.nextElementSibling?.querySelector('p')?.textContent?.replace('Title: ', '') || 'Unknown'
            };
            
            downloadHistory.unshift(historyItem);
            downloadHistory = downloadHistory.slice(0, 50); // Keep only last 50
            
            localStorage.setItem('downloadHistory', JSON.stringify(downloadHistory));
            updateHistoryDisplay();
        }

        function updateHistoryDisplay() {
            if (downloadHistory.length === 0) return;
            
            const historyContainer = document.getElementById('downloadHistory');
            const historyList = document.getElementById('historyList');
            
            historyList.innerHTML = downloadHistory.slice(0, 10).map(item => \`
                <div class="history-item">
                    <div class="title">\${item.title}</div>
                    <div class="status \${item.status}">\${item.status}</div>
                </div>
            \`).join('');
            
            historyContainer.style.display = 'block';
    
  res.send(html);
});

/**
 * API endpoint to check dependencies
 */
app.get('/check-dependencies', rateLimitMiddleware(apiRateLimiter), async (req, res) => {
  try {
    const result = await checkDependencies();
    res.json(result);
  } catch (error) {
    logError(error, 'dependency-check-api');
    const errorResponse = handleError(error, 'dependency-check');
    res.status(500).json(errorResponse);
  }
});

/**
 * API endpoint to get video information
 */
app.post('/video-info', rateLimitMiddleware(apiRateLimiter), async (req, res) => {
  try {
    // Validate input
    const validation = validateApiInput(req.body, {
      url: {
        required: true,
        type: 'string',
        maxLength: 2000,
        validate: (url) => url.trim().length > 0,
        validateMessage: 'must not be empty'
      }
    });

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input',
        errors: validation.errors,
        code: 'VALIDATION_ERROR'
      });
    }

    const { url } = req.body;
    console.log(`📹 Getting video info for: ${url}`);
    
    const videoInfo = await getVideoInfo(url);
    
    if (videoInfo.success) {
      res.json({
        success: true,
        data: videoInfo
      });
    } else {
      res.status(400).json({
        success: false,
        message: videoInfo.error || 'Could not get video information',
        code: videoInfo.code || 'VIDEO_INFO_ERROR'
      });
    }
  } catch (error) {
    logError(error, 'video-info-api');
    const errorResponse = handleError(error, 'video-info');
    res.status(500).json(errorResponse);
  }
});

/**
 * API endpoint to download and extract audio
 */
app.post('/download', rateLimitMiddleware(downloadRateLimiter, 'Download limit exceeded. Please wait before trying again.'), async (req, res) => {
  try {
    // Validate input
    const validation = validateApiInput(req.body, {
      url: {
        required: true,
        type: 'string',
        maxLength: 2000,
        validate: (url) => url.trim().length > 0,
        validateMessage: 'must not be empty'
      }
    });

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input',
        errors: validation.errors,
        code: 'VALIDATION_ERROR'
      });
    }

    const { url } = req.body;

    // Generate a unique ID for this download
    const downloadId = Date.now().toString();
    console.log(`🎵 Starting download ${downloadId} for: ${url}`);

    // Store download in active downloads
    activeDownloads.set(downloadId, {
      url,
      status: 'processing',
      startTime: new Date()
    });

    // Perform the download with enhanced error handling
    const result = await extractAudio(url, {
      outputPath: process.cwd(),
      audioFormat: 'mp3',
      audioQuality: '0',
      maxRetries: 2 // Reduced retries for web interface
    });

    // Update download status
    activeDownloads.set(downloadId, {
      ...activeDownloads.get(downloadId),
      status: result.success ? 'completed' : 'failed',
      endTime: new Date(),
      result
    });

    if (result.success) {
      console.log(`✅ Download ${downloadId} completed: ${result.filename}`);
      res.json({
        success: true,
        message: 'Audio extracted successfully',
        filename: result.filename,
        outputPath: result.outputPath,
        downloadId
      });
    } else {
      console.log(`❌ Download ${downloadId} failed: ${result.message}`);
      const statusCode = result.code === 'VALIDATION_ERROR' ? 400 : 422;
      res.status(statusCode).json({
        success: false,
        message: result.message,
        userMessage: result.userMessage,
        troubleshooting: result.troubleshooting,
        code: result.code,
        downloadId
      });
    }

    // Clean up old downloads (keep only last 20)
    if (activeDownloads.size > 20) {
      const entries = Array.from(activeDownloads.entries());
      entries.slice(0, entries.length - 20).forEach(([id]) => {
        activeDownloads.delete(id);
      });
    }

  } catch (error) {
    logError(error, 'download-api');
    const errorResponse = handleError(error, 'download');
    const statusCode = error.name === 'ValidationError' ? 400 : 500;
    res.status(statusCode).json(errorResponse);
  }
});

/**
 * API endpoint to check download status
 */
app.get('/download-status/:id', (req, res) => {
  const { id } = req.params;
  const download = activeDownloads.get(id);
  
  if (!download) {
    return res.status(404).json({
      success: false,
      message: 'Download not found'
    });
  }
  
  res.json({
    success: true,
    data: download
  });
});

/**
 * Health check endpoint
 */
app.get('/health', async (req, res) => {
  const dependencyCheck = await checkDependencies();
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    dependencies: dependencyCheck
  });
});

/**
 * 404 handler
 */
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

/**
 * Error handler
 */
app.use((error, req, res, next) => {
  console.error('Server error:', error.message);
  
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

/**
 * Start the server
 */
async function startServer() {
  try {
    // Check dependencies on startup
    console.log('🔍 Checking dependencies...');
    const depCheck = await checkDependencies();
    
    if (!depCheck.allAvailable) {
      console.error('❌ Missing dependencies:');
      depCheck.errors.forEach(error => console.error(`   • ${error}`));
      console.log('\n' + depCheck.installInstructions);
      process.exit(1);
    }
    
    console.log('✅ All dependencies available');
    
    // Start the server
    app.listen(PORT, () => {
      console.log('🚀 FFMPEG-EXTRACT-AUDIO Server Started!');
      console.log('='.repeat(50));
      console.log(`🌐 Web interface: http://localhost:${PORT}`);
      console.log(`📋 Health check: http://localhost:${PORT}/health`);
      console.log(`🔧 API endpoints:`);
      console.log(`   • POST /download - Download audio`);
      console.log(`   • POST /video-info - Get video info`);
      console.log(`   • GET /check-dependencies - Check deps`);
      console.log('='.repeat(50));
      console.log('Ready to accept requests! 🎉');
    });
    
  } catch (error) {
    console.error('💥 Failed to start server:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Server terminated');
  process.exit(0);
});

// Start the server
startServer();
