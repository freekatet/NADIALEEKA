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
  
  // Mobile-optimized canvas size
  let canvasWidth, canvasHeight;
  if (isMobile) {
    // Use smaller canvas on mobile for better performance
    canvasWidth = min(800, windowWidth);
    canvasHeight = min(600, windowHeight);
    console.log('Mobile detected, using canvas size:', canvasWidth, 'x', canvasHeight);
  } else {
    canvasWidth = 800;
    canvasHeight = 600;
  }
  
  createCanvas(canvasWidth, canvasHeight);

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
  
  // Draw composite image as the main focus (large and prominent)
  // Keep showing the last composite even when face detection is lost
  if (showComposite && currentComposite) {
    image(currentComposite, 0, 0, width, height);
  }
  // Removed the "Composite missing!" message - composite will be created when face is detected
  
  // Draw small webcam preview in corner (mirrored)
  const previewSize = 200;
  const previewX = width - previewSize - 10;
  const previewY = 10;
  
  // Draw webcam video in small corner with horizontal flip
  // push();
  // translate(previewX + previewSize, previewY);
  // scale(-1, 1);
  // image(video, 0, 0, previewSize, previewSize * 0.75);
  // pop();

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

  // Draw the faces' bounding boxes on the small preview
  if (showDebug) {
    for (let i = 0; i < faces.length; i++) {
      let face = faces[i];
      let x = face.box.xMin;
      let y = face.box.yMin;
      let w = face.box.width;
      let h = face.box.height;
      let centerX = (face.box.xMin + face.box.xMax) / 2;
      let centerY = (face.box.yMin + face.box.yMax) / 2;

      // Scale coordinates to match the small preview (mirrored)
      const scaleX = previewSize / video.width;
      const scaleY = (previewSize * 0.75) / video.height;
      
      // Mirror the coordinates for the flipped preview
      const previewX_scaled = previewX + previewSize - (x * scaleX) - (w * scaleX);
      const previewY_scaled = previewY + (y * scaleY);
      const previewW_scaled = w * scaleX;
      const previewH_scaled = h * scaleY;
      const previewCenterX_scaled = previewX + previewSize - (centerX * scaleX);
      const previewCenterY_scaled = previewY + (centerY * scaleY);

      push();
      translate(previewX + previewSize, previewY);
      scale(-1, 1);
      image(video, 0, 0, previewSize, previewSize * 0.75);
      pop();

      stroke(0, 255, 0);
      fill(0, 255, 0, 50);
      rect(previewX_scaled, previewY_scaled, previewW_scaled, previewH_scaled);
      text(i, previewX_scaled, previewY_scaled - 5);

      // Draw the center of the face
      noStroke();
      fill(255, 0, 0);
      circle(previewCenterX_scaled, previewCenterY_scaled, 5);
      
      // Draw grid position info in corner
      fill(255);
      textSize(10);
      text(`Grid: (${gridPosition.x}, ${gridPosition.y})`, 10, 20);
      text(`Face: (${facePosition.x.toFixed(2)}, ${facePosition.y.toFixed(2)})`, 10, 35);
      text(`Blinking: ${isBlinking ? 'Yes' : 'No'}`, 10, 50);
      text(`BG Exposure: ${bgExposure.toFixed(1)}`, 10, 65);
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
  
  // Draw background if available
  if (bgImage) {
          // Place background at (0,0) but maintain aspect ratio
      const bgAspectRatio = bgImage.width / bgImage.height;
      const canvasAspectRatio = width / height;
      
      let bgWidth, bgHeight, bgX, bgY;
      
      if (bgAspectRatio > canvasAspectRatio) {
        // Background is wider than canvas - fit to width
        bgWidth = width;
        bgHeight = width / bgAspectRatio;
        bgX = 0;
        bgY = 0; // Place at top instead of centering
      } else {
        // Background is taller than canvas - fit to height
        bgHeight = height;
        bgWidth = height * bgAspectRatio;
        bgX = 0; // Place at left instead of centering
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
      // Calculate scaled face position based on background scaling
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
      
      // Calculate scale factors
      const scaleX = bgWidth / bgImage.width;
      const scaleY = bgHeight / bgImage.height;
      
      console.log('Scale factors:', scaleX, scaleY);
      console.log('Original FACE_POSITION:', FACE_POSITION.x, FACE_POSITION.y);
      
      // Use original FACE_POSITION coordinates relative to the scaled background
      // Face images are 455×456 pixels, so scale them proportionally
      const originalFaceSize = 455; // Actual face image size
      const faceSize = originalFaceSize * scaleX; // Scale with background
      
      // Simply scale the FACE_POSITION by the scaling factors
      const faceX = FACE_POSITION.x * scaleX;
      const faceY = FACE_POSITION.y * scaleY;
      
      // Draw face image at scaled position
      composite.image(faceImage, faceX, faceY, faceSize, faceSize);
      
      console.log('Face overlay bounds:', faceX, faceY, faceSize, faceSize);
      console.log('Original face size:', originalFaceSize);
      console.log('Scaled face size:', faceSize);
      console.log('Background scale factors:', scaleX, scaleY);
      console.log('Face position relative to background:', FACE_POSITION.x * scaleX, FACE_POSITION.y * scaleY);
      console.log('Face position on canvas:', faceX + faceSize/2, faceY + faceSize/2);
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
  // Background exposure controls
  if (key === '=' || key === '+') {
    bgExposure = constrain(bgExposure + 0.1, 0.1, 5.0);
    console.log('Background exposure:', bgExposure);
    updateComposite(); // Update composite with new exposure
  }
  if (key === '-' || key === '_') {
    bgExposure = constrain(bgExposure - 0.1, 0.1, 5.0);
    console.log('Background exposure:', bgExposure);
    updateComposite(); // Update composite with new exposure
  }
  if (key === '0') {
    bgExposure = 1.0; // Reset to normal exposure
    console.log('Background exposure reset to:', bgExposure);
    updateComposite(); // Update composite with new exposure
  }
}

// Mobile-friendly window resize handler
function windowResized() {
  if (isMobile) {
    // On mobile, try to maintain aspect ratio
    let newWidth = min(800, windowWidth);
    let newHeight = min(600, windowHeight);
    resizeCanvas(newWidth, newHeight);
    console.log('Mobile canvas resized to:', newWidth, 'x', newHeight);
  }
}
