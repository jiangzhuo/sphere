import * as THREE from 'three';
import ledVertexShader from './shaders/led.vert';
import ledFragmentShader from './shaders/led.frag';

export class LEDSphere {
  constructor() {
    this.clock = new THREE.Clock();

    // Clipping plane configuration
    // Angles in radians: tiltX rotates around X axis, tiltZ rotates around Z axis
    this.clipConfig = {
      enabled: true,
      tiltX: 0.170,    // Tilt angle around X axis (forward/backward tilt)
      tiltZ: -0.060,   // Tilt angle around Z axis (left/right tilt)
      offset: -0.31    // How far the plane is from center (0 = through center, positive = shows more)
    };

    this.createMesh();
  }

  createMesh() {
    // High-resolution sphere geometry
    const geometry = new THREE.SphereGeometry(1, 128, 64);

    // Create default texture (placeholder pattern)
    this.defaultTexture = this.createDefaultTexture();

    // Custom shader material for LED effect
    this.material = new THREE.ShaderMaterial({
      vertexShader: ledVertexShader,
      fragmentShader: ledFragmentShader,
      uniforms: {
        uTexture: { value: this.defaultTexture },
        uTime: { value: 0 },
        uLedCountX: { value: 120.0 },  // Horizontal pixel count
        uLedCountY: { value: 60.0 },   // Vertical pixel count (scanlines)
        uGapSize: { value: 0.1 },      // Gap size (less important for CRT)
        uBrightness: { value: 1.4 },   // Overall brightness (CRT needs more)
        uGlowIntensity: { value: 0.5 }, // Phosphor glow amount
        uColorQuantization: { value: 16.0 }, // Fewer colors for retro feel
        uScanlineIntensity: { value: 0.4 }, // Prominent scanlines
        uNoiseIntensity: { value: 0.03 },   // Slight static noise
        // Clipping plane uniforms
        uClipPlaneNormal: { value: new THREE.Vector3(0, 1, 0) },
        uClipPlaneOffset: { value: 0.2 },
        uClipEnabled: { value: 1.0 },
        // Texture rotation (content animation)
        uTextureRotation: { value: 0.0 },
        // Rotation axis tilt (derived from -clipConfig.tiltZ)
        uRotationTiltZ: { value: 0.0 },
        // Texture V scaling (to fit content within visible clipped area)
        uTextureVScale: { value: 1.0 },
        uTextureVOffset: { value: 0.0 },
        // Effect mode: 0=CRT, 1=LED, 2=LCD, 3=Plasma, 4=Neon, 5=Holographic
        uEffectMode: { value: 0 },
        // Animated content mode (GIF) - bypasses V scaling
        uIsAnimated: { value: 0.0 },
        // User texture transform controls
        uTextureScale: { value: 1.0 },
        uTextureUOffset: { value: 0.0 },
        uUserTextureVOffset: { value: 0.0 }
      },
      transparent: true,
      side: THREE.FrontSide
    });

    // Apply initial clipping plane
    this.updateClipPlane();

    this.mesh = new THREE.Mesh(geometry, this.material);
  }

  createDefaultTexture() {
    // Create a colorful default pattern
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Gradient background
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#ff6b6b');
    gradient.addColorStop(0.25, '#feca57');
    gradient.addColorStop(0.5, '#48dbfb');
    gradient.addColorStop(0.75, '#ff9ff3');
    gradient.addColorStop(1, '#54a0ff');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add some visual interest
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.arc(canvas.width * 0.3, canvas.height * 0.4, 80, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(canvas.width * 0.7, canvas.height * 0.6, 60, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;

    return texture;
  }

  setTexture(texture) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    this.material.uniforms.uTexture.value = texture;
  }

  updateTexture(texture) {
    if (texture) {
      texture.needsUpdate = true;
      this.material.uniforms.uTexture.value = texture;
    }
  }

  setAnimated(isAnimated) {
    this.material.uniforms.uIsAnimated.value = isAnimated ? 1.0 : 0.0;
  }

  update() {
    this.material.uniforms.uTime.value = this.clock.getElapsedTime();
  }

  // Configuration methods
  setLedCount(x, y) {
    this.material.uniforms.uLedCountX.value = x;
    this.material.uniforms.uLedCountY.value = y;
  }

  setGapSize(size) {
    this.material.uniforms.uGapSize.value = Math.max(0, Math.min(1, size));
  }

  setBrightness(brightness) {
    this.material.uniforms.uBrightness.value = brightness;
  }

  setGlowIntensity(intensity) {
    this.material.uniforms.uGlowIntensity.value = intensity;
  }

  // Clipping plane methods
  updateClipPlane() {
    const { tiltX, tiltZ, offset, enabled } = this.clipConfig;

    // Calculate normal vector from tilt angles
    // Start with up vector (0, 1, 0) and rotate by tilt angles
    const normal = new THREE.Vector3(0, 1, 0);

    // Rotate around X axis (forward/backward tilt)
    const cosX = Math.cos(tiltX);
    const sinX = Math.sin(tiltX);
    const y1 = normal.y * cosX - normal.z * sinX;
    const z1 = normal.y * sinX + normal.z * cosX;
    normal.y = y1;
    normal.z = z1;

    // Rotate around Z axis (left/right tilt)
    const cosZ = Math.cos(tiltZ);
    const sinZ = Math.sin(tiltZ);
    const x2 = normal.x * cosZ - normal.y * sinZ;
    const y2 = normal.x * sinZ + normal.y * cosZ;
    normal.x = x2;
    normal.y = y2;

    normal.normalize();

    this.material.uniforms.uClipPlaneNormal.value.copy(normal);
    this.material.uniforms.uClipPlaneOffset.value = offset;
    this.material.uniforms.uClipEnabled.value = enabled ? 1.0 : 0.0;
    // Rotation axis tilt is opposite to clip tiltZ to align texture with clipping arc
    this.material.uniforms.uRotationTiltZ.value = -tiltZ;

    // Calculate texture V scale to fit content within visible clipped area
    // Using surface area ratio: area from north pole to Y=offset / total sphere area
    // Area ratio = (1 - offset) / 2, where offset is the Y coordinate of clip plane
    if (enabled) {
      const clampedOffset = Math.max(-1, Math.min(1, offset));
      const visibleVMax = (1 - clampedOffset) / 2;
      this.material.uniforms.uTextureVScale.value = visibleVMax;
    } else {
      this.material.uniforms.uTextureVScale.value = 1.0;
    }
  }

  setClipEnabled(enabled) {
    this.clipConfig.enabled = enabled;
    this.updateClipPlane();
  }

  setClipTiltX(angle) {
    this.clipConfig.tiltX = angle;
    this.updateClipPlane();
  }

  setClipTiltZ(angle) {
    this.clipConfig.tiltZ = angle;
    this.updateClipPlane();
  }

  setClipOffset(offset) {
    this.clipConfig.offset = offset;
    this.updateClipPlane();
  }

  // Texture transform methods
  setTextureScale(scale) {
    this.material.uniforms.uTextureScale.value = Math.max(0.1, Math.min(5.0, scale));
  }

  setTextureUOffset(offset) {
    this.material.uniforms.uTextureUOffset.value = offset;
  }

  setUserTextureVOffset(offset) {
    this.material.uniforms.uUserTextureVOffset.value = offset;
  }

  getClipConfig() {
    return { ...this.clipConfig };
  }

  // Effect presets
  static effectPresets = {
    none: {
      mode: 0,
      ledCountX: 256,
      ledCountY: 128,
      gapSize: 0.0,
      brightness: 1.0,
      glowIntensity: 0.0,
      colorQuantization: 256,
      scanlineIntensity: 0.0,
      noiseIntensity: 0.0
    },
    crt: {
      mode: 1,
      ledCountX: 120,
      ledCountY: 60,
      gapSize: 0.1,
      brightness: 1.4,
      glowIntensity: 0.5,
      colorQuantization: 16,
      scanlineIntensity: 0.4,
      noiseIntensity: 0.03
    },
    led: {
      mode: 2,
      ledCountX: 160,
      ledCountY: 80,
      gapSize: 0.15,
      brightness: 1.2,
      glowIntensity: 0.3,
      colorQuantization: 32,
      scanlineIntensity: 0.05,
      noiseIntensity: 0.02
    },
    lcd: {
      mode: 3,
      ledCountX: 200,
      ledCountY: 100,
      gapSize: 0.05,
      brightness: 1.0,
      glowIntensity: 0.1,
      colorQuantization: 64,
      scanlineIntensity: 0.0,
      noiseIntensity: 0.01
    },
    plasma: {
      mode: 4,
      ledCountX: 100,
      ledCountY: 50,
      gapSize: 0.08,
      brightness: 1.3,
      glowIntensity: 0.7,
      colorQuantization: 48,
      scanlineIntensity: 0.0,
      noiseIntensity: 0.02
    },
    neon: {
      mode: 5,
      ledCountX: 160,
      ledCountY: 80,
      gapSize: 0.08,
      brightness: 1.5,
      glowIntensity: 0.9,
      colorQuantization: 32,
      scanlineIntensity: 0.0,
      noiseIntensity: 0.02
    },
    holographic: {
      mode: 6,
      ledCountX: 150,
      ledCountY: 75,
      gapSize: 0.08,
      brightness: 1.2,
      glowIntensity: 0.4,
      colorQuantization: 64,
      scanlineIntensity: 0.1,
      noiseIntensity: 0.02
    }
  };

  setEffect(effectName) {
    const preset = LEDSphere.effectPresets[effectName];
    if (!preset) {
      console.warn(`Unknown effect: ${effectName}`);
      return;
    }

    const u = this.material.uniforms;
    u.uEffectMode.value = preset.mode;
    u.uLedCountX.value = preset.ledCountX;
    u.uLedCountY.value = preset.ledCountY;
    u.uGapSize.value = preset.gapSize;
    u.uBrightness.value = preset.brightness;
    u.uGlowIntensity.value = preset.glowIntensity;
    u.uColorQuantization.value = preset.colorQuantization;
    u.uScanlineIntensity.value = preset.scanlineIntensity;
    u.uNoiseIntensity.value = preset.noiseIntensity;

    console.log(`Effect changed to: ${effectName}`);
  }

  getCurrentEffect() {
    const mode = this.material.uniforms.uEffectMode.value;
    const effects = ['none', 'crt', 'led', 'lcd', 'plasma', 'neon', 'holographic'];
    return effects[mode] || 'unknown';
  }
}
