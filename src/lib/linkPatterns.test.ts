import { patterns, detectPlatform, isCanonical } from './linkPatterns';

// Simple test assertions
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Test Spotify patterns
assert(
  patterns.spotify.test('https://open.spotify.com/track/1234567890abc'),
  'Spotify basic URL should match'
);
assert(
  patterns.spotify.test('https://open.spotify.com/track/1234567890abc?si=xyz'),
  'Spotify URL with query params should match'
);
assert(
  !patterns.spotify.test('https://open.spotify.com/album/1234567890abc'),
  'Spotify album URL should not match track pattern'
);

// Test Apple Music patterns
assert(
  patterns.apple.test('https://music.apple.com/us/album/song-name/123456?i=789'),
  'Apple Music track URL should match'
);
assert(
  patterns.apple.test('https://music.apple.com/gb/song/song-name/123456'),
  'Apple Music song URL should match'
);
assert(
  !patterns.apple.test('https://music.apple.com/playlist/123456'),
  'Apple Music playlist should not match'
);

// Test Tidal patterns
assert(
  patterns.tidal.test('https://tidal.com/browse/track/123456'),
  'Tidal track URL should match'
);
assert(
  patterns.tidal.test('https://www.tidal.com/browse/track/123456'),
  'Tidal track URL with www should match'
);
assert(
  !patterns.tidal.test('https://tidal.com/browse/album/123456'),
  'Tidal album URL should not match track pattern'
);

// Test YouTube Music patterns
assert(
  patterns.ytmusic.test('https://music.youtube.com/watch?v=dQw4w9WgXcQ'),
  'YouTube Music track URL should match'
);
assert(
  patterns.ytmusic.test('https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=xyz'),
  'YouTube Music URL with playlist should match'
);
assert(
  !patterns.ytmusic.test('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
  'Regular YouTube URL should not match YT Music pattern'
);

// Test SoundCloud patterns
assert(
  patterns.soundcloud.test('https://soundcloud.com/artist/song-name'),
  'SoundCloud track URL should match'
);
assert(
  patterns.soundcloud.test('https://www.soundcloud.com/artist/song-name'),
  'SoundCloud URL with www should match'
);
assert(
  !patterns.soundcloud.test('https://soundcloud.com/artist'),
  'SoundCloud artist page should not match'
);

// Test detectPlatform
assert(
  detectPlatform('https://open.spotify.com/track/abc123') === 'spotify',
  'Should detect Spotify platform'
);
assert(
  detectPlatform('https://music.apple.com/us/song/test/123') === 'apple',
  'Should detect Apple Music platform'
);
assert(
  detectPlatform('https://invalid.com/track/123') === null,
  'Should return null for invalid URL'
);

// Test isCanonical
assert(
  isCanonical('https://open.spotify.com/track/abc123'),
  'Valid Spotify URL should be canonical'
);
assert(
  !isCanonical('https://open.spotify.com/album/abc123'),
  'Spotify album URL should not be canonical'
);
assert(
  !isCanonical('https://invalid.com/track/123'),
  'Invalid URL should not be canonical'
);

console.log('All linkPatterns tests passed!');
