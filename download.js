#!/usr/bin/env node

import { extractAudio, checkDependencies, getVideoInfo } from './audioExtractor.js';
import { validateAndSanitizeYouTubeURL } from './utils.js';

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
  console.log('🎵 FFMPEG-EXTRACT-AUDIO - YouTube to MP3 Converter');
  console.log('A powerful platform to extract audio out of videos for personal use.');
  console.log('');
  console.log('Usage:');
  console.log('  node download.js "<youtube_url>"');
  console.log('');
  console.log('Examples:');
  console.log('  node download.js "https://www.youtube.com/watch?v=dQw4w9WgXcQ"');
  console.log('  node download.js "https://youtu.be/dQw4w9WgXcQ"');
  console.log('');
  console.log('Options:');
  console.log('  --help, -h     Show this help message');
  console.log('  --check-deps   Check if required dependencies are installed');
  console.log('');
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
 * Main download function
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
    
    // Step 2: Validate URL
    console.log('🔍 Step 2: Validating YouTube URL...');
    let cleanURL;
    try {
      cleanURL = validateAndSanitizeYouTubeURL(url);
      console.log('✅ URL is valid\n');
    } catch (error) {
      console.error(`❌ ${error.message}`);
      console.log('Please provide a valid YouTube URL.');
      console.log('Examples:');
      console.log('  • https://www.youtube.com/watch?v=VIDEO_ID');
      console.log('  • https://youtu.be/VIDEO_ID');
      process.exit(1);
    }
    
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
    
  } catch (error) {
    console.error('\n💥 UNEXPECTED ERROR');
    console.error('='.repeat(50));
    console.error(`Error: ${error.message}`);
    console.error('\nIf this error persists, please check:');
    console.error('• Your internet connection');
    console.error('• That yt-dlp and ffmpeg are properly installed');
    console.error('• The YouTube URL is valid and accessible');
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
  
  // URL argument
  if (args.length === 1) {
    const url = args[0];
    
    // Basic validation that it looks like a URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      console.error('❌ Please provide a valid URL starting with http:// or https://');
      console.log('\nUsage: node download.js "<youtube_url>"');
      console.log('Example: node download.js "https://www.youtube.com/watch?v=dQw4w9WgXcQ"');
      process.exit(1);
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
