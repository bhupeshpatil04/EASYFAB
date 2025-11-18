
# Tube Joint Visualizer v1.1

## What I added in v1.1
- Drag to move tubes on the ground plane (click an object and drag)
- Simple camera orbit controls (left-drag rotate, right-drag pan, wheel zoom)
- Snap-to-angle toggle (45° increments when applying rotation)
- Wireframe view toggle
- Joint preview: detects bounding-box intersection and highlights intersection region
- Undo / Redo stack (basic)
- Duplicate & remove selected tube
- Clean folder structure, changelog, and instructions

## Setup (development)
1. Install Node.js (v18+ recommended)
2. In the project root run:
```
npm install
```
3. Run the app:
```
npm start
```

## Packaging (outline)
This project is prepared to be packaged with electron-packager or electron-builder.
Example (install electron-packager globally or as devDep):
```
npm install --save-dev electron-packager
npx electron-packager . tube-joint-visualizer --platform=win32 --arch=x64 --out=dist --overwrite
```
Or use electron-builder for more production-ready packaging. After packaging, the executable will be in the `dist/` folder (or in the platform-specific output).
