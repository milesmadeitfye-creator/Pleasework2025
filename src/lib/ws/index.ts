/**
 * WebSocket Safety Layer - Unified Exports
 *
 * All WebSocket creation should go through these utilities
 * to ensure:
 * - No crashes from WebSocket failures
 * - Graceful degradation
 * - Automatic retry with backoff
 * - Visibility/online state awareness
 * - No browser-specific hacks
 */

export { SafeWebSocket } from './SafeWebSocket';
export type { SafeWebSocketClient, SafeWebSocketOptions, ConnectionState } from './SafeWebSocket';

export { FallbackTransport } from './FallbackTransport';
export type { FallbackTransportOptions } from './FallbackTransport';

// Re-export legacy safe functions for backward compatibility
// These now use the new SafeWebSocket internally
export * from '../safeWebSocket';
export * from '../wsSafe';
