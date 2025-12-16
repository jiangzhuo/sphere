import * as THREE from 'three';
import { LEDSphere } from './LEDSphere.js';

export class SphereScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.rotationSpeed = 0.005;  // Texture rotation speed (radians per frame)
    this.textureRotation = 0;   // Current texture rotation angle
    this.isAnimatedContent = false;  // Whether content is animated (GIF)

    // Background image dimensions
    this.imageWidth = 1500;
    this.imageHeight = 1000;
    this.imageAspect = this.imageWidth / this.imageHeight;

    // Image-based configuration
    // sphereCenter: pixel coordinates of sphere center in the original image
    // sphereRadiusRatio: sphere radius as a ratio of image width
    this.imageConfig = {
      sphereCenter: { x: 869, y: 634 },
      sphereRadiusRatio: 0.1691
    };

    this.init();
  }

  init() {
    // Scene setup
    this.scene = new THREE.Scene();

    // Get container size (will be updated after first render)
    const container = this.canvas.parentElement;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const aspect = width / height;
    const frustumSize = 2;

    // Use OrthographicCamera for easier 2D-to-3D mapping
    this.camera = new THREE.OrthographicCamera(
      -frustumSize * aspect / 2,
      frustumSize * aspect / 2,
      frustumSize / 2,
      -frustumSize / 2,
      0.1,
      100
    );
    this.camera.position.z = 10;

    // Renderer with transparency
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);

    // Create LED Sphere
    this.ledSphere = new LEDSphere();
    this.sphere = this.ledSphere.mesh;
    this.scene.add(this.sphere);

    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
    this.scene.add(ambientLight);

    // Apply initial positioning
    this.updateFromImageCoords();
  }

  /**
   * Get the actual container dimensions (main-area, not full window)
   */
  getContainerSize() {
    const container = this.canvas.parentElement;
    return {
      width: container.clientWidth,
      height: container.clientHeight
    };
  }

  /**
   * Calculate the displayed image bounds when using background-size: contain
   */
  calculateImageDisplayBounds() {
    const size = this.getContainerSize();
    const windowWidth = size.width;
    const windowHeight = size.height;
    const windowAspect = windowWidth / windowHeight;

    let displayedWidth, displayedHeight, offsetX, offsetY;

    if (windowAspect > this.imageAspect) {
      // Window is wider than image - letterbox on sides
      displayedHeight = windowHeight;
      displayedWidth = windowHeight * this.imageAspect;
      offsetX = (windowWidth - displayedWidth) / 2;
      offsetY = 0;
    } else {
      // Window is taller than image - letterbox on top/bottom
      displayedWidth = windowWidth;
      displayedHeight = windowWidth / this.imageAspect;
      offsetX = 0;
      offsetY = (windowHeight - displayedHeight) / 2;
    }

    return { displayedWidth, displayedHeight, offsetX, offsetY, windowWidth, windowHeight };
  }

  /**
   * Update sphere position and scale based on image coordinates
   */
  updateFromImageCoords() {
    const bounds = this.calculateImageDisplayBounds();
    const config = this.imageConfig;

    // Convert image pixel coordinates to screen coordinates
    const screenX = bounds.offsetX + (config.sphereCenter.x / this.imageWidth) * bounds.displayedWidth;
    const screenY = bounds.offsetY + (config.sphereCenter.y / this.imageHeight) * bounds.displayedHeight;

    // Convert screen coordinates to normalized device coordinates (-1 to 1)
    const ndcX = (screenX / bounds.windowWidth) * 2 - 1;
    const ndcY = -((screenY / bounds.windowHeight) * 2 - 1);  // Y is flipped in WebGL

    // For orthographic camera, NDC maps directly to world coordinates
    // The frustum size determines the mapping
    const aspect = bounds.windowWidth / bounds.windowHeight;
    const frustumSize = 2;

    // Convert NDC to world position
    const worldX = ndcX * (frustumSize * aspect / 2);
    const worldY = ndcY * (frustumSize / 2);

    // Set sphere position
    this.sphere.position.set(worldX, worldY, 0);

    // Calculate sphere scale based on image display size
    // sphereRadiusRatio is the ratio of sphere radius to image width
    const sphereRadiusPixels = config.sphereRadiusRatio * bounds.displayedWidth;

    // Convert pixel radius to world units
    // The full window width in world units is frustumSize * aspect
    const pixelsPerWorldUnit = bounds.windowWidth / (frustumSize * aspect);
    const worldRadius = sphereRadiusPixels / pixelsPerWorldUnit;

    // The default sphere has radius 1, so scale = desired radius
    this.sphere.scale.setScalar(worldRadius);
  }

  setContent(texture, isAnimated = false) {
    this.isAnimatedContent = isAnimated;
    this.ledSphere.setAnimated(isAnimated);  // Notify shader to use animated mode
    this.ledSphere.setTexture(texture);
  }

  updateTexture(texture) {
    this.ledSphere.updateTexture(texture);
  }

  /**
   * Set sphere center from image pixel coordinates
   */
  setSphereCenter(x, y) {
    this.imageConfig.sphereCenter.x = x;
    this.imageConfig.sphereCenter.y = y;
    this.updateFromImageCoords();
  }

  /**
   * Set sphere radius as ratio of image width
   */
  setSphereRadiusRatio(ratio) {
    this.imageConfig.sphereRadiusRatio = ratio;
    this.updateFromImageCoords();
  }

  onResize() {
    const size = this.getContainerSize();
    const width = size.width;
    const height = size.height;
    const aspect = width / height;
    const frustumSize = 2;

    // Update orthographic camera
    this.camera.left = -frustumSize * aspect / 2;
    this.camera.right = frustumSize * aspect / 2;
    this.camera.top = frustumSize / 2;
    this.camera.bottom = -frustumSize / 2;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);

    // Re-apply positioning based on new container size
    this.updateFromImageCoords();
  }

  render() {
    // Only apply rotation for non-animated content (not GIF)
    if (!this.isAnimatedContent) {
      this.textureRotation += this.rotationSpeed;
      this.ledSphere.material.uniforms.uTextureRotation.value = this.textureRotation;
    }

    // Update LED shader time uniform
    this.ledSphere.update();

    // Render
    this.renderer.render(this.scene, this.camera);
  }
}
