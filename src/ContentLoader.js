import * as THREE from 'three';
import { parseGIF, decompressFrames } from 'gifuct-js';

// GIF scale ratio - content size relative to canvas, with transparent margins
const GIF_SCALE = 0.45;

export class ContentLoader {
  constructor() {
    this.textureLoader = new THREE.TextureLoader();
    this.currentTexture = null;
    this.isAnimated = false;
    this.gifFrames = [];
    this.currentFrame = 0;
    this.frameDelays = [];     // Frame delay times array
    this.lastFrameTime = 0;
    this.speedMultiplier = 1;  // Playback speed multiplier
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.tempCanvas = null;    // Temp canvas for frame compositing
    this.tempCtx = null;
    // GIF scaling parameters
    this.gifOffsetX = 0;
    this.gifOffsetY = 0;
    this.gifScaledWidth = 0;
    this.gifScaledHeight = 0;
  }

  async loadFromFile(file) {
    const fileType = file.type;
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.gif')) {
      return await this.loadGif(file);
    } else if (fileType.startsWith('image/')) {
      return await this.loadImage(file);
    }

    console.error('Unsupported file type:', fileType);
    return null;
  }

  async loadImage(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      this.textureLoader.load(url, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        this.currentTexture = texture;
        this.isAnimated = false;
        this.gifFrames = [];
        resolve(texture);
      });
    });
  }

  async loadGif(file) {
    try {
      const buffer = await file.arrayBuffer();
      const gif = parseGIF(buffer);
      const frames = decompressFrames(gif, true);

      if (frames.length === 0) {
        console.error('No frames found in GIF');
        return null;
      }

      // Get GIF dimensions
      const gifWidth = gif.lsd.width;
      const gifHeight = gif.lsd.height;

      // Set main canvas size (keep original size, content scaled and centered)
      this.canvas.width = gifWidth;
      this.canvas.height = gifHeight;

      // Calculate scaled dimensions and offset (centered display)
      this.gifScaledWidth = gifWidth * GIF_SCALE;
      this.gifScaledHeight = gifHeight * GIF_SCALE;
      this.gifOffsetX = (gifWidth-this.gifScaledWidth) /1.2;
      this.gifOffsetY = (gifHeight - this.gifScaledHeight)/3;

      // Create temp canvas for frame compositing (original size)
      this.tempCanvas = document.createElement('canvas');
      this.tempCanvas.width = gifWidth;
      this.tempCanvas.height = gifHeight;
      this.tempCtx = this.tempCanvas.getContext('2d');

      // Store frame data and delay times
      this.gifFrames = frames;
      this.frameDelays = frames.map(f => (f.delay || 10) * 10); // delay is in 10ms units
      this.isAnimated = true;
      this.currentFrame = 0;
      this.lastFrameTime = performance.now();

      // Create texture
      this.currentTexture = new THREE.CanvasTexture(this.canvas);
      this.currentTexture.colorSpace = THREE.SRGBColorSpace;

      // Render first frame
      this.renderGifFrame(0);

      return this.currentTexture;
    } catch (error) {
      console.error('Error loading GIF:', error);
      return null;
    }
  }

  renderGifFrame(frameIndex) {
    const frame = this.gifFrames[frameIndex];
    const dims = frame.dims;

    // Clear temp canvas on first frame
    if (frameIndex === 0) {
      this.tempCtx.clearRect(0, 0, this.tempCanvas.width, this.tempCanvas.height);
    }

    // Create ImageData for current frame
    const frameImageData = this.tempCtx.createImageData(dims.width, dims.height);
    frameImageData.data.set(frame.patch);

    // Draw to temp canvas at original position
    this.tempCtx.putImageData(frameImageData, dims.left, dims.top);

    // Clear main canvas (transparent background)
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw scaled content from temp canvas to main canvas center
    this.ctx.drawImage(
      this.tempCanvas,
      0, 0, this.tempCanvas.width, this.tempCanvas.height,  // Source area (entire temp canvas)
      this.gifOffsetX, this.gifOffsetY,                      // Destination position (centered)
      this.gifScaledWidth, this.gifScaledHeight              // Destination size (scaled)
    );

    // Mark texture as needing update
    if (this.currentTexture) {
      this.currentTexture.needsUpdate = true;
    }
  }

  setSpeedMultiplier(multiplier) {
    this.speedMultiplier = multiplier;
  }

  async loadFromUrl(url) {
    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        url,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          this.currentTexture = texture;
          this.isAnimated = false;
          resolve(texture);
        },
        undefined,
        reject
      );
    });
  }

  update() {
    // Skip update if not animated, no frames, or speed is 0
    if (!this.isAnimated || this.gifFrames.length === 0 || this.speedMultiplier === 0) {
      return null;
    }

    const now = performance.now();
    // Adjust frame delay based on speed multiplier (base speed multiplied by 5 for faster default playback)
    const adjustedDelay = this.frameDelays[this.currentFrame] / (this.speedMultiplier * 5);

    if (now - this.lastFrameTime >= adjustedDelay) {
      this.currentFrame = (this.currentFrame + 1) % this.gifFrames.length;
      this.lastFrameTime = now;

      // Render the new frame
      this.renderGifFrame(this.currentFrame);

      return this.currentTexture;
    }

    return null;
  }

  getCurrentTexture() {
    return this.currentTexture;
  }

  /**
   * Get total duration of GIF animation in milliseconds
   * Used for time-based video export
   * Adjusted for actual playback speed (base speed * 5)
   */
  getAnimationDuration() {
    if (!this.isAnimated || this.frameDelays.length === 0) {
      return 0;
    }
    // Sum all frame delays, then divide by actual speed multiplier
    const totalDelay = this.frameDelays.reduce((sum, delay) => sum + delay, 0);
    return totalDelay / (this.speedMultiplier * 5);
  }
}
