#!/usr/bin/env node

import { extractAudio, checkDependencies, getVideoInfo, extractPlaylistAudio, getPlaylistInfo } from './audioExtractor.js';
import { validateAndSanitizeYouTubeURL, validateAndSanitizeSpotifyURL, detectURLType } from './utils.js';
import { SpotifyHandler } from './spotifyHandler.js';
import { findBestYouTubeMatch } from './youtubeSearch.js';

/**
 * Displays the legal disclaimer
 */
function displayDisclaimer() {
  console.log('\n' + '='.repeat(80));
  console.log('📋 LEGAL DISCLAIMER');
  console.log('='.repeat(80));
  console.log('This tool is intended only for downloading content you own or have');
  console.log('legal rights to use. Please respect copyright laws and YouTube\'s');
  console.log('Terms of Service.');
  console.log('='.repeat(80) + '\n');
}

/**
 * Displays usage information
 */
function displayUsage() {
  console.log('🎵 FFMPEG-EXTRACT-AUDIO - YouTube & Spotify to MP3 Converter');
  console.log('='.repeat(60));
  console.log('Extract high-quality MP3 audio from YouTube videos and Spotify tracks/playlists\n');
  
  console.log('📖 USAGE:');
  console.log('  Single Video/Track:');
  console.log('    node download.js "<youtube_or_spotify_url>"');
  console.log('    npm run cli -- "<url>"\n');
  
  console.log('  Playlist:');
  console.log('    node download.js --playlist "<playlist_url>" [max_videos]');
  console.log('    npm run cli -- --playlist "<playlist_url>" [max_videos]\n');
  
  console.log('📋 OPTIONS:');
  console.log('  --help, -h         Show this help message');
  console.log('  --check-deps       Check if dependencies are installed');
  console.log('  --playlist, -p     Download entire playlist (max 100 videos)\n');
  
  console.log('💡 EXAMPLES:');
  console.log('  YouTube video:');
  console.log('    node download.js "https://www.youtube.com/watch?v=dQw4w9WgXcQ"');
  console.log('    npm run cli -- "https://youtu.be/dQw4w9WgXcQ"\n');
  
  console.log('  Spotify track:');
  console.log('    node download.js "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh"');
  console.log('    npm run cli -- "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh"\n');
  
  console.log('  Spotify playlist:');
  console.log('    node download.js --playlist "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"');
  console.log('    npm run cli -- --playlist "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"\n');
  
  console.log('  YouTube playlist (limited):');
  console.log('    node download.js --playlist "https://www.youtube.com/playlist?list=PLxxxxxxx" 10');
  console.log('    npm run cli -- --playlist "https://www.youtube.com/playlist?list=PLxxxxxxx" 5\n');
  
  console.log('  Check dependencies:');
  console.log('    node download.js --check-deps');
  console.log('    npm run cli -- --check-deps\n');
  
  console.log('🔧 REQUIREMENTS:');
  console.log('  • Node.js 18+');
  console.log('  • yt-dlp (brew install yt-dlp)');
  console.log('  • ffmpeg (brew install ffmpeg)');
  console.log('  • For Spotify (optional): spotdl (pip install spotdl)');
  console.log('  • For Spotify API: Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET\n');
  
  console.log('⚠️  DISCLAIMER:');
  console.log('This tool is for downloading content you own or have legal rights to use.');
}

/**
 * Checks and displays dependency status
 */
async function performDependencyCheck() {
  console.log('🔍 Checking system dependencies...\n');
  
  const depCheck = await checkDependencies();
  
  if (depCheck.allAvailable) {
    console.log('✅ All dependencies are available!');
    console.log('   • yt-dlp: Available');
    console.log('   • ffmpeg: Available');
    console.log('\nYou\'re ready to download YouTube audio! 🎉\n');
  } else {
    console.log('❌ Missing dependencies detected:\n');
    depCheck.errors.forEach(error => {
      console.log(`   • ${error}`);
    });
    console.log('\n📦 Installation Instructions:');
    console.log(depCheck.installInstructions);
    process.exit(1);
  }
}

/**
 * Main download function - handles both YouTube and Spotify URLs
 */
async function downloadAudio(url) {
  try {
    console.log('🎵 FFMPEG-EXTRACT-AUDIO - Starting Download');
    console.log('=' .repeat(50));
    
    // Display disclaimer
    displayDisclaimer();
    
    // Step 1: Check dependencies
    console.log('🔍 Step 1: Checking dependencies...');
    const depCheck = await checkDependencies();
    
    if (!depCheck.allAvailable) {
      console.error('❌ Missing dependencies:');
      depCheck.errors.forEach(error => console.error(`   • ${error}`));
      console.log('\n' + depCheck.installInstructions);
      process.exit(1);
    }
    
    console.log('✅ All dependencies available\n');
    
    // Step 2: Detect URL type and validate
    console.log('🔍 Step 2: Detecting URL type and validating...');
    const urlType = detectURLType(url);
    let cleanURL;
    
    if (urlType === 'youtube') {
      try {
        cleanURL = validateAndSanitizeYouTubeURL(url);
        console.log('✅ Valid YouTube URL detected\n');
        return await downloadYouTubeAudio(cleanURL);
      } catch (error) {
        console.error(`❌ ${error.message}`);
        console.log('Please provide a valid YouTube URL.');
        process.exit(1);
      }
    } else if (urlType === 'spotify') {
      try {
        cleanURL = validateAndSanitizeSpotifyURL(url);
        console.log('✅ Valid Spotify URL detected\n');
        return await downloadSpotifyAudio(cleanURL);
      } catch (error) {
        console.error(`❌ ${error.message}`);
        console.log('Please provide a valid Spotify URL.');
        process.exit(1);
      }
    } else {
      console.error('❌ Unsupported URL format');
      console.log('Supported URLs:');
      console.log('  • YouTube: https://www.youtube.com/watch?v=VIDEO_ID');
      console.log('  • YouTube: https://youtu.be/VIDEO_ID');
      console.log('  • Spotify: https://open.spotify.com/track/TRACK_ID');
      console.log('  • Spotify: https://open.spotify.com/album/ALBUM_ID');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n💥 UNEXPECTED ERROR');
    console.error('='.repeat(50));
    console.error(`Error: ${error.message}`);
    console.error('\nIf this error persists, please check:');
    console.error('• Your internet connection');
    console.error('• That yt-dlp and ffmpeg are properly installed');
    console.error('• The URL is valid and accessible');
    process.exit(1);
  }
}

/**
 * Download audio from YouTube URL
 */
async function downloadYouTubeAudio(cleanURL) {
  // Step 3: Get video information
  console.log('🔍 Step 3: Getting video information...');
  const videoInfo = await getVideoInfo(cleanURL);
  
  if (videoInfo.success) {
    console.log('✅ Video information retrieved:');
    console.log(`   • Title: ${videoInfo.title}`);
    console.log(`   • Duration: ${videoInfo.duration} seconds`);
    console.log(`   • Uploader: ${videoInfo.uploader}\n`);
  } else {
    console.log('⚠️  Could not retrieve video information, continuing...\n');
  }
  
  // Step 4: Download and extract audio
  console.log('🔍 Step 4: Downloading and extracting audio...');
  console.log('This may take a few minutes depending on video length and your internet connection.');
  console.log('');
  
  const result = await extractAudio(cleanURL, {
    outputPath: process.cwd(),
    audioFormat: 'mp3',
    audioQuality: '0' // Best quality
    });
    
    if (result.success) {
      console.log('\n🎉 SUCCESS! Audio extracted successfully!');
      console.log('='.repeat(50));
      console.log(`📁 File: ${result.filename}`);
      console.log(`📂 Location: ${result.outputPath}`);
      console.log('');
      console.log('✨ Your MP3 file is ready to use!');
    } else {
      console.error('\n❌ DOWNLOAD FAILED');
      console.error('='.repeat(50));
      console.error(`Error: ${result.message}`);
      
      if (result.stderr) {
        console.error('\nDetailed error information:');
        console.error(result.stderr);
      }
      
      console.log('\n🔧 Troubleshooting tips:');
      console.log('• Check your internet connection');
      console.log('• Verify the YouTube URL is correct and accessible');
      console.log('• Make sure the video is not private or region-blocked');
      console.log('• Try updating yt-dlp: brew upgrade yt-dlp');
      
      process.exit(1);
    }
}

/**
 * Download audio from Spotify URL (finds YouTube equivalent)
 */
async function downloadSpotifyAudio(spotifyUrl) {
  const spotifyHandler = new SpotifyHandler();
  
  try {
    // Step 3: Extract track information from Spotify
    console.log('🔍 Step 3: Extracting track information from Spotify...');
    const trackInfo = await spotifyHandler.extractTrackInfo(spotifyUrl);
    
    if (trackInfo.tracks && trackInfo.tracks.length > 0) {
      const track = trackInfo.tracks[0]; // For single track
      console.log('✅ Track information extracted:');
      console.log(`   • Title: ${track.title}`);
      console.log(`   • Artist: ${track.artist}`);
      console.log(`   • Album: ${track.album || 'Unknown'}`);
      if (track.duration) console.log(`   • Duration: ${track.duration} seconds`);
      console.log('');
      
      // Step 4: Search for YouTube equivalent
      console.log('� Step 4: Searching for YouTube equivalent...');
      const youtubeUrl = await findBestYouTubeMatch(track);
      console.log(`✅ Found YouTube match: ${youtubeUrl}\n`);
      
      // Step 5: Download from YouTube
      console.log('🔍 Step 5: Downloading audio from YouTube...');
      const result = await extractAudio(youtubeUrl, {
        outputPath: process.cwd(),
        audioFormat: 'mp3',
        audioQuality: '0',
        customFilename: `${track.title} - ${track.artist}`
      });
      
      if (result.success) {
        console.log('\n🎉 SUCCESS! Spotify track downloaded successfully!');
        console.log('='.repeat(50));
        console.log(`🎵 Track: ${track.title} by ${track.artist}`);
        console.log(`📁 File: ${result.filename}`);
        console.log(`📂 Location: ${result.outputPath}`);
        console.log('');
        console.log('✨ Your MP3 file is ready to use!');
      } else {
        throw new Error(`Download failed: ${result.message}`);
      }
    } else {
      throw new Error('No track information found');
    }
  } catch (error) {
    console.error('\n❌ SPOTIFY DOWNLOAD FAILED');
    console.error('='.repeat(50));
    console.error(`Error: ${error.message}`);
    
    console.log('\n🔧 Troubleshooting tips:');
    console.log('• Check your internet connection');
    console.log('• Verify the Spotify URL is correct and accessible');
    console.log('• Make sure the track/playlist is public');
    console.log('• For private content, set up Spotify API credentials');
    console.log('• Install spotdl: pip install spotdl');
    
    process.exit(1);
  }
}

/**
 * Main playlist download function - handles both YouTube and Spotify playlists
 */
async function downloadPlaylist(url, maxVideos = 25) {
  try {
    console.log('🎵 FFMPEG-EXTRACT-AUDIO - Starting Playlist Download');
    console.log('=' .repeat(50));
    
    // Display disclaimer
    displayDisclaimer();
    
    // Step 1: Check dependencies
    console.log('🔍 Step 1: Checking dependencies...');
    const depCheck = await checkDependencies();
    
    if (!depCheck.allAvailable) {
      console.error('❌ Missing dependencies:');
      depCheck.errors.forEach(error => console.error(`   • ${error}`));
      console.log('\n' + depCheck.installInstructions);
      process.exit(1);
    }
    
    console.log('✅ All dependencies available\n');
    
    // Step 2: Detect URL type and validate
    console.log('🔍 Step 2: Detecting playlist type and validating...');
    const urlType = detectURLType(url);
    let cleanURL;
    
    if (urlType === 'youtube') {
      try {
        cleanURL = validateAndSanitizeYouTubeURL(url);
        if (!cleanURL.includes('playlist') && !cleanURL.includes('list=')) {
          throw new Error('URL is not a valid YouTube playlist');
        }
        console.log('✅ Valid YouTube playlist URL detected\n');
        return await downloadYouTubePlaylist(cleanURL, maxVideos);
      } catch (error) {
        console.error(`❌ ${error.message}`);
        console.log('Please provide a valid YouTube playlist URL.');
        process.exit(1);
      }
    } else if (urlType === 'spotify') {
      try {
        cleanURL = validateAndSanitizeSpotifyURL(url);
        console.log('✅ Valid Spotify URL detected\n');
        return await downloadSpotifyPlaylist(cleanURL, maxVideos);
      } catch (error) {
        console.error(`❌ ${error.message}`);
        console.log('Please provide a valid Spotify playlist/album URL.');
        process.exit(1);
      }
    } else {
      console.error('❌ Unsupported playlist URL format');
      console.log('Supported playlist URLs:');
      console.log('  • YouTube: https://www.youtube.com/playlist?list=PLAYLIST_ID');
      console.log('  • Spotify: https://open.spotify.com/playlist/PLAYLIST_ID');
      console.log('  • Spotify: https://open.spotify.com/album/ALBUM_ID');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n💥 UNEXPECTED ERROR');
    console.error('='.repeat(50));
    console.error(`Error: ${error.message}`);
    console.error('\nIf this error persists, please check:');
    console.error('• Your internet connection');
    console.error('• That yt-dlp and ffmpeg are properly installed');
    console.error('• The playlist URL is valid and accessible');
    process.exit(1);
  }
}

/**
 * Download YouTube playlist
 */
async function downloadYouTubePlaylist(cleanURL, maxVideos) {
  // Step 3: Get playlist information
  console.log('🔍 Step 3: Getting playlist information...');
  const playlistInfo = await getPlaylistInfo(cleanURL);
  
  console.log('✅ Playlist information retrieved:');
  console.log(`   • Title: ${playlistInfo.title}`);
  console.log(`   • Total Videos: ${playlistInfo.entries.length}`);
  console.log(`   • Will download: ${Math.min(maxVideos, playlistInfo.entries.length)} videos\n`);
  
  // Step 4: Download playlist
  console.log('🔍 Step 4: Starting playlist download...');
  console.log('This may take a while depending on the number of videos.');
  console.log('');
  
  const result = await extractPlaylistAudio(cleanURL, {
    outputPath: process.cwd(),
    audioFormat: 'mp3',
      audioQuality: '0',
      maxVideos: maxVideos,
      onProgress: (progress) => {
        console.log(`📥 [${progress.current}/${progress.total}] ${progress.status}: ${progress.videoTitle}`);
      },
      onVideoComplete: (completion) => {
        console.log(`✅ [${completion.current}/${completion.total}] Completed: ${completion.title}`);
      }
    });
    
    if (result.success) {
      console.log('\n🎉 PLAYLIST DOWNLOAD COMPLETED!');
      console.log('='.repeat(50));
      console.log(`📁 Playlist: ${result.playlistTitle}`);
      console.log(`✅ Successful downloads: ${result.completedVideos}`);
      console.log(`❌ Failed downloads: ${result.failedVideos}`);
      console.log(`📂 Location: ${process.cwd()}`);
      
      if (result.errors.length > 0) {
        console.log('\n⚠️  Some videos failed to download:');
        result.errors.forEach(error => {
          console.log(`   • ${error.title}: ${error.error}`);
        });
      }
      
      console.log('\n✨ Your MP3 files are ready to use!');
    } else {
      console.error('\n❌ PLAYLIST DOWNLOAD FAILED');
      console.error('='.repeat(50));
      console.error(`Error: ${result.message}`);
      
      console.log('\n🔧 Troubleshooting tips:');
      console.log('• Check your internet connection');
      console.log('• Verify the YouTube playlist URL is correct and accessible');
      console.log('• Make sure the playlist is not private');
      console.log('• Try updating yt-dlp: brew upgrade yt-dlp');
      
      process.exit(1);
    }
}

/**
 * Download Spotify playlist/album
 */
async function downloadSpotifyPlaylist(spotifyUrl, maxTracks) {
  const spotifyHandler = new SpotifyHandler();
  
  try {
    // Step 3: Extract playlist information from Spotify
    console.log('� Step 3: Extracting playlist information from Spotify...');
    const playlistInfo = await spotifyHandler.extractTrackInfo(spotifyUrl);
    
    if (playlistInfo.tracks && playlistInfo.tracks.length > 0) {
      const tracksToDownload = playlistInfo.tracks.slice(0, maxTracks);
      console.log('✅ Playlist information extracted:');
      console.log(`   • Name: ${playlistInfo.name || 'Unknown Playlist'}`);
      console.log(`   • Total Tracks: ${playlistInfo.tracks.length}`);
      console.log(`   • Will download: ${tracksToDownload.length} tracks\n`);
      
      // Step 4: Download each track
      console.log('🔍 Step 4: Starting playlist download...');
      console.log('This may take a while depending on the number of tracks.');
      console.log('');
      
      const results = [];
      const errors = [];
      let completed = 0;
      
      for (let i = 0; i < tracksToDownload.length; i++) {
        const track = tracksToDownload[i];
        console.log(`\n📥 [${i + 1}/${tracksToDownload.length}] Processing: ${track.title} by ${track.artist}`);
        
        try {
          // Search for YouTube equivalent
          const youtubeUrl = await findBestYouTubeMatch(track);
          console.log(`🔍 Found YouTube match: ${youtubeUrl}`);
          
          // Download from YouTube
          const result = await extractAudio(youtubeUrl, {
            outputPath: process.cwd(),
            audioFormat: 'mp3',
            audioQuality: '0',
            customFilename: `${track.title} - ${track.artist}`
          });
          
          if (result.success) {
            console.log(`✅ [${i + 1}/${tracksToDownload.length}] Completed: ${track.title}`);
            results.push({ track, result });
            completed++;
          } else {
            throw new Error(result.message);
          }
        } catch (error) {
          console.error(`❌ [${i + 1}/${tracksToDownload.length}] Failed: ${track.title} - ${error.message}`);
          errors.push({ track, error: error.message });
        }
      }
      
      // Summary
      console.log('\n🎉 SPOTIFY PLAYLIST DOWNLOAD COMPLETED!');
      console.log('='.repeat(50));
      console.log(`🎵 Playlist: ${playlistInfo.name || 'Spotify Playlist'}`);
      console.log(`✅ Successful downloads: ${completed}`);
      console.log(`❌ Failed downloads: ${errors.length}`);
      console.log(`📂 Location: ${process.cwd()}`);
      
      if (errors.length > 0) {
        console.log('\n⚠️  Some tracks failed to download:');
        errors.forEach(error => {
          console.log(`   • ${error.track.title} by ${error.track.artist}: ${error.error}`);
        });
      }
      
      console.log('\n✨ Your MP3 files are ready to use!');
    } else {
      throw new Error('No tracks found in Spotify playlist/album');
    }
  } catch (error) {
    console.error('\n❌ SPOTIFY PLAYLIST DOWNLOAD FAILED');
    console.error('='.repeat(50));
    console.error(`Error: ${error.message}`);
    
    console.log('\n🔧 Troubleshooting tips:');
    console.log('• Check your internet connection');
    console.log('• Verify the Spotify URL is correct and accessible');
    console.log('• Make sure the playlist/album is public');
    console.log('• For private content, set up Spotify API credentials');
    console.log('• Install spotdl: pip install spotdl');
    
    process.exit(1);
  }
}

/**
 * Parse command line arguments and execute appropriate action
 */
function parseArguments() {
  const args = process.argv.slice(2);
  
  // No arguments
  if (args.length === 0) {
    displayUsage();
    process.exit(0);
  }
  
  const firstArg = args[0].toLowerCase();
  
  // Help flag
  if (firstArg === '--help' || firstArg === '-h') {
    displayUsage();
    process.exit(0);
  }
  
  // Dependency check flag
  if (firstArg === '--check-deps') {
    return performDependencyCheck();
  }
  
  // Playlist download flag
  if (firstArg === '--playlist' || firstArg === '-p') {
    if (args.length < 2) {
      console.error('❌ Please provide a playlist URL');
      console.log('\nUsage: node download.js --playlist "<youtube_playlist_url>" [max_videos]');
      console.log('Example: node download.js --playlist "https://www.youtube.com/playlist?list=PLxxxxxxx" 10');
      process.exit(1);
    }
    
    const url = args[1];
    const maxVideos = args[2] ? parseInt(args[2]) : 25;
    
    if (isNaN(maxVideos) || maxVideos < 1 || maxVideos > 100) {
      console.error('❌ Max videos must be a number between 1 and 100');
      process.exit(1);
    }
    
    return downloadPlaylist(url, maxVideos);
  }
  
  // URL argument (single video/track)
  if (args.length === 1) {
    const url = args[0];
    
    // Basic validation that it looks like a URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      console.error('❌ Please provide a valid URL starting with http:// or https://');
      console.log('\nUsage: node download.js "<youtube_or_spotify_url>"');
      console.log('Examples:');
      console.log('  YouTube: node download.js "https://www.youtube.com/watch?v=dQw4w9WgXcQ"');
      console.log('  Spotify: node download.js "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh"');
      process.exit(1);
    }

    // Check if it's a playlist URL and suggest using --playlist
    if (url.includes('playlist') || url.includes('list=') || url.includes('album')) {
      console.log('📋 Detected playlist URL! For playlist downloads, use:');
      console.log(`   node download.js --playlist "${url}"`);
      console.log('\nContinuing with single video/track download...\n');
    }
    
    return downloadAudio(url);
  }
  
  // Too many arguments
  console.error('❌ Too many arguments provided');
  displayUsage();
  process.exit(1);
}

/**
 * Main entry point
 */
async function main() {
  try {
    await parseArguments();
  } catch (error) {
    console.error('\n💥 CRITICAL ERROR');
    console.error('='.repeat(50));
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Handle uncaught exceptions gracefully
process.on('uncaughtException', (error) => {
  console.error('\n💥 UNCAUGHT EXCEPTION');
  console.error('='.repeat(50));
  console.error(`Error: ${error.message}`);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('\n💥 UNHANDLED PROMISE REJECTION');
  console.error('='.repeat(50));
  console.error(`Reason: ${reason}`);
  process.exit(1);
});

// Run the main function
main();
