import express from 'express';
import { extractAudio, checkDependencies, getVideoInfo } from './audioExtractor.js';
import { validateAndSanitizeYouTubeURL, RateLimiter, validateApiInput } from './utils.js';
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

// Store active downloads (in memory for simplicity)
const activeDownloads = new Map();

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
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .container {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            padding: 40px;
            max-width: 600px;
            width: 100%;
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

        .form-group {
            margin-bottom: 25px;
            text-align: left;
        }

        label {
            display: block;
            margin-bottom: 8px;
            color: #555;
            font-weight: 600;
        }

        input[type="url"] {
            width: 100%;
            padding: 15px;
            border: 2px solid #e0e0e0;
            border-radius: 10px;
            font-size: 16px;
            transition: border-color 0.3s ease;
        }

        input[type="url"]:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
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
        }

        .btn:hover:not(:disabled) {
            transform: translateY(-2px);
        }

        .btn:disabled {
            opacity: 0.7;
            cursor: not-allowed;
        }

        .status {
            margin-top: 25px;
            padding: 20px;
            border-radius: 10px;
            min-height: 60px;
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

        .video-info {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
            text-align: left;
            display: none;
        }

        .video-info h3 {
            color: #333;
            margin-bottom: 10px;
        }

        .video-info p {
            margin: 5px 0;
            color: #666;
        }

        .disclaimer {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 10px;
            padding: 20px;
            margin-top: 30px;
            color: #856404;
        }

        .disclaimer h3 {
            margin-bottom: 10px;
            color: #856404;
        }

        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid #f3f3f3;
            border-top: 3px solid #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-right: 10px;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .examples {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
            text-align: left;
        }

        .examples h3 {
            color: #333;
            margin-bottom: 15px;
        }

        .examples code {
            background: #e9ecef;
            padding: 3px 6px;
            border-radius: 4px;
            font-family: 'Courier New', monospace;
            display: block;
            margin: 5px 0;
            word-break: break-all;
        }

        @media (max-width: 768px) {
            .container {
                padding: 30px 20px;
                margin: 10px;
            }
            
            h1 {
                font-size: 1.5rem;
            }
            
            .subtitle {
                font-size: 1rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🎵</div>
        <h1>FFMPEG-EXTRACT-AUDIO</h1>
        <p class="subtitle">Extract high-quality MP3 audio from YouTube videos</p>

        <form id="downloadForm">
            <div class="form-group">
                <label for="youtubeUrl">YouTube URL:</label>
                <input 
                    type="url" 
                    id="youtubeUrl" 
                    name="youtubeUrl" 
                    placeholder="https://www.youtube.com/watch?v=..." 
                    required
                >
            </div>
            
            <button type="submit" class="btn" id="downloadBtn">
                Download MP3
            </button>
        </form>

        <div class="examples">
            <h3>💡 Supported URL formats:</h3>
            <code>https://www.youtube.com/watch?v=VIDEO_ID</code>
            <code>https://youtu.be/VIDEO_ID</code>
            <code>https://youtube.com/watch?v=VIDEO_ID</code>
        </div>

        <div class="video-info" id="videoInfo">
            <h3>📹 Video Information</h3>
            <p><strong>Title:</strong> <span id="videoTitle"></span></p>
            <p><strong>Duration:</strong> <span id="videoDuration"></span> seconds</p>
            <p><strong>Uploader:</strong> <span id="videoUploader"></span></p>
        </div>

        <div class="status" id="status"></div>

        <div class="disclaimer">
            <h3>📋 Legal Disclaimer</h3>
            <p>This tool is intended only for downloading content you own or have legal rights to use. Please respect copyright laws and YouTube's Terms of Service.</p>
        </div>
    </div>

    <script>
        const form = document.getElementById('downloadForm');
        const urlInput = document.getElementById('youtubeUrl');
        const downloadBtn = document.getElementById('downloadBtn');
        const status = document.getElementById('status');
        const videoInfo = document.getElementById('videoInfo');

        function showStatus(message, type = 'info') {
            status.className = \`status \${type}\`;
            status.innerHTML = message;
            status.style.display = 'block';
        }

        function hideStatus() {
            status.style.display = 'none';
        }

        function showVideoInfo(info) {
            document.getElementById('videoTitle').textContent = info.title;
            document.getElementById('videoDuration').textContent = info.duration;
            document.getElementById('videoUploader').textContent = info.uploader;
            videoInfo.style.display = 'block';
        }

        function hideVideoInfo() {
            videoInfo.style.display = 'none';
        }

        function setLoading(loading) {
            downloadBtn.disabled = loading;
            if (loading) {
                downloadBtn.innerHTML = '<span class="loading"></span>Processing...';
            } else {
                downloadBtn.innerHTML = 'Download MP3';
            }
        }

        // Get video info when URL is entered
        urlInput.addEventListener('blur', async function() {
            const url = this.value.trim();
            if (!url) return;

            try {
                showStatus('<span class="loading"></span>Getting video information...', 'info');
                
                const response = await fetch('/video-info', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ url: url })
                });

                const result = await response.json();

                if (result.success) {
                    showVideoInfo(result.data);
                    hideStatus();
                } else {
                    hideVideoInfo();
                    showStatus(\`❌ \${result.message}\`, 'error');
                }
            } catch (error) {
                hideVideoInfo();
                showStatus('❌ Could not get video information', 'error');
            }
        });

        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const url = urlInput.value.trim();
            if (!url) {
                showStatus('❌ Please enter a YouTube URL', 'error');
                return;
            }

            setLoading(true);
            hideVideoInfo();
            showStatus('<span class="loading"></span>Downloading and extracting audio... This may take a few minutes.', 'info');

            try {
                const response = await fetch('/download', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ url: url })
                });

                const result = await response.json();

                if (result.success) {
                    showStatus(\`🎉 Success! Audio extracted: <strong>\${result.filename}</strong><br>📁 Saved to: \${result.outputPath}\`, 'success');
                } else {
                    showStatus(\`❌ Download failed: \${result.message}\`, 'error');
                }
            } catch (error) {
                showStatus('❌ Network error. Please check your connection and try again.', 'error');
            } finally {
                setLoading(false);
            }
        });

        // Check dependencies on page load
        window.addEventListener('load', async function() {
            try {
                const response = await fetch('/check-dependencies');
                const result = await response.json();

                if (!result.allAvailable) {
                    showStatus(\`❌ Missing dependencies: \${result.errors.join(', ')}\`, 'error');
                }
            } catch (error) {
                showStatus('❌ Could not check dependencies', 'error');
            }
        });
    </script>
</body>
</html>
  `;
  
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
