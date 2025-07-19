# NADIALEEKA - Face Detection & Portrait Grid

A web-based face detection and portrait compositing system using ml5.js and p5.js.

## 🎯 Features

- **Real-time face detection** using ml5.js faceMesh
- **20x30 portrait grid** (600 different face positions)
- **Image compositing** with background and face overlays
- **Blinking simulation** with random timing
- **Debug overlay** with real-time information
- **Keyboard controls** for toggling features

## 📁 File Structure

```
online/
├── index.html          # Main HTML file
├── sketch.js           # p5.js sketch with face detection
├── images/
│   ├── bg.webp        # Background image
│   ├── face_grid/     # 600 face images (0_0.webp to 19_29.webp)
│   └── blink_grid/    # 600 blink images (0_0.webp to 19_29.webp)
└── README.md          # This file
```

## 🚀 How to Use

### Option 1: Local Server (Recommended)
1. **Start the server**: Run `./start_server.sh` or `python3 server.py` from the `online` directory
2. **Open in browser**: Go to `http://localhost:8000`
3. **Allow camera access**: When prompted, allow the browser to access your camera
4. **Move your face**: The system will track your face and map it to the 20x30 grid
5. **Watch the composite**: Your face will be replaced with the corresponding portrait image
6. **Use controls**: 
   - Press `D` to toggle debug overlay
   - Press `C` to toggle composite image

### Option 2: Direct File Access (Limited)
1. **Open the app**: Double-click `index.html` or open in a web browser
2. **Note**: You may see CORS errors and images may not load properly
3. **Face detection will still work** but portrait compositing may be limited

## 🎮 Controls

- **D key**: Toggle debug information overlay
- **C key**: Toggle composite image display
- **Mouse**: Move your face around to see different portrait positions

## 📊 Grid System

- **Grid Size**: 20 columns × 30 rows = 600 positions
- **Face Mapping**: Your face position is mapped to the nearest grid cell
- **Image Loading**: All 600 face images and 600 blink images are loaded automatically
- **Blinking**: Random blinking simulation every 2-5 seconds

## 🔧 Technical Details

- **Face Detection**: ml5.js faceMesh for accurate face tracking
- **Image Processing**: p5.js for real-time compositing
- **Grid Mapping**: Face position converted to 20x30 grid coordinates
- **Compositing**: Background + face image overlay based on grid position

## 🎨 Customization

To customize the system:

1. **Replace background**: Change `images/bg.webp`
2. **Replace face images**: Update images in `images/face_grid/`
3. **Replace blink images**: Update images in `images/blink_grid/`
4. **Adjust grid size**: Modify `GRID_WIDTH` and `GRID_HEIGHT` in sketch.js
5. **Change face size**: Modify the face image dimensions in `updateComposite()`

## 🐛 Troubleshooting

### CORS Issues (Most Common)
- **"Failed to fetch" errors**: This is a CORS (Cross-Origin Resource Sharing) issue
- **Solution**: Use the local server instead of opening the file directly
- **Run**: `./start_server.sh` or `python3 server.py` from the `online` directory
- **Access**: Go to `http://localhost:8000` in your browser

### Other Issues
- **Camera not working**: Make sure to allow camera access in your browser
- **Images not loading**: Check that all image files exist in the correct folders
- **Face detection slow**: The system may take a moment to load the face detection models
- **No composite showing**: Press `C` to toggle composite display
- **Server won't start**: Make sure Python 3 is installed and port 8000 is available

## 📝 Notes

- All images should be in WebP format for best performance
- Face images should be named `X_Y.webp` where X=0-19, Y=0-29
- The system works best with good lighting and a clear view of your face
- Performance may vary depending on your device and browser 