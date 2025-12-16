import * as THREE from 'three';

export class ContentLoader {
  constructor() {
    this.textureLoader = new THREE.TextureLoader();
    this.currentTexture = null;
    this.isAnimated = false;
    this.gifFrames = [];
    this.currentFrame = 0;
    this.frameDelay = 100; // ms
    this.lastFrameTime = 0;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
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
    // For GIF support, we'll use a simple frame extraction approach
    // For production, consider using gifuct-js or similar library
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        // For now, treat GIF as static image
        // Full GIF animation would require a GIF parsing library
        this.canvas.width = img.width;
        this.canvas.height = img.height;
        this.ctx.drawImage(img, 0, 0);

        const texture = new THREE.CanvasTexture(this.canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        this.currentTexture = texture;
        this.isAnimated = false; // Set to true when GIF parsing is implemented

        resolve(texture);
      };

      img.src = url;
    });
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
    if (!this.isAnimated || this.gifFrames.length === 0) {
      return null;
    }

    const now = performance.now();
    if (now - this.lastFrameTime >= this.frameDelay) {
      this.currentFrame = (this.currentFrame + 1) % this.gifFrames.length;
      this.lastFrameTime = now;

      // Update canvas with current frame
      const frame = this.gifFrames[this.currentFrame];
      this.ctx.putImageData(frame.imageData, 0, 0);
      this.currentTexture.needsUpdate = true;

      return this.currentTexture;
    }

    return null;
  }

  getCurrentTexture() {
    return this.currentTexture;
  }
}
