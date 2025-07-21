/*
 * 👋 Hello! This is an ml5.js example made and shared with ❤️.
 * Learn more about the ml5.js project: https://ml5js.org/
 * ml5.js license and Code of Conduct: https://github.com/ml5js/ml5-next-gen/blob/main/LICENSE.md
 *
 * This example demonstrates bounding box facial tracking on live video through ml5.faceMesh.
 * Adapted to include portrait grid compositing system.
 */

let faceMesh;
let video;
let faces = [];
let options = { maxFaces: 1, refineLandmarks: false, flipHorizontal: false };

// Mobile detection and optimizations
let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
let loadingScreen = null;
let loadingState = 'initializing'; // 'initializing', 'camera', 'facemesh', 'ready', 'error'

// Grid system variables
let bgImage;
let faceImages = [];
let blinkImages = [];
let currentComposite;
let showDebug = false;
let showComposite = true;
let faceDetected = false;
let facePosition = { x: 0, y: 0 };
let gridPosition = { x: 0, y: 0 };
let lastGridPosition = { x: 0, y: 0 };
let isBlinking = false;
let frameCount = 0;
let lastBlinkTime = 0;
let imagesLoaded = false;
let faceDetectionBuffer = [];
let bufferSize = 5;
let lastFaceTime = 0;
let faceTimeout = 1000; // 1 second timeout
let bgExposure = 1.025; // Background exposure multiplier (1.0 = normal, 0.5 = darker, 2.0 = brighter)

// Preview interaction variables
let previewX = 20;
let previewY = 120; // Position under the debug text
let previewSize = 150; // Half the original 300px size
let isDragging = false;
let isResizing = false;
let dragStartX = 0;
let dragStartY = 0;
let resizeStartX = 0;
let resizeStartY = 0;
let originalPreviewX = 0;
let originalPreviewY = 0;
let originalPreviewSize = 150;

// Grid settings (20x30 as specified)
const GRID_WIDTH = 20;   // X coordinates: 0-19
const GRID_HEIGHT = 30;  // Y coordinates: 0-29

// Fixed face position for compositing (like in Python script)
// Original position from Python script
const FACE_POSITION = { x: 414, y: 193 };

function preload() {
  faceMesh = ml5.faceMesh(options, modelReady);
  
  // Load background image with error handling
  try {
    bgImage = loadImage('images/bg.webp', 
      // Success callback
      () => {
        console.log('Background loaded successfully');
        console.log('Background size:', bgImage.width, 'x', bgImage.height);
        
        // Canvas is already full window size from setup()
        console.log('INITIAL LOAD - Canvas already full window size:', width, 'x', height);
      },
      // Error callback
      (err) => {
        console.log('Failed to load background image:', err);
        bgImage = null;
      }
    );
  } catch (e) {
    console.log('Error loading background:', e);
    bgImage = null;
  }
  
  // Load face images (0-599) with correct naming format and error handling
  for (let y = 0; y < 30; y++) {
    for (let x = 0; x < 20; x++) {
      const index = y * 20 + x;
      const imageName = `${x}_${y}.webp`;
      
      try {
        faceImages[index] = loadImage(`images/face_grid/${imageName}`,
          // Success callback
          () => {
            if (index === 599) { // Last image loaded
              console.log('All face images loaded successfully');
              imagesLoaded = true;
            }
          },
          // Error callback
          (err) => {
            console.log(`Failed to load face image ${imageName}:`, err);
            faceImages[index] = null;
          }
        );
        
        blinkImages[index] = loadImage(`images/blink_grid/${imageName}`,
          // Success callback
          () => {
            if (index === 599) { // Last image loaded
              console.log('All blink images loaded successfully');
            }
          },
          // Error callback
          (err) => {
            console.log(`Failed to load blink image ${imageName}:`, err);
            blinkImages[index] = null;
          }
        );
      } catch (e) {
        console.log(`Error loading images for ${imageName}:`, e);
        faceImages[index] = null;
        blinkImages[index] = null;
      }
    }
  }
}

function setup() {
  // Get loading screen element
  loadingScreen = document.getElementById('loading');
  
  // Create canvas with full window size from the start
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  createCanvas(windowWidth, windowHeight);
  
  // No need for browser fullscreen event listeners - we'll use p5.js fullscreen

  // Mobile-optimized video capture
  let videoConstraints = {
    video: {
      width: { ideal: isMobile ? 640 : 800 },
      height: { ideal: isMobile ? 480 : 600 },
      facingMode: 'user'
    }
  };
  
  video = createCapture(VIDEO, videoConstraints);
  video.size(isMobile ? 640 : 800, isMobile ? 480 : 600);
  video.hide();

  // Add error handling for video capture
  video.elt.addEventListener('loadedmetadata', () => {
    console.log('Video loaded successfully');
    loadingState = 'camera';
    updateLoadingProgress('Camera ready, starting face detection...');
    
    // Start face detection with timeout
    try {
      faceMesh.detectStart(video, gotFaces);
      loadingState = 'facemesh';
      updateLoadingProgress('Face detection started');
      
      // Set a timeout to hide loading screen even if face detection is slow
      setTimeout(() => {
        if (loadingState === 'facemesh' && loadingScreen) {
          console.log('Face detection timeout - hiding loading screen anyway');
          loadingState = 'ready';
          loadingScreen.classList.add('hidden');
        }
      }, 5000); // 5 second timeout
      
    } catch (error) {
      console.error('Face detection error:', error);
      loadingState = 'error';
      updateLoadingProgress('Face detection failed');
    }
  });
  
  video.elt.addEventListener('error', (error) => {
    console.error('Video capture error:', error);
    loadingState = 'error';
    if (loadingScreen) {
      loadingScreen.innerHTML = '<div style="color: #ff6b6b;">Camera access denied or not available</div>';
    }
  });

  // Start face detection with error handling
  try {
    faceMesh.detectStart(video, gotFaces);
    console.log('Face detection started');
  } catch (error) {
    console.error('Face detection error:', error);
    if (loadingScreen) {
      loadingScreen.innerHTML = '<div style="color: #ff6b6b;">Face detection failed to initialize</div>';
    }
  }
}

function draw() {
  background(0);
  frameCount++;
  
  // Mobile performance optimization - reduce processing frequency
  if (isMobile && frameCount % 2 !== 0) {
    // Skip every other frame on mobile for better performance
    return;
  }
  
  // Check if we're in fullscreen mode using p5.js
  const isFullscreen = fullscreen();
  
  // Debug fullscreen info
  if (isFullscreen && frameCount % 60 === 0) {
    console.log('Fullscreen debug:', {
      canvasSize: `${width}x${height}`,
      screenSize: `${window.screen.width}x${window.screen.height}`,
      windowSize: `${windowWidth}x${windowHeight}`,
      isFullscreen: isFullscreen
    });
  }
  
  // Draw composite image as the main focus (large and prominent)
  // Keep showing the last composite even when face detection is lost
  if (showComposite && currentComposite) {
    if (isFullscreen) {
      // In fullscreen mode, simply stretch the composite to fill the entire screen
      image(currentComposite, 0, 0, width, height);
      console.log('Stretched composite to fill fullscreen');
      
      // Log background scaling every frame in fullscreen
      const bgScaleX = width / bgImage.width;
      const bgScaleY = height / bgImage.height;
      console.log('=== FULLSCREEN BACKGROUND SCALING ===');
      console.log('Canvas size:', width, 'x', height);
      console.log('Background original:', bgImage.width, 'x', bgImage.height);
      console.log('Background scaling factors:', bgScaleX, 'x', bgScaleY);
      console.log('Background is stretched to:', width, 'x', height);
    } else {
      // Normal mode - display as usual
      image(currentComposite, 0, 0, width, height);
    }
  }
  // Removed the "Composite missing!" message - composite will be created when face is detected
  
  // Draw camera preview overlay in debug mode
  if (showDebug) {
    // Use draggable preview position and size
    const currentPreviewSize = isFullscreen ? 200 : previewSize;
    const currentPreviewX = isFullscreen ? width - currentPreviewSize - 20 : previewX;
    const currentPreviewY = isFullscreen ? 20 : previewY;
    
    // Draw camera preview with mirroring
    push();
    translate(currentPreviewX + currentPreviewSize, currentPreviewY);
    scale(-1, 1);
    image(video, 0, 0, currentPreviewSize, currentPreviewSize * 0.75);
    pop();
    
    // Draw border around preview
    stroke(0, 255, 0);
    strokeWeight(2);
    noFill();
    rect(currentPreviewX, currentPreviewY, currentPreviewSize, currentPreviewSize * 0.75);
    
    // Draw resize handle (small square in bottom-right corner)
    if (!isFullscreen) {
      fill(0, 255, 0);
      noStroke();
      rect(currentPreviewX + currentPreviewSize - 10, currentPreviewY + currentPreviewSize * 0.75 - 10, 10, 10);
    }
  }
  
  // Process face detection and update grid position with smoothing
  if (faces.length > 0) {
    let face = faces[0];
    let centerX = (face.box.xMin + face.box.xMax) / 2;
    let centerY = (face.box.yMin + face.box.yMax) / 2;
    
    // Convert to normalized position (0-1)
    facePosition.x = centerX / width;
    facePosition.y = centerY / height;
    
    // Convert to grid position with correct axis mapping
    // Y position (up/down) controls X grid (yaw): top = low grid X, bottom = high grid X (inverted)
    let newGridX = Math.floor(facePosition.y * GRID_WIDTH);
    // X position (left/right) controls Y grid (pitch): left = high grid Y, right = low grid Y
    let newGridY = Math.floor((1 - facePosition.x) * GRID_HEIGHT);
    
    // Clamp grid position
    newGridX = constrain(newGridX, 0, GRID_WIDTH - 1);
    newGridY = constrain(newGridY, 0, GRID_HEIGHT - 1);
    
    // Add to buffer for smoothing
    faceDetectionBuffer.push({ x: newGridX, y: newGridY });
    if (faceDetectionBuffer.length > bufferSize) {
      faceDetectionBuffer.shift();
    }
    
    // Calculate smoothed grid position
    if (faceDetectionBuffer.length > 0) {
      let avgX = 0, avgY = 0;
      for (let pos of faceDetectionBuffer) {
        avgX += pos.x;
        avgY += pos.y;
      }
      gridPosition.x = Math.round(avgX / faceDetectionBuffer.length);
      gridPosition.y = Math.round(avgY / faceDetectionBuffer.length);
    }
    
    faceDetected = true;
    lastFaceTime = millis();
    
    // Only update composite if grid position changed significantly
    if (abs(gridPosition.x - lastGridPosition.x) > 0 || abs(gridPosition.y - lastGridPosition.y) > 0) {
      lastGridPosition.x = gridPosition.x;
      lastGridPosition.y = gridPosition.y;
      updateComposite();
    } else if (!currentComposite) {
      // Ensure we have a composite even if position didn't change
      updateComposite();
    }
    
    // Always ensure we have a composite when face is detected
    if (!currentComposite) {
      console.log('Creating composite - face detected but no composite');
      updateComposite();
    }
    
    // Update blinking
    const wasBlinking = isBlinking;
    updateBlinking();
    
    // Update composite if blinking state changed
    if (wasBlinking !== isBlinking) {
      updateComposite();
    }
  } else {
    // Keep the last composite visible even when face detection is lost
    // Don't clear the composite, just keep showing the last one
    faceDetected = false;
    faceDetectionBuffer = []; // Clear buffer when face is lost
    
    // Debug: Log when face is lost but composite should stay
    if (currentComposite) {
      console.log('Face lost but keeping composite');
    } else {
      console.log('Face lost and no composite available');
    }
  }

  // Draw the faces' bounding boxes on the preview overlay
  if (showDebug) {
    for (let i = 0; i < faces.length; i++) {
      let face = faces[i];
      let x = face.box.xMin;
      let y = face.box.yMin;
      let w = face.box.width;
      let h = face.box.height;
      let centerX = (face.box.xMin + face.box.xMax) / 2;
      let centerY = (face.box.yMin + face.box.yMax) / 2;

      // Scale coordinates to match the draggable preview overlay (mirrored)
      const currentPreviewSize = isFullscreen ? 200 : previewSize;
      const currentPreviewX = isFullscreen ? width - currentPreviewSize - 20 : previewX;
      const currentPreviewY = isFullscreen ? 20 : previewY;
      const scaleX = currentPreviewSize / video.width;
      const scaleY = (currentPreviewSize * 0.75) / video.height;
      
      // Mirror the coordinates for the flipped preview
      const previewX_scaled = currentPreviewX + currentPreviewSize - (x * scaleX) - (w * scaleX);
      const previewY_scaled = currentPreviewY + (y * scaleY);
      const previewW_scaled = w * scaleX;
      const previewH_scaled = h * scaleY;
      const previewCenterX_scaled = currentPreviewX + currentPreviewSize - (centerX * scaleX);
      const previewCenterY_scaled = currentPreviewY + (centerY * scaleY);

      // Draw bounding box on the preview overlay
      stroke(0, 255, 0);
      strokeWeight(2);
      fill(0, 255, 0, 50);
      rect(previewX_scaled, previewY_scaled, previewW_scaled, previewH_scaled);
      
      // Draw face index
      fill(255);
      textSize(12);
      textAlign(LEFT, TOP);
      text(i, previewX_scaled, previewY_scaled - 15);

      // Draw the center of the face
      noStroke();
      fill(255, 0, 0);
      circle(previewCenterX_scaled, previewCenterY_scaled, 8);
      
      // Draw debug info in top-left corner
      fill(255);
      textSize(isFullscreen ? 16 : 14);
      textAlign(LEFT, TOP);
      text(`Grid: (${gridPosition.x}, ${gridPosition.y})`, 20, 20);
      text(`Face: (${facePosition.x.toFixed(2)}, ${facePosition.y.toFixed(2)})`, 20, 40);
      text(`Blinking: ${isBlinking ? 'Yes' : 'No'}`, 20, 60);
      text(`BG Exposure: ${bgExposure.toFixed(2)}`, 20, 80);
      text(`Canvas: ${width}x${height}`, 20, 100);
      if (isFullscreen) {
        text(`Fullscreen: Stretched`, 20, 120);
      }
    }
  }
}

function modelReady() {
  console.log('FaceMesh model is ready!');
  loadingState = 'model_ready';
  updateLoadingProgress('Face detection model loaded');
}

function updateLoadingProgress(message) {
  console.log('Loading progress:', message);
  if (loadingScreen) {
    loadingScreen.innerHTML = `
      <div style="text-align: center; padding: 20px;">
        <div style="margin-bottom: 10px;">${message}</div>
        <div style="color: #666; font-size: 12px;">Please allow camera access when prompted</div>
      </div>
    `;
  }
}

function gotFaces(results) {
  faces = results;
  
  // Hide loading screen when face detection is working
  if (loadingState === 'facemesh' && loadingScreen) {
    loadingState = 'ready';
    loadingScreen.classList.add('hidden');
    console.log('Face detection ready, hiding loading screen');
  }
  
  // Mobile error handling
  if (isMobile && !results) {
    console.log('No face detection results on mobile - this is normal');
  }
}

function updateComposite() {
  // Create composite image
  let composite = createGraphics(width, height);
  
  // Check if we're in fullscreen mode using p5.js
  const isFullscreen = fullscreen();
  
  // Draw background if available
  if (bgImage) {
    if (isFullscreen) {
      // In fullscreen mode, stretch background to fill entire canvas (disregard aspect ratio)
      composite.image(bgImage, 0, 0, width, height);
      
      // Log the actual background scaling in fullscreen
      const bgScaleX = width / bgImage.width;
      const bgScaleY = height / bgImage.height;
      console.log('=== FULLSCREEN BACKGROUND SCALING ===');
      console.log('Canvas size:', width, 'x', height);
      console.log('Background original:', bgImage.width, 'x', bgImage.height);
      console.log('Background scaling factors:', bgScaleX, 'x', bgScaleY);
      console.log('Background is stretched to:', width, 'x', height);
      
      // Apply exposure adjustment if needed
      if (bgExposure !== 1.0) {
        // Apply exposure adjustment like Python version
        composite.loadPixels();
        let pixels = composite.pixels;
        
        // Apply exposure multiplier to each pixel
        for (let i = 0; i < pixels.length; i += 4) {
          pixels[i] = constrain(pixels[i] * bgExposure, 0, 255);     // R
          pixels[i + 1] = constrain(pixels[i + 1] * bgExposure, 0, 255); // G
          pixels[i + 2] = constrain(pixels[i + 2] * bgExposure, 0, 255); // B
        }
        
        composite.updatePixels();
      }
    } else {
      // Normal mode - fill entire canvas while respecting aspect ratio and centering
      const bgAspectRatio = bgImage.width / bgImage.height;
      const canvasAspectRatio = width / height;
      
      let bgWidth, bgHeight, bgX, bgY;
      
      if (bgAspectRatio > canvasAspectRatio) {
        // Background is wider than canvas - fit to width and center vertically
        bgWidth = width;
        bgHeight = width / bgAspectRatio;
        bgX = 0;
        bgY = (height - bgHeight) / 2; // Center vertically
      } else {
        // Background is taller than canvas - fit to height and center horizontally
        bgHeight = height;
        bgWidth = height * bgAspectRatio;
        bgX = (width - bgWidth) / 2; // Center horizontally
        bgY = 0;
      }
      
      // Log the actual displayed background size
      console.log('Original bg size:', bgImage.width, 'x', bgImage.height);
      console.log('Displayed bg size:', bgWidth, 'x', bgHeight);
      console.log('Displayed bg position:', bgX, ',', bgY);
      console.log('Canvas size:', width, 'x', height);
      
      // Draw background with proper aspect ratio and exposure adjustment
      if (!isMobile) {
        console.log('Applying background exposure:', bgExposure);
      }
      
      if (bgExposure !== 1.0) {
        // Apply exposure adjustment like Python version
        // Create a temporary graphics buffer for the background
        let bgBuffer = createGraphics(bgWidth, bgHeight);
        bgBuffer.image(bgImage, 0, 0, bgWidth, bgHeight);
        
        // Get the pixel data
        bgBuffer.loadPixels();
        let pixels = bgBuffer.pixels;
        
        // Apply exposure adjustment to each pixel (like Python numpy operations)
        for (let i = 0; i < pixels.length; i += 4) {
          // Apply exposure multiplier to RGB values
          pixels[i] = constrain(pixels[i] * bgExposure, 0, 255);     // R
          pixels[i + 1] = constrain(pixels[i + 1] * bgExposure, 0, 255); // G
          pixels[i + 2] = constrain(pixels[i + 2] * bgExposure, 0, 255); // B
          // Alpha channel (i + 3) remains unchanged
        }
        
        // Update the buffer with adjusted pixels
        bgBuffer.updatePixels();
        
        // Draw the adjusted background
        composite.image(bgBuffer, bgX, bgY);
        if (!isMobile) {
          console.log('Applied exposure adjustment with pixel manipulation');
        }
      } else {
        // Draw background normally if no exposure adjustment
        composite.image(bgImage, bgX, bgY, bgWidth, bgHeight);
        if (!isMobile) {
          console.log('Drew background without exposure adjustment');
        }
      }
    }
  } else {
    // Fallback: draw a colored background
    composite.background(100, 150, 200);
    composite.fill(255);
    composite.textSize(16);
    composite.textAlign(CENTER, CENTER);
    composite.text('Images not loaded - CORS issue detected', width/2, height/2);
    composite.text('Use a local server or check image paths', width/2, height/2 + 30);
  }
  
  // Only try to draw face if images are loaded
  if (faceImages.length > 0 && faceImages[0]) {
    // Calculate face image index
    const faceIndex = gridPosition.y * GRID_WIDTH + gridPosition.x;
    const faceImage = isBlinking ? blinkImages[faceIndex] : faceImages[faceIndex];
    
    if (faceImage) {
      if (isFullscreen) {
        // In fullscreen mode, background is stretched to fill entire canvas
        // So we need to scale face overlay to match the stretched background
        const scaleX = width / bgImage.width;  // How much wider the canvas is than original bg
        const scaleY = height / bgImage.height; // How much taller the canvas is than original bg
        
        // Face overlay - scale both size and position by the fullscreen stretch factors
        const originalFaceSize = 455; // Actual face image size
        // Scale face size by both X and Y factors to maintain proportions
        const faceSizeX = originalFaceSize * scaleX;
        const faceSizeY = originalFaceSize * scaleY;
        
        // Scale FACE_POSITION by both X and Y factors to match stretched background
        const faceX = FACE_POSITION.x * scaleX;
        const faceY = FACE_POSITION.y * scaleY;
        
        // Draw face image at scaled position with proper X and Y dimensions
        composite.image(faceImage, faceX, faceY, faceSizeX, faceSizeY);
        
        console.log('=== FULLSCREEN MODE ===');
        console.log('Canvas dimensions:', width, 'x', height);
        console.log('Background original size:', bgImage.width, 'x', bgImage.height);
        console.log('Fullscreen stretch factors - scaleX:', scaleX, 'scaleY:', scaleY);
        console.log('Original face position:', FACE_POSITION.x, FACE_POSITION.y);
        console.log('Scaled face position:', faceX, faceY);
        console.log('Original face size:', originalFaceSize);
        console.log('Scaled face size X:', faceSizeX, 'Y:', faceSizeY);
        console.log('Face overlay final:', faceX, faceY, faceSizeX, faceSizeY);
      } else {
        // Normal mode - use aspect ratio scaling
        const bgAspectRatio = bgImage.width / bgImage.height;
        const canvasAspectRatio = width / height;
        
        let bgWidth, bgHeight, bgX, bgY;
        
        if (bgAspectRatio > canvasAspectRatio) {
          // Background is wider than canvas - fit to width
          bgWidth = width;
          bgHeight = width / bgAspectRatio;
          bgX = 0;
          bgY = (height - bgHeight) / 2;
        } else {
          // Background is taller than canvas - fit to height
          bgHeight = height;
          bgWidth = height * bgAspectRatio;
          bgX = (width - bgWidth) / 2;
          bgY = 0;
        }
        
        const scaleX = bgWidth / bgImage.width;
        const scaleY = bgHeight / bgImage.height;
        
        // Face overlay - scale to match the filled background
        const originalFaceSize = 455; // Actual face image size
        const faceSize = originalFaceSize * scaleX; // Scale with background
        
        // Scale FACE_POSITION relative to the filled and centered background
        const faceX = bgX + (FACE_POSITION.x * scaleX);
        const faceY = bgY + (FACE_POSITION.y * scaleY);
        
        // Draw face image at scaled position
        composite.image(faceImage, faceX, faceY, faceSize, faceSize);
        
        console.log('=== NORMAL MODE ===');
        console.log('Canvas dimensions:', width, 'x', height);
        console.log('Background original size:', bgImage.width, 'x', bgImage.height);
        console.log('Background displayed size:', bgWidth, 'x', bgHeight);
        console.log('Background position:', bgX, bgY);
        console.log('Scaling factors - scaleX:', scaleX, 'scaleY:', scaleY);
        console.log('Original face position:', FACE_POSITION.x, FACE_POSITION.y);
        console.log('Scaled face position:', faceX, faceY);
        console.log('Original face size:', originalFaceSize);
        console.log('Scaled face size:', faceSize);
        console.log('Face overlay final:', faceX, faceY, faceSize, faceSize);
      }
    }
  }
  
  currentComposite = composite;
}

function updateBlinking() {
  const now = millis();
  
  // If not currently blinking, check if it's time to start
  if (!isBlinking) {
    if (now - lastBlinkTime > 3000) { // Fixed interval instead of random
      isBlinking = true;
      lastBlinkTime = now;
      console.log('Blinking started');
    }
  } else {
    // If currently blinking, check if it's time to stop
    if (now - lastBlinkTime > 200) { // Fixed blink duration
      isBlinking = false;
      console.log('Blinking stopped');
    }
  }
}

// Keyboard controls
function keyPressed() {
  if (key === 'd' || key === 'D') {
    showDebug = !showDebug;
  }
  if (key === 'c' || key === 'C') {
    showComposite = !showComposite;
  }
  // Fullscreen toggle
  if (key === 'f' || key === 'F') {
    toggleFullscreen();
  }
  // p5.js handles Escape key automatically for fullscreen
  // Background exposure controls
  if (key === '=' || key === '+') {
    bgExposure = constrain(bgExposure + 0.01, 0.1, 2.0);
    console.log('Background exposure:', bgExposure);
    updateComposite(); // Update composite with new exposure
  }
  if (key === '-' || key === '_') {
    bgExposure = constrain(bgExposure - 0.01, 0.1, 2.0);
    console.log('Background exposure:', bgExposure);
    updateComposite(); // Update composite with new exposure
  }
  if (key === '0') {
    bgExposure = 1.0; // Reset to normal exposure
    console.log('Background exposure reset to:', bgExposure);
    updateComposite(); // Update composite with new exposure
  }
}

// Fullscreen toggle function using p5.js
function toggleFullscreen() {
  if (!fullscreen()) {
    // Enter fullscreen
    fullscreen(true);
    console.log('Entering p5.js fullscreen mode');
    
    // Resize canvas to fill entire screen
    setTimeout(() => {
      const screenWidth = window.screen.width;
      const screenHeight = window.screen.height;
      resizeCanvas(screenWidth, screenHeight);
      console.log('Canvas resized for fullscreen:', screenWidth, 'x', screenHeight);
    }, 100);
  } else {
    // Exit fullscreen
    fullscreen(false);
    console.log('Exiting p5.js fullscreen mode');
    
    // Resize canvas back to window size
    setTimeout(() => {
      resizeCanvasToWindow();
    }, 100);
  }
}

// Resize canvas to fit window size
function resizeCanvasToWindow() {
  // Use full window size for canvas
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  
  resizeCanvas(windowWidth, windowHeight);
  console.log('Canvas resized to full window size:', windowWidth, 'x', windowHeight);
}

// Window resize handler - adapt canvas to window size
function windowResized() {
  // Don't resize if in fullscreen mode
  if (fullscreen()) {
    return;
  }
  
  // Use the helper function to resize canvas
  resizeCanvasToWindow();
}

// Mouse interaction functions for preview
function mousePressed() {
  if (!showDebug || fullscreen()) return;
  
  const currentPreviewSize = previewSize;
  const currentPreviewX = previewX;
  const currentPreviewY = previewY;
  
  // Check if mouse is over the preview
  if (mouseX >= currentPreviewX && mouseX <= currentPreviewX + currentPreviewSize &&
      mouseY >= currentPreviewY && mouseY <= currentPreviewY + currentPreviewSize * 0.75) {
    
    // Check if mouse is over resize handle
    if (mouseX >= currentPreviewX + currentPreviewSize - 10 && 
        mouseY >= currentPreviewY + currentPreviewSize * 0.75 - 10) {
      isResizing = true;
      resizeStartX = mouseX;
      resizeStartY = mouseY;
      originalPreviewSize = currentPreviewSize;
    } else {
      isDragging = true;
      dragStartX = mouseX - currentPreviewX;
      dragStartY = mouseY - currentPreviewY;
      originalPreviewX = currentPreviewX;
      originalPreviewY = currentPreviewY;
    }
  }
}

function mouseDragged() {
  if (!showDebug || fullscreen()) return;
  
  if (isDragging) {
    previewX = mouseX - dragStartX;
    previewY = mouseY - dragStartY;
    
    // Keep preview within canvas bounds
    previewX = constrain(previewX, 0, width - previewSize);
    previewY = constrain(previewY, 0, height - previewSize * 0.75);
  }
  
  if (isResizing) {
    const deltaX = mouseX - resizeStartX;
    const deltaY = mouseY - resizeStartY;
    const newSize = originalPreviewSize + max(deltaX, deltaY);
    
    // Constrain size between 100 and 500
    previewSize = constrain(newSize, 100, 500);
    
    // Keep preview within canvas bounds
    previewX = constrain(previewX, 0, width - previewSize);
    previewY = constrain(previewY, 0, height - previewSize * 0.75);
  }
}

function mouseReleased() {
  isDragging = false;
  isResizing = false;
}
