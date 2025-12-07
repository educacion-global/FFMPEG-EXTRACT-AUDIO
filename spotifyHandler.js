import { exec } from 'child_process';
import { promisify } from 'util';
import { parseSpotifyURL } from './utils.js';
import { ValidationError, ProcessingError } from './errorHandler.js';

const execAsync = promisify(exec);

/**
 * Spotify integration handler
 * Supports both API-based and tool-based approaches
 */
export class SpotifyHandler {
  constructor(options = {}) {
    this.clientId = options.clientId || process.env.SPOTIFY_CLIENT_ID;
    this.clientSecret = options.clientSecret || process.env.SPOTIFY_CLIENT_SECRET;
    this.useSpotdl = options.useSpotdl !== false; // Default to true
    this.searchRetries = options.searchRetries || 3;
    this.matchThreshold = options.matchThreshold || 0.8;
  }

  /**
   * Extract track information from a Spotify URL
   * @param {string} spotifyUrl - The Spotify URL
   * @returns {Promise<Object>} - Track information or tracks array for playlists
   */
  async extractTrackInfo(spotifyUrl) {
    const { type, id } = parseSpotifyURL(spotifyUrl);

    console.log(`Processing Spotify ${type}: ${id}`);

    try {
      // Try API approach first if credentials are available
      if (this.clientId && this.clientSecret) {
        console.log('Using Spotify API approach...');
        return await this.extractWithAPI(type, id);
      }
      
      // For now, create a basic track entry and rely on YouTube search
      // This is a simplified approach until we implement proper spotdl integration
      console.log('Using simplified approach - will search YouTube directly...');
      return await this.extractBasicInfo(type, id);
      
    } catch (error) {
      console.error('Spotify extraction failed:', error.message);
      throw new ProcessingError(`Failed to extract Spotify content: ${error.message}`);
    }
  }

  /**
   * Extract basic info for tracks without full API access
   */
  async extractBasicInfo(type, id) {
    // This is a basic implementation
    // In a real scenario, we'd either use spotdl properly or require API keys
    if (type === 'track') {
      return {
        tracks: [{
          title: 'Spotify Track',
          artist: 'Unknown Artist',
          album: 'Unknown Album',
          duration: null,
          year: null,
          track_number: null,
          spotify_id: id
        }]
      };
    } else if (type === 'playlist' || type === 'album') {
      // For demo purposes, return a single track
      // In practice, this would extract the full playlist
      return {
        name: `Spotify ${type}`,
        tracks: [{
          title: 'Spotify Track 1',
          artist: 'Unknown Artist',
          album: 'Unknown Album',
          duration: null,
          year: null,
          track_number: 1,
          spotify_id: id + '_1'
        }]
      };
    }
    
    throw new ProcessingError(`Unsupported Spotify content type: ${type}`);
  }

  /**
   * Extract using Spotify Web API (requires credentials)
   */
  async extractWithAPI(type, id) {
    try {
      // Import spotify-web-api-node dynamically
      const SpotifyWebApi = (await import('spotify-web-api-node')).default;
      
      const spotifyApi = new SpotifyWebApi({
        clientId: this.clientId,
        clientSecret: this.clientSecret
      });

      // Get access token
      const data = await spotifyApi.clientCredentialsGrant();
      spotifyApi.setAccessToken(data.body.access_token);

      switch (type) {
        case 'track':
          return await this.getTrackAPI(spotifyApi, id);
        case 'playlist':
          return await this.getPlaylistAPI(spotifyApi, id);
        case 'album':
          return await this.getAlbumAPI(spotifyApi, id);
        case 'artist':
          return await this.getArtistTopTracksAPI(spotifyApi, id);
        default:
          throw new ValidationError(`Unsupported Spotify content type: ${type}`);
      }
    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND') {
        throw new ProcessingError(
          'spotify-web-api-node not installed. Run: npm install spotify-web-api-node'
        );
      }
      throw error;
    }
  }

  /**
   * Extract using spotdl tool
   */
  async extractWithSpotdl(spotifyUrl) {
    try {
      // Check if spotdl is available
      await execAsync('spotdl --help');
    } catch (error) {
      throw new ProcessingError(
        'spotdl not found. Install with: pipx install spotdl'
      );
    }

    try {
      console.log('Extracting metadata with spotdl...');
      
      // Use spotdl to download and then extract info
      // First, let's just try to get the track info by attempting a dry run
      const tempDir = '/tmp/spotdl_test';
      
      // Use spotdl with a simple download to get metadata
      const { stdout, stderr } = await execAsync(
        `spotdl "${spotifyUrl}" --output "${tempDir}" --output-format mp3`,
        { timeout: 60000 }
      );

      console.log('spotdl stdout:', stdout);
      if (stderr) console.warn('spotdl stderr:', stderr);

      // For now, let's extract basic info from the URL and use the Spotify Web API if available
      // This is a simplified version - in practice, we'd parse spotdl output or use the Web API
      const { type, id } = parseSpotifyURL(spotifyUrl);
      
      // Return a basic track structure - we'll improve this with actual metadata extraction
      const tracks = [{
        title: 'Unknown Track',
        artist: 'Unknown Artist',
        album: 'Unknown Album',
        duration: null,
        year: null,
        track_number: null,
        spotify_id: id
      }];

      return { tracks };
    } catch (error) {
      // If spotdl fails, try to use the API method if available
      if (this.clientId && this.clientSecret) {
        console.log('spotdl failed, trying API approach...');
        const { type, id } = parseSpotifyURL(spotifyUrl);
        return await this.extractWithAPI(type, id);
      }
      
      throw new ProcessingError(`Spotify extraction failed: ${error.message}`);
    }
  }

  /**
   * Get single track info using API
   */
  async getTrackAPI(spotifyApi, trackId) {
    const track = await spotifyApi.getTrack(trackId);
    const trackData = track.body;

    return {
      tracks: [{
        title: trackData.name,
        artist: trackData.artists[0].name,
        album: trackData.album.name,
        duration: Math.floor(trackData.duration_ms / 1000),
        year: new Date(trackData.album.release_date).getFullYear(),
        track_number: trackData.track_number,
        spotify_id: trackData.id
      }]
    };
  }

  /**
   * Get playlist tracks using API
   */
  async getPlaylistAPI(spotifyApi, playlistId) {
    const playlist = await spotifyApi.getPlaylist(playlistId);
    const tracks = [];

    let offset = 0;
    const limit = 100;

    while (true) {
      const playlistTracks = await spotifyApi.getPlaylistTracks(playlistId, {
        offset,
        limit,
        fields: 'items(track(name,artists,album,duration_ms,track_number,id)),next'
      });

      for (const item of playlistTracks.body.items) {
        if (item.track && item.track.id) {
          tracks.push({
            title: item.track.name,
            artist: item.track.artists[0].name,
            album: item.track.album.name,
            duration: Math.floor(item.track.duration_ms / 1000),
            year: new Date(item.track.album.release_date).getFullYear(),
            track_number: item.track.track_number,
            spotify_id: item.track.id
          });
        }
      }

      if (!playlistTracks.body.next) break;
      offset += limit;
    }

    return {
      name: playlist.body.name,
      tracks
    };
  }

  /**
   * Get album tracks using API
   */
  async getAlbumAPI(spotifyApi, albumId) {
    const album = await spotifyApi.getAlbum(albumId);
    const tracks = [];

    for (const track of album.body.tracks.items) {
      tracks.push({
        title: track.name,
        artist: track.artists[0].name,
        album: album.body.name,
        duration: Math.floor(track.duration_ms / 1000),
        year: new Date(album.body.release_date).getFullYear(),
        track_number: track.track_number,
        spotify_id: track.id
      });
    }

    return {
      name: album.body.name,
      tracks
    };
  }

  /**
   * Get artist top tracks using API
   */
  async getArtistTopTracksAPI(spotifyApi, artistId) {
    const topTracks = await spotifyApi.getArtistTopTracks(artistId, 'US');
    const tracks = [];

    for (const track of topTracks.body.tracks) {
      tracks.push({
        title: track.name,
        artist: track.artists[0].name,
        album: track.album.name,
        duration: Math.floor(track.duration_ms / 1000),
        year: new Date(track.album.release_date).getFullYear(),
        track_number: track.track_number,
        spotify_id: track.id
      });
    }

    return {
      name: `Top tracks by ${topTracks.body.tracks[0]?.artists[0]?.name}`,
      tracks
    };
  }

  /**
   * Search for a track on YouTube
   * @param {Object} track - Track metadata
   * @returns {Promise<string>} - YouTube URL
   */
  async searchYouTube(track) {
    const { searchYoutube } = await import('./youtubeSearch.js');
    
    // Try different search combinations
    const searchQueries = [
      `"${track.artist}" "${track.title}"`,
      `${track.artist} ${track.title} ${track.album}`,
      `${track.artist} ${track.title}`,
      `${track.title} ${track.artist}`
    ];

    for (const query of searchQueries) {
      try {
        console.log(`Searching YouTube for: ${query}`);
        const youtubeUrl = await searchYoutube(query);
        
        if (youtubeUrl) {
          console.log(`Found YouTube match: ${youtubeUrl}`);
          return youtubeUrl;
        }
      } catch (error) {
        console.warn(`Search failed for query "${query}":`, error.message);
      }
    }

    throw new ProcessingError(
      `Could not find "${track.title}" by ${track.artist} on YouTube`
    );
  }
}

export default SpotifyHandler;
