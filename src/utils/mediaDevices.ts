export type RequestMediaResult =
  | { ok: true; stream: MediaStream }
  | {
      ok: false;
      code:
        | 'unsupported'
        | 'insecure-context'
        | 'permission-denied'
        | 'no-devices'
        | 'hardware-error'
        | 'unknown';
      message: string;
    };

export async function requestCameraAndMic(
  options: { video?: boolean; audio?: boolean } = { video: true, audio: true }
): Promise<RequestMediaResult> {
  if (typeof window === 'undefined') {
    return {
      ok: false,
      code: 'unsupported',
      message: 'Camera and microphone are not available in this environment.',
    };
  }

  const isSecure =
    window.location.protocol === 'https:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  if (!isSecure) {
    return {
      ok: false,
      code: 'insecure-context',
      message:
        'Camera and microphone only work over a secure connection. Please use https://ghoste.one.',
    };
  }

  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices || !mediaDevices.getUserMedia) {
    return {
      ok: false,
      code: 'unsupported',
      message:
        'Camera and microphone are not supported by this browser. On iPhone, please open this page in Safari.',
    };
  }

  try {
    const stream = await mediaDevices.getUserMedia({
      video: options.video !== false,
      audio: options.audio !== false,
    });
    return { ok: true, stream };
  } catch (err: any) {
    const name = err?.name || '';
    const message = err?.message || '';

    console.error('[mediaDevices] getUserMedia error:', { name, message, err });

    if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
      return {
        ok: false,
        code: 'permission-denied',
        message:
          'Camera and microphone access were blocked. Please allow access in your browser settings and try again. On iPhone, make sure Safari has permission for camera and mic in Settings > Safari > Camera & Microphone.',
      };
    }

    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return {
        ok: false,
        code: 'no-devices',
        message:
          'No camera or microphone was found. Please connect a device and try again.',
      };
    }

    if (name === 'OverconstrainedError') {
      return {
        ok: false,
        code: 'no-devices',
        message:
          'The requested camera or microphone settings could not be satisfied. Try enabling only microphone or only camera.',
      };
    }

    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return {
        ok: false,
        code: 'hardware-error',
        message:
          'Your camera or microphone is currently in use by another app. Close other apps using your camera/mic and try again.',
      };
    }

    if (message.includes('not allowed') || message.includes('user denied') || message.includes('permission')) {
      return {
        ok: false,
        code: 'permission-denied',
        message:
          'Camera and microphone permissions were denied. Please check your browser settings and allow camera/microphone access for Ghoste One.',
      };
    }

    console.error('[mediaDevices] Unknown getUserMedia error:', err);
    return {
      ok: false,
      code: 'unknown',
      message:
        'We could not start your camera and microphone. Please refresh the page and try again. If this continues, try using Safari on iPhone or Chrome on desktop.',
    };
  }
}
