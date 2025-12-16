/**
 * RecordingManager - WebM video export for sphere animation
 * Records one complete rotation cycle using MediaRecorder API
 * Composites background image with WebGL canvas
 */
export class RecordingManager {
  constructor(canvas, sphereScene, backgroundManager) {
    this.canvas = canvas;
    this.sphereScene = sphereScene;
    this.backgroundManager = backgroundManager;
    this.mediaRecorder = null;
    this.chunks = [];
    this.isRecording = false;
    this.startRotation = 0;

    // Compositing canvas for combining background + WebGL
    this.compositeCanvas = null;
    this.compositeCtx = null;
    this.backgroundImage = null;
    this.animationFrameId = null;

    // Time-based recording for animated content (GIF)
    this.isTimeBasedRecording = false;
    this.recordingDuration = 0;    // Duration in ms
    this.recordingStartTime = 0;

    // Callbacks for UI updates
    this.onProgress = null;
    this.onComplete = null;
    this.onError = null;
  }

  /**
   * Check if recording is possible
   * Returns mode: 'time_based' for animated content, 'rotation_based' for static
   */
  canRecord() {
    // Check MediaRecorder support first
    if (!window.MediaRecorder) {
      return { ok: false, reason: 'not_supported' };
    }

    // For animated content (GIF), use time-based recording
    if (this.sphereScene.isAnimatedContent) {
      return { ok: true, mode: 'time_based' };
    }

    // For static content, need rotation to be active
    if (Math.abs(this.sphereScene.rotationSpeed) < 0.0001) {
      return { ok: false, reason: 'rotation_stopped' };
    }

    return { ok: true, mode: 'rotation_based' };
  }

  /**
   * Load background image for compositing
   */
  async loadBackgroundImage() {
    return new Promise((resolve, reject) => {
      const bgUrl = this.backgroundManager.currentBackground;
      if (!bgUrl) {
        resolve(null);
        return;
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.backgroundImage = img;
        resolve(img);
      };
      img.onerror = () => {
        console.warn('Failed to load background image for recording');
        resolve(null);
      };
      img.src = bgUrl;
    });
  }

  /**
   * Setup composite canvas for recording
   */
  setupCompositeCanvas() {
    const container = this.canvas.parentElement;
    const width = container.clientWidth;
    const height = container.clientHeight;

    this.compositeCanvas = document.createElement('canvas');
    this.compositeCanvas.width = width;
    this.compositeCanvas.height = height;
    this.compositeCtx = this.compositeCanvas.getContext('2d');
  }

  /**
   * Draw background image with 'contain' sizing (matching CSS)
   */
  drawBackground() {
    const ctx = this.compositeCtx;
    const canvas = this.compositeCanvas;

    // Clear with black
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!this.backgroundImage) return;

    const img = this.backgroundImage;
    const imgAspect = img.width / img.height;
    const canvasAspect = canvas.width / canvas.height;

    let drawWidth, drawHeight, offsetX, offsetY;

    // Mimic background-size: contain
    if (canvasAspect > imgAspect) {
      // Canvas is wider - fit to height
      drawHeight = canvas.height;
      drawWidth = drawHeight * imgAspect;
      offsetX = (canvas.width - drawWidth) / 2;
      offsetY = 0;
    } else {
      // Canvas is taller - fit to width
      drawWidth = canvas.width;
      drawHeight = drawWidth / imgAspect;
      offsetX = 0;
      offsetY = (canvas.height - drawHeight) / 2;
    }

    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
  }

  /**
   * Composite one frame: background + WebGL canvas
   */
  compositeFrame() {
    // Draw background first
    this.drawBackground();

    // Force render WebGL scene to ensure canvas has content
    // (WebGL clears buffer after each frame by default)
    this.sphereScene.render();

    // Draw WebGL canvas on top
    this.compositeCtx.drawImage(this.canvas, 0, 0);
  }

  /**
   * Animation loop for compositing during recording
   */
  compositeLoop() {
    if (!this.isRecording) return;

    this.compositeFrame();
    this.animationFrameId = requestAnimationFrame(() => this.compositeLoop());
  }

  /**
   * Start recording
   * For rotation-based: records one complete rotation cycle
   * For time-based (GIF): records for specified duration
   * @param {number} duration - Duration in ms for time-based recording (default: 5000ms)
   */
  async startRecording(duration = 5000) {
    const check = this.canRecord();
    if (!check.ok) {
      if (this.onError) {
        this.onError(check.reason);
      }
      return false;
    }

    // Load background image
    await this.loadBackgroundImage();

    // Setup composite canvas
    this.setupCompositeCanvas();

    // Reset state
    this.chunks = [];

    // Set recording mode based on content type
    if (check.mode === 'time_based') {
      this.isTimeBasedRecording = true;
      this.recordingDuration = duration;
      this.recordingStartTime = performance.now();
    } else {
      this.isTimeBasedRecording = false;
      this.startRotation = this.sphereScene.textureRotation;
    }

    try {
      this.isRecording = true;

      // Draw first frame BEFORE creating stream to ensure complete initial frame
      this.compositeFrame();

      // Capture composite canvas stream at 60fps
      const stream = this.compositeCanvas.captureStream(60);

      // Find supported mime type
      const mimeType = this.getSupportedMimeType();

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType,
        videoBitsPerSecond: 8000000 // 8 Mbps for good quality
      });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.chunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.exportVideo();
      };

      this.mediaRecorder.onerror = (e) => {
        console.error('MediaRecorder error:', e);
        this.cleanup();
        if (this.onError) {
          this.onError('recording_error');
        }
      };

      // Start recording
      this.mediaRecorder.start(100); // Collect data every 100ms

      // Start compositing loop AFTER MediaRecorder is ready
      this.compositeLoop();

      return true;
    } catch (err) {
      console.error('Failed to start recording:', err);
      this.cleanup();
      if (this.onError) {
        this.onError('start_failed');
      }
      return false;
    }
  }

  /**
   * Get supported mime type for MediaRecorder
   */
  getSupportedMimeType() {
    const types = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4'
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return 'video/webm';
  }

  /**
   * Check recording progress
   * For rotation-based: checks if one complete rotation cycle is done
   * For time-based (GIF): checks if recording duration has elapsed
   * Call this in animation loop
   * @returns {number} Progress 0-1, or -1 if not recording
   */
  checkProgress() {
    if (!this.isRecording) {
      return -1;
    }

    let progress;

    if (this.isTimeBasedRecording) {
      // Time-based progress for animated content (GIF)
      const elapsed = performance.now() - this.recordingStartTime;
      progress = Math.min(elapsed / this.recordingDuration, 1);

      // Check if duration complete
      if (elapsed >= this.recordingDuration) {
        this.stopRecording();
      }
    } else {
      // Rotation-based progress for static content
      const currentRotation = this.sphereScene.textureRotation;
      const rotationDelta = Math.abs(currentRotation - this.startRotation);
      progress = Math.min(rotationDelta / (Math.PI * 2), 1);

      // Check if complete cycle
      if (rotationDelta >= Math.PI * 2) {
        this.stopRecording();
      }
    }

    if (this.onProgress) {
      this.onProgress(progress);
    }

    return progress;
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.isRecording = false;

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.compositeCanvas = null;
    this.compositeCtx = null;
  }

  /**
   * Stop recording
   */
  stopRecording() {
    if (!this.isRecording || !this.mediaRecorder) {
      return;
    }

    this.cleanup();

    if (this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  /**
   * Export recorded video as download
   */
  exportVideo() {
    if (this.chunks.length === 0) {
      console.warn('No recorded data to export');
      return;
    }

    const blob = new Blob(this.chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);

    // Create download link
    const a = document.createElement('a');
    a.href = url;
    a.download = `sphere-export-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Cleanup
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);

    if (this.onComplete) {
      this.onComplete();
    }
  }

  /**
   * Cancel recording without exporting
   */
  cancelRecording() {
    this.cleanup();
    this.chunks = [];

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;
  }
}
