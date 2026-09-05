import GeoJSONVT from '../src/index.js';

const options = {
    debug: 1
};

const padding = 8 / 512;
const totalExtent = 4096 * (1 + padding * 2);

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const backButton = document.getElementById('back');

let tileIndex;
let currentTile;

let x = 0;
let y = 0;
let z = 0;

let size, ratio, pad, halfSize;
let hoverQuadrant = -1;

function resize() {
    size = window.innerHeight - 5;
    ratio = size / totalExtent;
    pad = 4096 * padding * ratio;
    halfSize = size / 2;

    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = canvas.style.height = `${size}px`;
    canvas.width = canvas.height = Math.round(size * dpr);

    // resizing the canvas resets the whole 2d context, so set up the transform and styles again
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 1;
    ctx.textAlign = 'center';
    ctx.font = `${Math.min(48, Math.round(size / 14))}px Helvetica, Arial`;
}

function showMessage(text) {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'black';
    ctx.fillText(text, halfSize, halfSize);
}

function humanFileSize(bytes) {
    if (!bytes) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round(100 * (bytes / Math.pow(1024, i))) / 100} ${['B', 'kB', 'MB', 'GB'][i]}`;
}

function quadrant(e) {
    return {
        left: e.offsetX / size < 0.5,
        top: e.offsetY / size < 0.5
    };
}

function drawGrid() {
    ctx.strokeStyle = 'lightgreen';
    ctx.strokeRect(pad, pad, size - 2 * pad, size - 2 * pad);
    ctx.beginPath();
    ctx.moveTo(pad, halfSize);
    ctx.lineTo(size - pad, halfSize);
    ctx.moveTo(halfSize, pad);
    ctx.lineTo(halfSize, size - pad);
    ctx.stroke();
}

function drawSquare(left, top) {
    ctx.strokeStyle = 'blue';
    ctx.strokeRect(left ? pad : halfSize, top ? pad : halfSize, halfSize - pad, halfSize - pad);
}

function loadTile() {
    console.time(`getting tile z${z}-${x}-${y}`);
    currentTile = tileIndex.getTile(z, x, y);
    console.timeEnd(`getting tile z${z}-${x}-${y}`);
}

function render(left, top) {
    ctx.clearRect(0, 0, size, size);

    if (!currentTile) {
        ctx.fillStyle = '#999';
        ctx.fillText('no data in this tile', halfSize, halfSize);

    } else {
        const features = currentTile.features;

        ctx.strokeStyle = 'red';
        ctx.fillStyle = 'rgba(255,0,0,0.05)';

        for (let i = 0; i < features.length; i++) {
            const feature = features[i];
            const type = feature.type;

            ctx.beginPath();

            for (let j = 0; j < feature.geometry.length; j++) {
                const geom = feature.geometry[j];

                if (type === 1) {
                    ctx.arc(geom[0] * ratio + pad, geom[1] * ratio + pad, 2, 0, 2 * Math.PI, false);
                    continue;
                }

                for (let k = 0; k < geom.length; k++) {
                    const p = geom[k];
                    if (k) ctx.lineTo(p[0] * ratio + pad, p[1] * ratio + pad);
                    else ctx.moveTo(p[0] * ratio + pad, p[1] * ratio + pad);
                }
            }

            if (type === 1) ctx.fill();
            else if (type === 3) ctx.fill('evenodd');
            ctx.stroke();
        }
    }

    drawGrid();
    if (left !== undefined) drawSquare(left, top);
}

async function loadData(data) {
    if (data.type === 'Topology') {
        const {feature} = await import('https://cdn.jsdelivr.net/npm/topojson-client@3/+esm');
        data = feature(data, data.objects[Object.keys(data.objects)[0]]);
    }

    console.time('index data');
    tileIndex = new GeoJSONVT(data, options);
    console.timeEnd('index data');

    z = x = y = 0;
    hoverQuadrant = -1;
    backButton.style.display = 'none';

    loadTile();
    render();
}

canvas.ondragover = function () {
    this.className = 'hover';
    return false;
};
canvas.ondragleave = function () {
    this.className = '';
    return false;
};
canvas.ondrop = function (e) {
    e.preventDefault();
    this.className = '';

    const file = e.dataTransfer.files[0];
    if (!file) return false;

    console.log('data size', humanFileSize(file.size));
    showMessage('Thanks! Loading...');

    const reader = new FileReader();
    reader.onerror = () => showMessage(`Could not read ${file.name}`);
    reader.onload = async (event) => {
        try {
            console.time('JSON.parse');
            const data = JSON.parse(event.target.result);
            console.timeEnd('JSON.parse');
            await loadData(data);
        } catch (err) {
            console.error(err);
            showMessage(`Error: ${err.message}`);
        }
    };
    reader.readAsText(file);

    return false;
};

canvas.onclick = function (e) {
    if (!tileIndex || z >= tileIndex.options.maxZoom) return;

    const {left, top} = quadrant(e);

    z++;
    x = 2 * x + (left ? 0 : 1);
    y = 2 * y + (top ? 0 : 1);

    loadTile();
    hoverQuadrant = -1;
    render(left, top);

    backButton.style.display = '';
};

canvas.onmousemove = function (e) {
    if (!tileIndex) return;

    const {left, top} = quadrant(e);
    const q = (left ? 0 : 1) + (top ? 0 : 2);
    if (q === hoverQuadrant) return;

    hoverQuadrant = q;
    render(left, top);
};

canvas.onmouseleave = function () {
    if (!tileIndex || hoverQuadrant === -1) return;
    hoverQuadrant = -1;
    render();
};

backButton.style.display = 'none';

backButton.onclick = function () {
    if (!tileIndex || z === 0) return;

    z--;
    x = Math.floor(x / 2);
    y = Math.floor(y / 2);

    loadTile();
    hoverQuadrant = -1;
    render();

    if (z === 0) backButton.style.display = 'none';
};

window.onresize = () => {
    resize();
    if (tileIndex) render();
    else showMessage('Drag a GeoJSON or TopoJSON here');
};

window.onresize();
