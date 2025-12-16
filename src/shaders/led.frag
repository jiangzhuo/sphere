uniform sampler2D uTexture;
uniform float uTime;
uniform float uLedCountX;
uniform float uLedCountY;
uniform float uGapSize;
uniform float uBrightness;
uniform float uGlowIntensity;
uniform float uColorQuantization;
uniform float uScanlineIntensity;
uniform float uNoiseIntensity;

// Clipping plane parameters
uniform vec3 uClipPlaneNormal;
uniform float uClipPlaneOffset;
uniform float uClipEnabled;

// Texture rotation
uniform float uTextureRotation;
uniform float uRotationTiltZ;  // Tilt angle for rotation axis (derived from clip tiltZ)

// Texture V scaling (to fit content within visible clipped area)
uniform float uTextureVScale;   // V range (0 to this value is visible)
uniform float uTextureVOffset;  // V offset (usually 0)

// Effect mode: 0=CRT, 1=LED, 2=LCD, 3=Plasma, 4=Neon, 5=Holographic
uniform int uEffectMode;

// Animated content mode (GIF) - bypasses V scaling
uniform float uIsAnimated;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vWorldPosition;

#define PI 3.14159265359

// ============================================
// UV to Sphere and Rotation Functions
// ============================================

// Convert UV coordinates to 3D point on unit sphere
vec3 uvToSphere(vec2 uv) {
  float theta = uv.x * 2.0 * PI;  // Longitude (0 to 2PI)
  float phi = uv.y * PI;          // Latitude (0 to PI, from top to bottom)
  return vec3(
    sin(phi) * cos(theta),
    cos(phi),
    sin(phi) * sin(theta)
  );
}

// Convert 3D point on sphere back to UV coordinates
vec2 sphereToUV(vec3 p) {
  float theta = atan(p.z, p.x);  // Range: -PI to PI
  float phi = acos(clamp(p.y, -1.0, 1.0));  // Range: 0 to PI
  return vec2(theta / (2.0 * PI) + 0.5, phi / PI);
}

// Calculate UV coordinates in tilted coordinate system (where axis is the "pole")
vec2 getTiltedUV(vec3 p, vec3 axis) {
  // Tilted V = angle from axis (0 to PI, pole to pole)
  float cosAngle = dot(p, axis);
  float tiltedV = acos(clamp(cosAngle, -1.0, 1.0)) / PI;

  // Tilted U = angle in the plane perpendicular to axis
  // Build orthonormal basis using world Y (up) direction for proper alignment
  vec3 worldUp = vec3(0.0, 1.0, 0.0);
  vec3 projectedUp = worldUp - axis * dot(worldUp, axis);
  float projLen = length(projectedUp);

  vec3 tangent1;
  if (projLen < 0.001) {
    // Fallback if up direction is parallel to axis
    tangent1 = normalize(cross(axis, vec3(1.0, 0.0, 0.0)));
  } else {
    // tangent1 is perpendicular to projected up, in the tangent plane
    tangent1 = normalize(cross(axis, projectedUp));
  }
  vec3 tangent2 = cross(axis, tangent1);

  // Project point onto plane perpendicular to axis
  vec3 projected = p - axis * cosAngle;
  float len = length(projected);
  if (len < 0.001) {
    return vec2(0.0, tiltedV); // At pole
  }
  projected = projected / len;

  // Calculate angle in tangent plane (negated to fix mirror)
  float u1 = dot(projected, tangent1);
  float u2 = dot(projected, tangent2);
  float tiltedU = -atan(u2, u1) / (2.0 * PI) + 0.5;

  return vec2(tiltedU, tiltedV);
}

// Apply tilted rotation: compute UV in tilted space, apply rotation, use for texture sampling
vec2 rotateTiltedUV(vec2 uv, vec3 axis, float angle) {
  // Convert UV to 3D point on sphere
  vec3 p = uvToSphere(uv);

  // Get UV coordinates in tilted coordinate system
  vec2 tiltedUV = getTiltedUV(p, axis);

  // Apply simple horizontal rotation in tilted UV space
  tiltedUV.x = fract(tiltedUV.x + angle / (2.0 * PI));

  return tiltedUV;
}

// Pseudo-random function
float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

// Smooth noise
float noise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

// HSV to RGB conversion
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// ============================================
// Effect 0: CRT 90s
// ============================================
vec4 effectCRT(vec2 uv, vec2 pixelIndex, vec2 pixelLocal) {
  vec2 centerUV = (pixelIndex + 0.5) / vec2(uLedCountX, uLedCountY);

  // Subtle chromatic aberration (reduced)
  float aberration = 0.001;
  float r = texture2D(uTexture, centerUV + vec2(aberration, 0.0)).r;
  float g = texture2D(uTexture, centerUV).g;
  float b = texture2D(uTexture, centerUV - vec2(aberration, 0.0)).b;
  vec3 texColor = vec3(r, g, b);

  // Color quantization
  vec3 quantized = floor(texColor * uColorQuantization) / uColorQuantization;

  // Softer phosphor pattern (less aggressive RGB stripes)
  float stripePos = fract(pixelLocal.x * 3.0);
  float r_stripe = smoothstep(0.0, 0.2, stripePos) * smoothstep(0.33, 0.13, stripePos);
  float g_stripe = smoothstep(0.33, 0.53, stripePos) * smoothstep(0.66, 0.46, stripePos);
  float b_stripe = smoothstep(0.66, 0.86, stripePos) * smoothstep(1.0, 0.8, stripePos);
  vec3 phosphorMask = vec3(max(r_stripe, 0.4), max(g_stripe, 0.4), max(b_stripe, 0.4));

  // Softer scanlines
  float scanlineY = fract(pixelLocal.y);
  float scanline = 1.0 - uScanlineIntensity * 0.5 * (1.0 - smoothstep(0.4, 0.5, scanlineY) * smoothstep(0.6, 0.5, scanlineY));

  // Combine (removed interlacing flicker)
  vec3 finalColor = quantized * phosphorMask * scanline;

  // Subtle phosphor glow
  float luminance = dot(quantized, vec3(0.299, 0.587, 0.114));
  finalColor += quantized * luminance * uGlowIntensity * 0.3;

  // Reduced noise
  float staticNoise = noise(pixelIndex * 0.5 + uTime * 3.0);
  finalColor *= 1.0 + uNoiseIntensity * 0.5 * (staticNoise - 0.5);

  // Add dark background color to cover the sphere behind
  vec3 backgroundColor = vec3(0.02, 0.02, 0.03);  // Very dark gray with slight blue tint
  float phosphorAlpha = max(max(phosphorMask.r, phosphorMask.g), phosphorMask.b);
  finalColor = mix(backgroundColor, finalColor, phosphorAlpha);

  return vec4(finalColor, 1.0);
}

// ============================================
// Effect 1: LED Matrix
// ============================================
vec4 effectLED(vec2 uv, vec2 pixelIndex, vec2 pixelLocal) {
  vec2 centerUV = (pixelIndex + 0.5) / vec2(uLedCountX, uLedCountY);
  vec4 texColor = texture2D(uTexture, centerUV);

  // Color quantization
  vec3 quantized = floor(texColor.rgb * uColorQuantization) / uColorQuantization;

  // SMD LED square pixel with rounded corners
  float halfGap = uGapSize * 0.5;
  float ledMaskX = smoothstep(halfGap, halfGap + 0.05, pixelLocal.x) * smoothstep(1.0 - halfGap, 1.0 - halfGap - 0.05, pixelLocal.x);
  float ledMaskY = smoothstep(halfGap, halfGap + 0.05, pixelLocal.y) * smoothstep(1.0 - halfGap, 1.0 - halfGap - 0.05, pixelLocal.y);
  float ledMask = ledMaskX * ledMaskY;

  // LED brightness falloff from center
  float distFromCenter = length(pixelLocal - 0.5) * 2.0;
  float centerBrightness = 1.0 - distFromCenter * 0.2 * uGlowIntensity;

  // RGB sub-pixel hint
  vec3 subPixelColor = quantized;
  float subPixelX = fract(pixelLocal.x * 3.0);
  if (subPixelX < 0.33) {
    subPixelColor.gb *= 0.85;
  } else if (subPixelX < 0.66) {
    subPixelColor.rb *= 0.85;
  } else {
    subPixelColor.rg *= 0.85;
  }
  vec3 finalColor = mix(quantized, subPixelColor, 0.2);

  // Apply mask and brightness
  finalColor *= ledMask * centerBrightness;

  // Glow effect
  float luminance = dot(finalColor, vec3(0.299, 0.587, 0.114));
  finalColor += finalColor * uGlowIntensity * luminance * 0.5;

  // Subtle noise
  float flicker = 1.0 + uNoiseIntensity * (noise(pixelIndex + uTime * 10.0) - 0.5);
  finalColor *= flicker;

  // Add black background for LED matrix
  vec3 backgroundColor = vec3(0.01, 0.01, 0.01);
  finalColor = mix(backgroundColor, finalColor, ledMask);

  return vec4(finalColor, 1.0);
}

// ============================================
// Effect 2: LCD Panel
// ============================================
vec4 effectLCD(vec2 uv, vec2 pixelIndex, vec2 pixelLocal) {
  vec2 centerUV = (pixelIndex + 0.5) / vec2(uLedCountX, uLedCountY);
  vec4 texColor = texture2D(uTexture, centerUV);

  // Slight blur by sampling neighbors
  vec2 pixelSize = 1.0 / vec2(uLedCountX, uLedCountY);
  vec3 blurred = texColor.rgb * 0.6;
  blurred += texture2D(uTexture, centerUV + vec2(pixelSize.x, 0.0)).rgb * 0.1;
  blurred += texture2D(uTexture, centerUV - vec2(pixelSize.x, 0.0)).rgb * 0.1;
  blurred += texture2D(uTexture, centerUV + vec2(0.0, pixelSize.y)).rgb * 0.1;
  blurred += texture2D(uTexture, centerUV - vec2(0.0, pixelSize.y)).rgb * 0.1;

  // Square pixel grid
  float gridX = smoothstep(0.0, 0.05, pixelLocal.x) * smoothstep(1.0, 0.95, pixelLocal.x);
  float gridY = smoothstep(0.0, 0.05, pixelLocal.y) * smoothstep(1.0, 0.95, pixelLocal.y);
  float gridMask = gridX * gridY;

  // LCD sub-pixels (vertical RGB stripes)
  float subX = fract(pixelLocal.x * 3.0);
  vec3 lcdMask = vec3(
    smoothstep(0.0, 0.2, subX) * smoothstep(0.33, 0.13, subX),
    smoothstep(0.33, 0.53, subX) * smoothstep(0.66, 0.46, subX),
    smoothstep(0.66, 0.86, subX) * smoothstep(1.0, 0.8, subX)
  );
  lcdMask = max(lcdMask, vec3(0.3)); // Minimum brightness

  vec3 finalColor = blurred * lcdMask * gridMask;

  // Slight backlight variation
  float backlight = 0.98 + 0.02 * sin(uTime * 0.5);
  finalColor *= backlight;

  // Add gray background for LCD backlight
  vec3 backgroundColor = vec3(0.04, 0.04, 0.05);
  finalColor = mix(backgroundColor, finalColor, gridMask);

  return vec4(finalColor, 1.0);
}

// ============================================
// Effect 3: Plasma - Deep blacks, high contrast, warm rich colors
// ============================================
vec4 effectPlasma(vec2 uv, vec2 pixelIndex, vec2 pixelLocal) {
  vec2 centerUV = (pixelIndex + 0.5) / vec2(uLedCountX, uLedCountY);
  vec4 texColor = texture2D(uTexture, centerUV);

  // Plasma's signature: deep blacks and vibrant colors
  // Boost contrast and saturation
  vec3 color = texColor.rgb;
  float luma = dot(color, vec3(0.299, 0.587, 0.114));

  // Increase saturation significantly
  color = mix(vec3(luma), color, 1.6);

  // S-curve contrast for deep blacks and bright whites
  color = color * color * (3.0 - 2.0 * color);

  // Warm color shift (plasma tends to have warmer tones)
  color.r *= 1.08;
  color.b *= 0.95;
  color = clamp(color, 0.0, 1.0);

  // Very soft pixel edges (plasma has minimal visible pixel structure)
  float distFromCenter = length(pixelLocal - 0.5) * 2.0;
  float softMask = 1.0 - smoothstep(0.8, 1.0, distFromCenter);

  // Subtle phosphor cell glow
  float cellGlow = exp(-distFromCenter * 1.5) * 0.3;

  vec3 finalColor = color * softMask;
  finalColor += color * cellGlow * uGlowIntensity;

  // Rich bloom on bright colors
  finalColor += color * pow(luma, 2.5) * uGlowIntensity * 0.5;

  // Pure black background (plasma's best feature)
  vec3 backgroundColor = vec3(0.0, 0.0, 0.0);
  finalColor = mix(backgroundColor, finalColor, softMask + cellGlow * 0.5);

  return vec4(finalColor, 1.0);
}

// ============================================
// Effect 4: Neon Glow - Glowing tubes, atmospheric halo, clear text
// ============================================
vec4 effectNeon(vec2 uv, vec2 pixelIndex, vec2 pixelLocal) {
  vec2 centerUV = (pixelIndex + 0.5) / vec2(uLedCountX, uLedCountY);
  vec4 texColor = texture2D(uTexture, centerUV);

  // Extract color
  vec3 color = texColor.rgb;
  float luma = dot(color, vec3(0.299, 0.587, 0.114));

  // Lower threshold for better text visibility
  float neonThreshold = smoothstep(0.05, 0.25, luma);

  // Moderate saturation boost
  color = mix(vec3(luma), color, 1.8);
  color = clamp(color, 0.0, 1.0);

  // Pixel mask for sharper edges
  float distFromCenter = length(pixelLocal - 0.5) * 2.0;
  float pixelMask = 1.0 - smoothstep(0.7, 0.95, distFromCenter);

  // Neon core
  float core = exp(-distFromCenter * 6.0);
  vec3 coreColor = mix(color, vec3(1.0), 0.4);

  // Inner glow
  float innerGlow = exp(-distFromCenter * 4.0);

  // Outer glow
  float outerGlow = exp(-distFromCenter * 1.5) * 0.5;

  // Atmospheric halo (restored)
  float halo = exp(-distFromCenter * 0.6) * 0.25;

  // Combine layers
  vec3 finalColor = color * pixelMask * 0.7; // Base layer for text clarity
  finalColor += coreColor * core * 1.2 * neonThreshold;
  finalColor += color * innerGlow * uGlowIntensity * neonThreshold;
  finalColor += color * outerGlow * uGlowIntensity * 0.6 * neonThreshold;
  finalColor += color * halo * uGlowIntensity * 0.4 * neonThreshold; // Atmospheric halo

  // Subtle flicker
  float flicker = sin(uTime * 30.0 + pixelIndex.x * 2.0) * 0.02;
  finalColor *= 1.0 + flicker;

  // Black background
  vec3 backgroundColor = vec3(0.0, 0.0, 0.0);
  float alpha = max(pixelMask, max(outerGlow, halo) * 0.4) * neonThreshold;
  finalColor = mix(backgroundColor, finalColor, clamp(alpha + 0.05, 0.0, 1.0));

  return vec4(finalColor, 1.0);
}

// ============================================
// Effect 5: Holographic
// ============================================
vec4 effectHolographic(vec2 uv, vec2 pixelIndex, vec2 pixelLocal) {
  vec2 centerUV = (pixelIndex + 0.5) / vec2(uLedCountX, uLedCountY);
  vec4 texColor = texture2D(uTexture, centerUV);

  // Rainbow interference pattern
  float interference = sin(pixelIndex.x * 0.3 + pixelIndex.y * 0.2 + uTime * 2.0) * 0.5 + 0.5;
  float hue = fract(interference + uv.x * 0.5 + uv.y * 0.3);
  vec3 rainbow = hsv2rgb(vec3(hue, 0.3, 1.0));

  // Holographic shimmer
  float shimmer = sin(pixelIndex.x * 2.0 - uTime * 5.0) * sin(pixelIndex.y * 2.0 + uTime * 3.0);
  shimmer = shimmer * 0.5 + 0.5;

  // Fresnel-like edge effect
  float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);

  // Scan line effect (holographic display lines)
  float scanLine = sin(pixelIndex.y * PI * 2.0 + uTime * 10.0) * 0.1 + 0.9;

  // Combine base color with holographic effects
  vec3 finalColor = texColor.rgb * 0.7 + rainbow * 0.3;
  finalColor *= scanLine;
  finalColor += rainbow * shimmer * 0.2;
  finalColor += vec3(0.2, 0.5, 1.0) * fresnel * 0.3; // Blue edge glow

  // Transparency variation
  float alpha = 0.7 + shimmer * 0.2 + fresnel * 0.1;

  // Pixel grid (subtle)
  float gridMask = smoothstep(0.0, 0.1, pixelLocal.x) * smoothstep(1.0, 0.9, pixelLocal.x);
  gridMask *= smoothstep(0.0, 0.1, pixelLocal.y) * smoothstep(1.0, 0.9, pixelLocal.y);

  finalColor *= gridMask;

  // Add dark blue-black background for holographic effect
  vec3 backgroundColor = vec3(0.01, 0.02, 0.04);
  float holoAlpha = alpha * gridMask;
  finalColor = mix(backgroundColor, finalColor, holoAlpha);

  return vec4(finalColor, 1.0);
}

// ============================================
// Effect 6: None (Raw)
// ============================================
vec4 effectNone(vec2 uv) {
  // Simply sample the texture with no effects
  vec4 texColor = texture2D(uTexture, uv);
  // Ensure full opacity
  return vec4(texColor.rgb, 1.0);
}

// ============================================
// Main
// ============================================
void main() {
  // Clipping plane test
  if (uClipEnabled > 0.5) {
    float clipDist = dot(vPosition, uClipPlaneNormal) - uClipPlaneOffset;
    if (clipDist < 0.0) {
      discard;
    }
  }

  // Apply texture rotation around slightly tilted axis (only left/right tilt, no forward/back)
  // uRotationTiltZ is derived from -clipConfig.tiltZ to match the clipping arc
  vec3 rotationAxis = vec3(sin(uRotationTiltZ), cos(uRotationTiltZ), 0.0);
  vec2 rotatedUV = rotateTiltedUV(vUv, rotationAxis, uTextureRotation);

  // Scale V coordinate based on content type
  vec2 scaledUV;
  if (uIsAnimated > 0.5) {
    // Animated content (GIF): use UV directly, texture fills visible area
    scaledUV = rotatedUV;
  } else {
    // Rotating content: apply V scaling to fit within visible clipped area
    scaledUV = vec2(rotatedUV.x, rotatedUV.y * uTextureVScale + uTextureVOffset);
  }

  // Calculate pixel coordinates
  vec2 pixelCoord = vec2(scaledUV.x * uLedCountX, scaledUV.y * uLedCountY);
  vec2 pixelIndex = floor(pixelCoord);
  vec2 pixelLocal = fract(pixelCoord);

  // Select effect
  vec4 result;
  if (uEffectMode == 0) {
    result = effectNone(scaledUV);
  } else if (uEffectMode == 1) {
    result = effectCRT(scaledUV, pixelIndex, pixelLocal);
  } else if (uEffectMode == 2) {
    result = effectLED(scaledUV, pixelIndex, pixelLocal);
  } else if (uEffectMode == 3) {
    result = effectLCD(scaledUV, pixelIndex, pixelLocal);
  } else if (uEffectMode == 4) {
    result = effectPlasma(scaledUV, pixelIndex, pixelLocal);
  } else if (uEffectMode == 5) {
    result = effectNeon(scaledUV, pixelIndex, pixelLocal);
  } else {
    result = effectHolographic(scaledUV, pixelIndex, pixelLocal);
  }

  // Apply brightness
  result.rgb *= uBrightness;

  // Edge darkening (view angle)
  float edgeFade = pow(abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 0.4);
  result.rgb *= mix(0.5, 1.0, edgeFade);

  gl_FragColor = result;
}
