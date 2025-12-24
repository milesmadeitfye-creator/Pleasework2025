/**
 * FallbackTransport - Generic Polling Fallback
 *
 * Provides a simple polling mechanism when WebSockets are unavailable.
 * Not feature-specific - accepts a generic fetcher function.
 */

interface FallbackTransportOptions {
  intervalMs: number;
  fetcher: () => Promise<any>;
  onData: (data: any) => void;
  onError?: (error: Error) => void;
}

class FallbackTransportImpl {
  private timer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private isFetching = false;

  constructor(private options: FallbackTransportOptions) {}

  start() {
    if (this.isRunning) {
      console.warn('[FallbackTransport] Already running');
      return;
    }

    this.isRunning = true;
    this.poll();

    this.timer = setInterval(() => {
      this.poll();
    }, this.options.intervalMs);
  }

  private async poll() {
    if (this.isFetching) {
      return;
    }

    this.isFetching = true;

    try {
      const data = await this.options.fetcher();

      try {
        this.options.onData(data);
      } catch (err) {
        console.warn('[FallbackTransport] onData threw:', err);
      }
    } catch (err: any) {
      try {
        this.options.onError?.(err);
      } catch (callbackErr) {
        console.warn('[FallbackTransport] onError threw:', callbackErr);
      }
    } finally {
      this.isFetching = false;
    }
  }

  stop() {
    this.isRunning = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

export const FallbackTransport = {
  /**
   * Start polling with a fetcher function
   * Returns a transport instance that can be stopped
   */
  startPolling(options: FallbackTransportOptions): FallbackTransportImpl {
    const transport = new FallbackTransportImpl(options);
    transport.start();
    return transport;
  }
};

export type { FallbackTransportOptions };
