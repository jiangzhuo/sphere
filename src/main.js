import './styles.css';
import { SphereScene } from './SphereScene.js';
import { BackgroundManager } from './BackgroundManager.js';
import { ContentLoader } from './ContentLoader.js';
import { RecordingManager } from './RecordingManager.js';

class App {
  constructor() {
    this.canvas = document.getElementById('sphere-canvas');
    this.backgroundLayer = document.getElementById('background-layer');

    // Initialize components
    this.backgroundManager = new BackgroundManager(this.backgroundLayer);
    this.sphereScene = new SphereScene(this.canvas);
    this.contentLoader = new ContentLoader();

    // Set default background
    this.backgroundManager.setBackground(import.meta.env.BASE_URL + 'backgrounds/default.png');

    // Initialize recording manager (with backgroundManager for compositing)
    this.recordingManager = new RecordingManager(this.canvas, this.sphereScene, this.backgroundManager);
    this.setupRecordingCallbacks();

    // Setup event listeners
    this.setupEventListeners();

    // Start animation loop
    this.animate();

    console.log('Sphere Simulator initialized');
    console.log('Controls:');
    console.log('  Arrow keys = move sphere');
    console.log('  R/Shift+R = size');
    console.log('  W/S = clip tilt forward/back');
    console.log('  A/D = clip tilt left/right');
    console.log('  Q/E = clip offset (show more/less)');
    console.log('  C = toggle clipping');
    console.log('  P = print config');
  }

  setupRecordingCallbacks() {
    const exportBtn = document.getElementById('export-btn');
    const exportStatus = document.getElementById('export-status');

    this.recordingManager.onProgress = (progress) => {
      const percent = Math.round(progress * 100);
      exportStatus.textContent = `${percent}%`;
    };

    this.recordingManager.onComplete = () => {
      exportBtn.disabled = false;
      exportBtn.textContent = '🎬 Export Video';
      exportStatus.textContent = 'Done!';
      setTimeout(() => {
        exportStatus.textContent = '';
      }, 3000);
    };

    this.recordingManager.onError = (reason) => {
      exportBtn.disabled = false;
      exportBtn.textContent = '🎬 Export Video';
      if (reason === 'rotation_stopped') {
        exportStatus.textContent = 'Enable rotation first';
      } else {
        exportStatus.textContent = 'Export failed';
      }
      setTimeout(() => {
        exportStatus.textContent = '';
      }, 3000);
    };
  }

  setupEventListeners() {
    // Export button handler
    const exportBtn = document.getElementById('export-btn');
    const exportStatus = document.getElementById('export-status');

    exportBtn.addEventListener('click', async () => {
      if (this.recordingManager.isRecording) {
        return;
      }

      exportBtn.disabled = true;
      exportBtn.textContent = 'Preparing...';
      exportStatus.textContent = '';

      // For GIF, pass animation duration; for static content, duration is ignored
      let duration = 5000; // Default 5s fallback
      if (this.contentLoader.isAnimated) {
        duration = this.contentLoader.getAnimationDuration();
      }

      const started = await this.recordingManager.startRecording(duration);
      if (started) {
        exportBtn.textContent = 'Recording...';
        exportStatus.textContent = '0%';
      } else {
        exportBtn.disabled = false;
        exportBtn.textContent = '🎬 Export Video';
      }
    });

    // Export image button handler
    const exportImageBtn = document.getElementById('export-image-btn');
    exportImageBtn.addEventListener('click', () => {
      this.exportImage();
    });

    // File upload handler
    const uploadInput = document.getElementById('content-upload');
    uploadInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        const texture = await this.contentLoader.loadFromFile(file);
        if (texture) {
          // Pass animation state to scene (no rotation for GIF)
          this.sphereScene.setContent(texture, this.contentLoader.isAnimated);
        }
      }
    });

    // Window resize handler
    window.addEventListener('resize', () => {
      this.sphereScene.onResize();
    });

    // Rotation control
    const rotationSelect = document.getElementById('rotation-select');
    const speedSlider = document.getElementById('speed-slider');
    const speedValue = document.getElementById('speed-value');

    this.baseSpeed = 0.005;
    this.speedMultiplier = 1.0;
    this.rotationDirection = 1; // 1 = cw, -1 = ccw, 0 = stop

    const updateRotationSpeed = () => {
      this.sphereScene.rotationSpeed = this.baseSpeed * this.speedMultiplier * this.rotationDirection;
    };

    rotationSelect.addEventListener('change', (e) => {
      const value = e.target.value;
      if (value === 'cw') {
        this.rotationDirection = 1;
      } else if (value === 'ccw') {
        this.rotationDirection = -1;
      } else {
        this.rotationDirection = 0;
      }
      updateRotationSpeed();
    });

    speedSlider.addEventListener('input', (e) => {
      this.speedMultiplier = parseFloat(e.target.value);
      speedValue.textContent = this.speedMultiplier.toFixed(1) + 'x';
      updateRotationSpeed();
      // Sync GIF playback speed
      this.contentLoader.setSpeedMultiplier(this.speedMultiplier);
    });

    // Effect selector handler
    const effectSelect = document.getElementById('effect-select');
    effectSelect.addEventListener('change', (e) => {
      this.sphereScene.ledSphere.setEffect(e.target.value);
    });

    // Texture transform controls
    const textureScaleSlider = document.getElementById('texture-scale-slider');
    const textureScaleValue = document.getElementById('texture-scale-value');
    const textureXSlider = document.getElementById('texture-x-slider');
    const textureXValue = document.getElementById('texture-x-value');
    const textureYSlider = document.getElementById('texture-y-slider');
    const textureYValue = document.getElementById('texture-y-value');

    textureScaleSlider.addEventListener('input', (e) => {
      const scale = parseFloat(e.target.value);
      textureScaleValue.textContent = scale.toFixed(1) + 'x';
      this.sphereScene.ledSphere.setTextureScale(scale);
    });

    textureXSlider.addEventListener('input', (e) => {
      const offset = parseFloat(e.target.value);
      textureXValue.textContent = offset.toFixed(2);
      this.sphereScene.ledSphere.setTextureUOffset(offset);
    });

    textureYSlider.addEventListener('input', (e) => {
      const offset = parseFloat(e.target.value);
      textureYValue.textContent = offset.toFixed(2);
      this.sphereScene.ledSphere.setUserTextureVOffset(offset);
    });

    // Keyboard controls
    window.addEventListener('keydown', (e) => {
      const config = this.sphereScene.imageConfig;
      const clipConfig = this.sphereScene.ledSphere.clipConfig;
      const step = e.shiftKey ? 10 : 2;
      const angleStep = e.shiftKey ? 0.1 : 0.02;
      const offsetStep = e.shiftKey ? 0.1 : 0.02;

      switch(e.key) {
        // Position controls (Arrow keys)
        case 'ArrowLeft':
          config.sphereCenter.x -= step;
          this.sphereScene.updateFromImageCoords();
          break;
        case 'ArrowRight':
          config.sphereCenter.x += step;
          this.sphereScene.updateFromImageCoords();
          break;
        case 'ArrowUp':
          config.sphereCenter.y -= step;
          this.sphereScene.updateFromImageCoords();
          break;
        case 'ArrowDown':
          config.sphereCenter.y += step;
          this.sphereScene.updateFromImageCoords();
          break;

        // Size control (R)
        case 'r': case 'R':
          if (e.shiftKey) {
            config.sphereRadiusRatio *= 0.98;
          } else {
            config.sphereRadiusRatio *= 1.02;
          }
          this.sphereScene.updateFromImageCoords();
          break;

        // Clipping plane tilt X - forward/backward (W/S)
        case 'w': case 'W':
          clipConfig.tiltX += angleStep;
          this.sphereScene.ledSphere.updateClipPlane();
          break;
        case 's': case 'S':
          clipConfig.tiltX -= angleStep;
          this.sphereScene.ledSphere.updateClipPlane();
          break;

        // Clipping plane tilt Z - left/right (A/D)
        case 'a': case 'A':
          clipConfig.tiltZ -= angleStep;
          this.sphereScene.ledSphere.updateClipPlane();
          break;
        case 'd': case 'D':
          clipConfig.tiltZ += angleStep;
          this.sphereScene.ledSphere.updateClipPlane();
          break;

        // Clipping plane offset - show more/less (Q/E)
        case 'q': case 'Q':
          clipConfig.offset -= offsetStep;
          this.sphereScene.ledSphere.updateClipPlane();
          break;
        case 'e': case 'E':
          clipConfig.offset += offsetStep;
          this.sphereScene.ledSphere.updateClipPlane();
          break;

        // Toggle clipping (C)
        case 'c': case 'C':
          clipConfig.enabled = !clipConfig.enabled;
          this.sphereScene.ledSphere.updateClipPlane();
          console.log('Clipping:', clipConfig.enabled ? 'ON' : 'OFF');
          break;

        // Print config (P)
        case 'p': case 'P':
          console.log('Image Config:');
          console.log(`  sphereCenter: { x: ${config.sphereCenter.x.toFixed(0)}, y: ${config.sphereCenter.y.toFixed(0)} },`);
          console.log(`  sphereRadiusRatio: ${config.sphereRadiusRatio.toFixed(4)}`);
          console.log('Clip Config:');
          console.log(`  tiltX: ${clipConfig.tiltX.toFixed(3)}, tiltZ: ${clipConfig.tiltZ.toFixed(3)}, offset: ${clipConfig.offset.toFixed(3)}`);
          break;
      }
    });
  }

  async exportImage() {
    const container = this.canvas.parentElement;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Create composite canvas
    const compositeCanvas = document.createElement('canvas');
    compositeCanvas.width = width;
    compositeCanvas.height = height;
    const ctx = compositeCanvas.getContext('2d');

    // Draw background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    // Load and draw background image
    const bgUrl = this.backgroundManager.currentBackground;
    if (bgUrl) {
      try {
        const img = await new Promise((resolve, reject) => {
          const image = new Image();
          image.crossOrigin = 'anonymous';
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = bgUrl;
        });

        // Draw with 'contain' sizing
        const imgAspect = img.width / img.height;
        const canvasAspect = width / height;
        let drawWidth, drawHeight, offsetX, offsetY;

        if (canvasAspect > imgAspect) {
          drawHeight = height;
          drawWidth = drawHeight * imgAspect;
          offsetX = (width - drawWidth) / 2;
          offsetY = 0;
        } else {
          drawWidth = width;
          drawHeight = drawWidth / imgAspect;
          offsetX = 0;
          offsetY = (height - drawHeight) / 2;
        }

        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
      } catch (e) {
        console.warn('Failed to load background for image export');
      }
    }

    // Render WebGL scene and draw on top
    this.sphereScene.render();
    ctx.drawImage(this.canvas, 0, 0);

    // Export as PNG
    const dataUrl = compositeCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `sphere-export-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    // Update content (for animated GIFs)
    const texture = this.contentLoader.update();
    if (texture) {
      this.sphereScene.updateTexture(texture);
    }

    // Render scene
    this.sphereScene.render();

    // Check recording progress
    if (this.recordingManager.isRecording) {
      this.recordingManager.checkProgress();
    }
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
