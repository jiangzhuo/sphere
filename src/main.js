import { SphereScene } from './SphereScene.js';
import { BackgroundManager } from './BackgroundManager.js';
import { ContentLoader } from './ContentLoader.js';

class App {
  constructor() {
    this.canvas = document.getElementById('sphere-canvas');
    this.backgroundLayer = document.getElementById('background-layer');

    // Initialize components
    this.backgroundManager = new BackgroundManager(this.backgroundLayer);
    this.sphereScene = new SphereScene(this.canvas);
    this.contentLoader = new ContentLoader();

    // Set default background
    this.backgroundManager.setBackground('/backgrounds/default.png');

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

  setupEventListeners() {
    // File upload handler
    const uploadInput = document.getElementById('content-upload');
    uploadInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        const texture = await this.contentLoader.loadFromFile(file);
        if (texture) {
          this.sphereScene.setContent(texture);
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
    });

    // Effect selector handler
    const effectSelect = document.getElementById('effect-select');
    effectSelect.addEventListener('change', (e) => {
      this.sphereScene.ledSphere.setEffect(e.target.value);
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

  animate() {
    requestAnimationFrame(() => this.animate());

    // Update content (for animated GIFs)
    const texture = this.contentLoader.update();
    if (texture) {
      this.sphereScene.updateTexture(texture);
    }

    // Render scene
    this.sphereScene.render();
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
