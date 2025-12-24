/**
 * SafeWebSocket - Global WebSocket Safety Layer
 *
 * Requirements:
 * - Never throws errors
 * - Retry with exponential backoff
 * - Connection timeout
 * - Visibility/online state awareness
 * - No browser-specific logic (uses platform capabilities only)
 * - Graceful degradation
 */

type ConnectionState = 'idle' | 'connecting' | 'open' | 'closed' | 'failed';

interface SafeWebSocketOptions {
  protocols?: string | string[];
  maxRetries?: number;
  initialRetryDelay?: number;
  maxRetryDelay?: number;
  connectionTimeout?: number;
  onOpen?: () => void;
  onMessage?: (event: MessageEvent) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
  onStateChange?: (state: ConnectionState) => void;
}

interface SafeWebSocketClient {
  send: (data: string | ArrayBufferLike | Blob | ArrayBufferView) => void;
  close: () => void;
  getState: () => ConnectionState;
  getLastError: () => string | null;
}

class SafeWebSocketImpl implements SafeWebSocketClient {
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'idle';
  private lastError: string | null = null;
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private isManualClose = false;
  private visibilityHandler: (() => void) | null = null;
  private onlineHandler: (() => void) | null = null;
  private offlineHandler: (() => void) | null = null;

  constructor(
    private url: string,
    private options: SafeWebSocketOptions = {}
  ) {
    this.setupVisibilityListeners();
    this.setupOnlineListeners();
    this.connect();
  }

  private setState(newState: ConnectionState) {
    if (this.state !== newState) {
      this.state = newState;
      try {
        this.options.onStateChange?.(newState);
      } catch (err) {
        console.warn('[SafeWebSocket] onStateChange threw:', err);
      }
    }
  }

  private setError(message: string) {
    this.lastError = message;
    console.warn('[SafeWebSocket]', message);
  }

  private setupVisibilityListeners() {
    if (typeof document === 'undefined') return;

    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        if (this.state === 'failed' || this.state === 'closed') {
          this.retryConnect();
        }
      } else {
        this.clearRetryTimer();
      }
    };

    try {
      document.addEventListener('visibilitychange', this.visibilityHandler);
    } catch (err) {
      console.warn('[SafeWebSocket] Failed to add visibility listener:', err);
    }
  }

  private setupOnlineListeners() {
    if (typeof window === 'undefined') return;

    this.onlineHandler = () => {
      if (this.state === 'failed' || this.state === 'closed') {
        this.retryConnect();
      }
    };

    this.offlineHandler = () => {
      this.clearRetryTimer();
      if (this.ws) {
        try {
          this.ws.close();
        } catch (err) {
          console.warn('[SafeWebSocket] Close during offline failed:', err);
        }
      }
    };

    try {
      window.addEventListener('online', this.onlineHandler);
      window.addEventListener('offline', this.offlineHandler);
    } catch (err) {
      console.warn('[SafeWebSocket] Failed to add online/offline listeners:', err);
    }
  }

  private shouldAttemptConnection(): boolean {
    if (typeof window === 'undefined') return true;

    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return false;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return false;
    }

    return true;
  }

  private connect() {
    if (!this.shouldAttemptConnection()) {
      this.setError('Connection paused (app backgrounded or offline)');
      this.setState('idle');
      return;
    }

    this.clearTimeoutTimer();
    this.setState('connecting');

    try {
      const maxRetries = this.options.maxRetries ?? 5;
      if (this.retryCount >= maxRetries) {
        this.setError(`Max retries (${maxRetries}) exceeded`);
        this.setState('failed');
        return;
      }

      const safeUrl = this.makeSecureUrl(this.url);
      this.ws = new WebSocket(safeUrl, this.options.protocols);

      this.timeoutTimer = setTimeout(() => {
        if (this.state === 'connecting') {
          this.setError('Connection timeout');
          this.setState('failed');
          try {
            this.ws?.close();
          } catch (err) {
            console.warn('[SafeWebSocket] Close after timeout failed:', err);
          }
          this.retryConnect();
        }
      }, this.options.connectionTimeout ?? 10000);

      this.ws.onopen = () => {
        this.clearTimeoutTimer();
        this.retryCount = 0;
        this.lastError = null;
        this.setState('open');
        try {
          this.options.onOpen?.();
        } catch (err) {
          console.warn('[SafeWebSocket] onOpen threw:', err);
        }
      };

      this.ws.onmessage = (event) => {
        try {
          this.options.onMessage?.(event);
        } catch (err) {
          console.warn('[SafeWebSocket] onMessage threw:', err);
        }
      };

      this.ws.onclose = (event) => {
        this.clearTimeoutTimer();
        this.setState(this.isManualClose ? 'closed' : 'failed');

        try {
          this.options.onClose?.(event);
        } catch (err) {
          console.warn('[SafeWebSocket] onClose threw:', err);
        }

        if (!this.isManualClose) {
          this.retryConnect();
        }
      };

      this.ws.onerror = (event) => {
        this.clearTimeoutTimer();
        this.setError('WebSocket error event');

        try {
          this.options.onError?.(event);
        } catch (err) {
          console.warn('[SafeWebSocket] onError threw:', err);
        }
      };

    } catch (err: any) {
      this.clearTimeoutTimer();
      this.setError(`Failed to create WebSocket: ${err?.message || 'Unknown error'}`);
      this.setState('failed');
      this.retryConnect();
    }
  }

  private makeSecureUrl(url: string): string {
    if (typeof window === 'undefined') return url;

    const isPageHttps = window.location.protocol === 'https:';

    if (url.startsWith('ws://') && isPageHttps) {
      return url.replace(/^ws:\/\//, 'wss://');
    }

    if (url.startsWith('http://')) {
      return url.replace(/^http:\/\//, isPageHttps ? 'wss://' : 'ws://');
    }

    if (url.startsWith('https://')) {
      return url.replace(/^https:\/\//, 'wss://');
    }

    if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
      const protocol = isPageHttps ? 'wss://' : 'ws://';
      return protocol + url.replace(/^\/+/, '');
    }

    return url;
  }

  private retryConnect() {
    if (this.isManualClose) return;

    this.clearRetryTimer();

    const initialDelay = this.options.initialRetryDelay ?? 1000;
    const maxDelay = this.options.maxRetryDelay ?? 30000;
    const delay = Math.min(initialDelay * Math.pow(2, this.retryCount), maxDelay);

    const jitter = Math.random() * 1000;
    const finalDelay = delay + jitter;

    this.retryTimer = setTimeout(() => {
      this.retryCount++;
      this.connect();
    }, finalDelay);
  }

  private clearRetryTimer() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private clearTimeoutTimer() {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  private cleanup() {
    this.clearRetryTimer();
    this.clearTimeoutTimer();

    if (this.visibilityHandler && typeof document !== 'undefined') {
      try {
        document.removeEventListener('visibilitychange', this.visibilityHandler);
      } catch (err) {
        console.warn('[SafeWebSocket] Failed to remove visibility listener:', err);
      }
      this.visibilityHandler = null;
    }

    if (typeof window !== 'undefined') {
      if (this.onlineHandler) {
        try {
          window.removeEventListener('online', this.onlineHandler);
        } catch (err) {
          console.warn('[SafeWebSocket] Failed to remove online listener:', err);
        }
        this.onlineHandler = null;
      }

      if (this.offlineHandler) {
        try {
          window.removeEventListener('offline', this.offlineHandler);
        } catch (err) {
          console.warn('[SafeWebSocket] Failed to remove offline listener:', err);
        }
        this.offlineHandler = null;
      }
    }
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    if (!this.ws || this.state !== 'open') {
      console.warn('[SafeWebSocket] Cannot send - not connected');
      return;
    }

    try {
      this.ws.send(data);
    } catch (err: any) {
      this.setError(`Send failed: ${err?.message || 'Unknown error'}`);
    }
  }

  close() {
    this.isManualClose = true;
    this.clearRetryTimer();
    this.clearTimeoutTimer();
    this.cleanup();

    if (this.ws) {
      try {
        this.ws.close();
      } catch (err) {
        console.warn('[SafeWebSocket] Close failed:', err);
      }
      this.ws = null;
    }

    this.setState('closed');
  }

  getState(): ConnectionState {
    return this.state;
  }

  getLastError(): string | null {
    return this.lastError;
  }
}

export const SafeWebSocket = {
  /**
   * Check if WebSocket API is supported
   */
  isSupported(): boolean {
    if (typeof globalThis === 'undefined') return false;
    return typeof (globalThis as any).WebSocket !== 'undefined';
  },

  /**
   * Check if we should attempt WebSocket connections
   * Uses platform security check (no browser-specific logic)
   */
  canAttempt(): boolean {
    if (!SafeWebSocket.isSupported()) {
      return false;
    }

    if (typeof globalThis !== 'undefined') {
      const isSecure = (globalThis as any).isSecureContext;
      if (isSecure === false) {
        return false;
      }
    }

    return true;
  },

  /**
   * Connect to a WebSocket
   * Never throws - all errors are handled internally
   */
  connect(
    url: string,
    protocols?: string | string[],
    options?: Omit<SafeWebSocketOptions, 'protocols'>
  ): SafeWebSocketClient {
    return new SafeWebSocketImpl(url, { ...options, protocols });
  }
};

export type { SafeWebSocketClient, SafeWebSocketOptions, ConnectionState };
