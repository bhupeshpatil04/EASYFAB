
// Basic Three.js scene and simple camera controls + object interactions
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdddddd);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 1, 5000);
camera.position.set(400,300,400);
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(100,200,100);
scene.add(light);
scene.add(new THREE.AmbientLight(0x888888));

// ground grid
const grid = new THREE.GridHelper(2000, 40, 0x888888, 0xcccccc);
scene.add(grid);

let tubes = [];
let selected = null;
let snapOn = true;
let wireframeOn = false;

// Undo / Redo stacks
const undoStack = [];
const redoStack = [];
function pushState() {
  const state = tubes.map(m => ({id: m.uuid, pos: m.position.clone(), rot: m.rotation.clone()}));
  undoStack.push(state);
  // limit size
  if (undoStack.length>50) undoStack.shift();
  // clear redo when new action
  redoStack.length = 0;
}
function restoreState(state) {
  state.forEach(s => {
    const m = scene.getObjectByProperty('uuid', s.id);
    if (m) {
      m.position.copy(s.pos);
      m.rotation.copy(s.rot);
    }
  });
}

function undo() {
  if (!undoStack.length) return;
  const state = undoStack.pop();
  // save current to redo
  const cur = tubes.map(m => ({id:m.uuid, pos:m.position.clone(), rot:m.rotation.clone()}));
  redoStack.push(cur);
  restoreState(state);
}
function redo() {
  if (!redoStack.length) return;
  const state = redoStack.pop();
  const cur = tubes.map(m => ({id:m.uuid, pos:m.position.clone(), rot:m.rotation.clone()}));
  undoStack.push(cur);
  restoreState(state);
}

// create tube mesh (simple hollow approximate by box geometry)
function createTubeMesh(w,h,t,l) {
  const outer = new THREE.BoxGeometry(w, h, l);
  const mat = new THREE.MeshPhongMaterial({shininess:50});
  const mesh = new THREE.Mesh(outer, mat);
  mesh.userData.params = {w: w, h: h, t: t, l: l};
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addTubeAt(x=0,y=0,z=0, w=20,h=20,t=2,l=100) {
  const mesh = createTubeMesh(w,h,t,l);
  mesh.position.set(x,y,z);
  scene.add(mesh);
  tubes.push(mesh);
  pushState();
  return mesh;
}

// Raycaster for interaction
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0,1,0), 0); // movement in XZ plane at y=0
const planeIntersect = new THREE.Vector3();

let isPointerDown = false;
let dragOffset = new THREE.Vector3();

function onPointerDown(event) {
  isPointerDown = true;
  updateMouse(event);
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(tubes, false);
  if (hits.length) {
    selected = hits[0].object;
    // compute offset from plane intersection
    raycaster.ray.intersectPlane(plane, planeIntersect);
    dragOffset.copy(selected.position).sub(planeIntersect);
    document.body.style.cursor = 'grabbing';
  } else {
    selected = null;
  }
  updateUISelection();
}

function onPointerMove(event) {
  if (!isPointerDown) return;
  updateMouse(event);
  raycaster.setFromCamera(mouse, camera);
  raycaster.ray.intersectPlane(plane, planeIntersect);
  if (selected) {
    const newPos = planeIntersect.clone().add(dragOffset);
    // optionally grid-snap to 1 unit
    newPos.x = Math.round(newPos.x);
    newPos.z = Math.round(newPos.z);
    selected.position.copy(newPos);
    // show joint preview/highlight
    updateJointPreview(selected);
  } else {
    // rotate camera if left button drag
    // handled by simple controls below
  }
}

function onPointerUp(event) {
  if (selected) pushState();
  isPointerDown = false;
  document.body.style.cursor = 'auto';
}

function updateMouse(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = - ((event.clientY - rect.top) / rect.height) * 2 + 1;
}

// Simple camera orbit controls (left-drag rotate, right-drag pan, wheel zoom)
let isRightDown = false;
let lastPointer = {x:0,y:0};
function onContextMenu(e){ e.preventDefault(); }
function onMouseDown(e){ lastPointer.x = e.clientX; lastPointer.y = e.clientY; if (e.button===2) isRightDown=true; }
function onMouseMove(e){ if (isPointerDown && !selected) {
    // left button drag rotate around target (0,0,0)
    if (e.buttons===1) {
      const dx = (e.clientX - lastPointer.x);
      const dy = (e.clientY - lastPointer.y);
      const rotY = dx * 0.005;
      const rotX = dy * 0.005;
      // rotate camera around origin
      const radius = camera.position.length();
      const spherical = new THREE.Spherical().setFromVector3(camera.position);
      spherical.theta -= rotY;
      spherical.phi -= rotX;
      spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));
      camera.position.setFromSpherical(spherical);
      camera.lookAt(0,0,0);
    }
  }
  if (isRightDown) {
    const dx = (e.clientX - lastPointer.x);
    const dz = (e.clientY - lastPointer.y);
    const panSpeed = 0.5;
    camera.position.x -= dx * panSpeed;
    camera.position.z += dz * panSpeed;
  }
  lastPointer.x = e.clientX; lastPointer.y = e.clientY;
}
function onMouseUp(e){ if (e.button===2) isRightDown=false; }

function onWheel(e){ const delta = e.deltaY * 0.1; camera.position.addScaledVector(camera.getWorldDirection(new THREE.Vector3()), delta); }

// joint preview: highlight when close to other tube and compute angle
const highlightMat = new THREE.MeshPhongMaterial({emissive:0xff0000, opacity:0.6, transparent:true});
function updateJointPreview(moved) {
  // clear previous highlights
  tubes.forEach(t => { if (t.userData._highlight) { scene.remove(t.userData._highlight); t.userData._highlight = null; t.material.opacity = 1; t.material.transparent = false; } });
  for (const other of tubes) {
    if (other===moved) continue;
    const boxA = new THREE.Box3().setFromObject(moved);
    const boxB = new THREE.Box3().setFromObject(other);
    if (boxA.intersectsBox(boxB)) {
      // create a simple intersection visualization using intersection box
      const inter = boxA.clone();
      inter.intersect(boxB);
      const size = new THREE.Vector3();
      inter.getSize(size);
      if (size.x>0 && size.y>0 && size.z>0) {
        const geom = new THREE.BoxGeometry(size.x, size.y, size.z);
        const mesh = new THREE.Mesh(geom, highlightMat);
        const center = new THREE.Vector3();
        inter.getCenter(center);
        mesh.position.copy(center);
        scene.add(mesh);
        moved.userData._highlight = mesh;
        other.userData._highlight = mesh;
        // compute angle between tube axes (assume long axis is Z)
        const aDir = new THREE.Vector3(0,0,1).applyEuler(moved.rotation);
        const bDir = new THREE.Vector3(0,0,1).applyEuler(other.rotation);
        const angle = aDir.angleTo(bDir) * 180/Math.PI;
        // show basic label using console (labels in 3D text avoided for brevity)
        console.log("Joint angle between selected and other:", angle.toFixed(1),"deg");
      }
    }
  }
}

// wireframe toggle
function setWireframe(on) {
  tubes.forEach(t => {
    t.material.wireframe = on;
  });
}

// helper: get inputs and add tube
document.getElementById('addBtn').addEventListener('click', ()=>{
  const w=Number(document.getElementById('w').value);
  const h=Number(document.getElementById('h').value);
  const t=Number(document.getElementById('t').value);
  const l=Number(document.getElementById('l').value);
  const x = tubes.length*120 - 200;
  addTubeAt(x, Math.max(h/2,10), 0, w,h,t,l);
});

document.getElementById('wireBtn').addEventListener('click', ()=>{
  wireframeOn = !wireframeOn; setWireframe(wireframeOn);
});
document.getElementById('snapBtn').addEventListener('click', ()=>{
  snapOn = !snapOn; document.getElementById('snapBtn').innerText = snapOn ? 'Snap: ON' : 'Snap: OFF';
});
document.getElementById('undoBtn').addEventListener('click', ()=> undo());
document.getElementById('redoBtn').addEventListener('click', ()=> redo());
document.getElementById('removeBtn').addEventListener('click', ()=>{
  if (!selected) return;
  scene.remove(selected);
  tubes = tubes.filter(t => t!==selected);
  selected = null;
  pushState();
  updateUISelection();
});
document.getElementById('applyRot').addEventListener('click', ()=>{
  if (!selected) return;
  let deg = Number(document.getElementById('rot').value)||0;
  if (snapOn) {
    deg = Math.round(deg/45)*45;
  }
  selected.rotation.y = deg * Math.PI/180;
  pushState();
  updateJointPreview(selected);
});

document.getElementById('duplicateBtn').addEventListener('click', ()=>{
  if (!selected) return;
  const p = selected.position;
  const params = selected.userData.params || {w:20,h:20,t:2,l:100};
  const copy = addTubeAt(p.x+50, p.y, p.z, params.w, params.h, params.t, params.l);
  copy.rotation.copy(selected.rotation);
});

// selection UI update
function updateUISelection() {
  if (selected) {
    document.getElementById('rot').value = (selected.rotation.y * 180/Math.PI).toFixed(1);
  } else {
    document.getElementById('rot').value = 0;
  }
}

// initial demo tubes
addTubeAt(-200, 30, 0, 30,30,3,140);
addTubeAt(0, 30, 0, 20,40,2,160);

// pointer events
renderer.domElement.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerup', onPointerUp);
renderer.domElement.addEventListener('mousedown', onMouseDown);
window.addEventListener('mousemove', onMouseMove);
window.addEventListener('mouseup', onMouseUp);
window.addEventListener('wheel', onWheel);
window.addEventListener('contextmenu', onContextMenu);

// Resize handling
window.addEventListener('resize', ()=>{
  camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Render loop
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();
