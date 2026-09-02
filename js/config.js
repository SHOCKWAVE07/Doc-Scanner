/**
 * Document Scanner Configuration
 * Centralized configurable thresholds and algorithm parameters
 */

const SCANNER_CONFIG = {
  // Document Detection
  documentDetection: {
    minConfidence: 0.6,
    minAreaRatio: 0.12, // Minimum 12% of image area
    // A contour must also look like a convex, four-sided document rather than
    // merely being a large object in the camera view.
    minCornerAngle: 42,
    maxCornerAngle: 138,
    minSideRatio: 0.18,
    jscanifyTimeout: 5000,
  },

  // Quality Validation Thresholds
  quality: {
    blurThreshold: 100, // Laplacian variance threshold
    readabilityThreshold: 0.6, // 0-1 scale
    focusThreshold: 80,
    noiseThreshold: 0.7,
    minBrightness: 30,
    maxBrightness: 225,
    minContrast: 20,
  },

  // Auto Capture Stability
  stability: {
    requiredFrames: 5, // Number of consecutive good frames needed
    frameCheckInterval: 100, // ms between checks
    maxDeviation: 15, // pixels max movement between frames
  },

  // Image Processing
  imageProcessing: {
    maxPreviewResolution: 1024, // For live detection
    maxOutputResolution: 1800,
    jpegQualityRaw: 0.95,
    jpegQualityOptimized: 0.78,
  },

  // Enhancement Settings
  enhancement: {
    unsharpMaskingStrength: 1.45,
    unsharpMaskingBlur: 0.45,
    enableShadowRemoval: true,
    enableNoiseReduction: true,
  },

  // Compression Profiles
  compressionProfiles: {
    highQuality: {
      jpegQuality: 0.92,
      resizeThreshold: 2400,
      label: "High Quality",
      description: "Maximum readability, larger file size",
    },
    balanced: {
      jpegQuality: 0.78,
      resizeThreshold: 1800,
      label: "Balanced",
      description: "Good readability and reasonable file size",
    },
    smallSize: {
      jpegQuality: 0.60,
      resizeThreshold: 1200,
      label: "Small Size",
      description: "Reduced file size, acceptable readability",
    },
  },

  // OCR Settings
  ocr: {
    language: "eng",
    preprocessingEnabled: true,
    confidenceThreshold: 0.5,
  },

  // Orientation Detection
  orientation: {
    autoDetectEnabled: true,
    autoRotateEnabled: true,
    rotationThreshold: 0.7, // Confidence threshold for rotation
  },

  // Scan Modes
  scanModes: {
    document: {
      label: "Document",
      ocrEnabled: true,
      enhancementProfile: "balanced",
      compressionProfile: "balanced",
      qualityThreshold: 0.7,
      orientationDetection: true,
    },
    book: {
      label: "Book",
      ocrEnabled: true,
      enhancementProfile: "balanced",
      compressionProfile: "balanced",
      qualityThreshold: 0.65,
      orientationDetection: false, // Books may have text in any orientation
      pageMargin: 20,
    },
    idCard: {
      label: "ID Card",
      ocrEnabled: true,
      enhancementProfile: "highQuality",
      compressionProfile: "highQuality",
      qualityThreshold: 0.8,
      orientationDetection: true,
    },
    passport: {
      label: "Passport",
      ocrEnabled: true,
      enhancementProfile: "highQuality",
      compressionProfile: "highQuality",
      qualityThreshold: 0.8,
      orientationDetection: true,
    },
    whiteboard: {
      label: "Whiteboard",
      ocrEnabled: true,
      enhancementProfile: "highQuality",
      compressionProfile: "smallSize",
      qualityThreshold: 0.6,
      orientationDetection: true,
      glareRemoval: true,
      contrastBoost: 1.3,
    },
    photograph: {
      label: "Photograph",
      ocrEnabled: false,
      enhancementProfile: "balanced",
      compressionProfile: "highQuality",
      qualityThreshold: 0.5,
      orientationDetection: true,
      preserveColors: true,
    },
  },

  // PDF Settings
  pdf: {
    pageFormat: "a4",
    orientation: "portrait",
    margin: 8, // mm
    compress: true,
    searchableTextEnabled: true,
  },

  // Logging
  logging: {
    enabled: true,
    level: "info", // "debug", "info", "warn", "error"
  },
};

// Freeze to prevent accidental modifications
Object.freeze(SCANNER_CONFIG);
Object.freeze(SCANNER_CONFIG.quality);
Object.freeze(SCANNER_CONFIG.stability);
Object.freeze(SCANNER_CONFIG.imageProcessing);
Object.freeze(SCANNER_CONFIG.enhancement);
Object.freeze(SCANNER_CONFIG.compressionProfiles);
