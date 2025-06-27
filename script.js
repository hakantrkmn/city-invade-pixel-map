import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/11.9.1/firebase-analytics.js';
import { getDatabase, ref, set, onValue, serverTimestamp, remove } from 'https://www.gstatic.com/firebasejs/11.9.1/firebase-database.js';
import mapUrl from './us-states.json?url';

// === Reddit OAuth constants ===
const REDDIT_CLIENT_ID = 'v5Ng2xi9MH8ywFHmbo7lIA';
const REDDIT_REDIRECT = import.meta.env.DEV ? 'http://localhost:5173/' : 'https://hakantrkmn.github.io/city-invade-pixel-map/';

// === OAuth helper (PKCE) ===
function generateRandomString(len = 128) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/[^a-zA-Z0-9]/g, '').substring(0, len);
}
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return buf;
}
function base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function redditLogin() {
  const state = crypto.randomUUID();
  sessionStorage.setItem('oauth_state', state);
  const params = new URLSearchParams({
    client_id: REDDIT_CLIENT_ID,
    response_type: 'token',
    state,
    redirect_uri: REDDIT_REDIRECT,
    scope: 'identity'
  });
  window.location.href = `https://www.reddit.com/api/v1/authorize?${params}`;
}

function handleOAuthCallback() {
  if (!location.hash.includes('access_token')) return;
  const frag = Object.fromEntries(location.hash.substring(1).split('&').map(p=>p.split('=')));
  if (frag.state !== sessionStorage.getItem('oauth_state')) return;
  localStorage.setItem('reddit_token', frag.access_token);
  localStorage.setItem('token_exp', Date.now() + (+frag.expires_in)*1000);
  window.location.hash = '';
}

async function getRedditUsername() {
  const token = localStorage.getItem('reddit_token');
  const exp = parseInt(localStorage.getItem('token_exp') || '0', 10);
  if (!token || Date.now() > exp) return null;
  const r = await fetch('https://oauth.reddit.com/api/v1/me', { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) return null;
  const j = await r.json();
  return j.name;
}

let redditUser = null;
handleOAuthCallback();

// Firebase config from Vite environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_APIKEY,
  authDomain: import.meta.env.VITE_FB_AUTHDOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECTID,
  storageBucket: import.meta.env.VITE_FB_STORAGE,
  messagingSenderId: import.meta.env.VITE_FB_SENDER,
  appId: import.meta.env.VITE_FB_APPID,
  measurementId: import.meta.env.VITE_FB_MEAS,
  databaseURL: import.meta.env.VITE_FB_DBURL
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const db = getDatabase(app);



// Şehirler arası etkileşim veya dinamik işlemler için JS kodları buraya eklenecek.

// GeoJSON'u yükle ve haritayı çiz
let geojsonData = null;
let pixelGrid = [];
let nameGrid = [];
let gridCols = 600; // Piksel grid genişliği
let gridRows = 300; // Piksel grid yüksekliği
let zoom = 1;
let offsetX = 0;
let offsetY = 0;
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let dragOffsetStart = { x: 0, y: 0 };
let canvas, ctx;
let pixelSize = 1; // Ekrana çizilirken hesaplanacak
let tooltip = null;
let canPaint = false; // allowed to paint only after reddit login

// After db initialization
export const paintedPixels = {};

// add globals below tooltip
let myCityName = localStorage.getItem('myCityName') || null;
let myCityColor = localStorage.getItem('myCityColor') || null;
let cityColorMap = {};

// Global modal helpers
function showCitySelector() {
  const modal = document.getElementById('city-selector');
  if (modal) modal.style.display = 'flex';
}
function hideCitySelector() {
  const modal = document.getElementById('city-selector');
  if (modal) modal.style.display = 'none';
}

// Off-screen buffer: will hold 1×1-pixel map once and be scaled on screen
export const bufferCanvas = document.createElement('canvas');
export const bufferCtx = bufferCanvas.getContext('2d');

fetch(mapUrl)
  .then(response => response.json())
  .then(data => {
    // Alaska & Hawaii haritadan çıkar
    data.features = data.features.filter(f => {
      const n = (f.properties && f.properties.name) || '';
      const id = f.id || '';
      return !['Alaska', 'Hawaii'].includes(n) && !['AK', 'HI'].includes(id);
    });
    geojsonData = data;
    computePixelGrid();
    drawMap();
    window.addEventListener('resize', () => {
      computePixelGrid();
      drawMap();
    });

    // Button events
    setupUI();
  });

// Dinleyici kur - veritabanı değiştiğinde piksel haritasını güncelle
const pixelsRef = ref(db, 'pixels');
onValue(pixelsRef, snap => {
  const data = snap.val() || {};
  Object.keys(data).forEach(key => {
    const [gxStr, gyStr] = key.split('-');
    const gx = parseInt(gxStr, 10);
    const gy = parseInt(gyStr, 10);
    if (gx >= 0 && gx < gridCols && gy >= 0 && gy < gridRows && pixelGrid[gx]) {
      paintedPixels[key] = data[key];
      if (pixelGrid[gx][gy] !== undefined) {
        pixelGrid[gx][gy] = data[key].color;
        bufferCtx.fillStyle = data[key].color;
        bufferCtx.fillRect(gx, gy, 1, 1); // keep buffer in sync
      }
    }
  });
  drawMap(); // Yeniden çiz
});

// Static palette of 81 distinct colors
const distinctPalette = [
  '#e6194b','#3cb44b','#ffe119','#4363d8','#f58231','#911eb4','#46f0f0','#f032e6','#bcf60c',
  '#fabebe','#008080','#e6beff','#9a6324','#fffac8','#800000','#aaffc3','#808000','#ffd8b1',
  '#000075','#808080','#ffffff','#000000','#ffe4e1','#8a2be2','#00ced1','#ff1493','#7fffd4',
  '#dc143c','#00fa9a','#b8860b','#ff7f50','#1e90ff','#adff2f','#ff69b4','#ffd700','#7cfc00',
  '#6495ed','#ff4500','#2e8b57','#ee82ee','#40e0d0','#d2691e','#9acd32','#ba55d3','#ff6347',
  '#5f9ea0','#ffbf00','#b03060','#ff8c00','#32cd32','#4682b4','#da70d6','#00bfff','#b22222',
  '#8db600','#ff00ff','#ffdead','#008000','#deb887','#b0e0e6','#c71585','#66cdaa','#ffa07a',
  '#800080','#98fb98','#ffb6c1','#556b2f','#ff6eb4','#6b8e23','#ffdab9','#4169e1','#ff6f00',
  '#20b2aa','#d2b48c','#8b0000','#00ff7f','#bf00ff','#708090','#ffea00','#6a5acd','#00ff00'
];

function getDistinctColor(idx) {
  return distinctPalette[idx % distinctPalette.length];
}

function computePixelGrid() {
  // Piksel gridini bir kez hesapla
  pixelGrid = Array.from({ length: gridCols }, () => Array(gridRows).fill(null));
  nameGrid = Array.from({ length: gridCols }, () => Array(gridRows).fill(null));

  // Resize buffer to grid size
  bufferCanvas.width = gridCols;
  bufferCanvas.height = gridRows;
  bufferCtx.clearRect(0, 0, gridCols, gridRows);

  // GeoJSON içindeki tüm koordinatları tarayarak dinamik sınır belirle
  const allCoords = [];
  geojsonData.features.forEach(f => {
    const g = f.geometry;
    if (!g) return;
    if (g.type === 'Polygon') {
      g.coordinates.forEach(ring => ring.forEach(pt => allCoords.push(pt)));
    } else if (g.type === 'MultiPolygon') {
      g.coordinates.forEach(poly => poly.forEach(ring => ring.forEach(pt => allCoords.push(pt))));
    }
  });
  const lons = allCoords.map(c => c[0]);
  const lats = allCoords.map(c => c[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  // Şehirlerin polygonlarını ve renklerini hazırla
  const totalCities = geojsonData.features.length;
  const cityPolygons = geojsonData.features.map((feature, idx) => {
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    return {
      name: feature.properties.name,
      polygons: polygons,
      color: getDistinctColor(idx)
    };
  });

  // cityColorMap güncelle ve dropdown'ı doldur (bir kere)
  if (Object.keys(cityColorMap).length === 0) {
    cityPolygons.forEach(c => {
      cityColorMap[c.name] = c.color;
    });
    const dropdown = document.getElementById('city-dropdown');
    if (dropdown) {
      dropdown.innerHTML = '';
      Object.keys(cityColorMap).sort().forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        dropdown.appendChild(opt);
      });
      if (myCityName) dropdown.value = myCityName;
    }
  }

  // Point-in-polygon algoritması (ray-casting)
  function pointInPolygon(point, vs) {
    const x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i][0], yi = vs[i][1];
      const xj = vs[j][0], yj = vs[j][1];
      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  for (let gx = 0; gx < gridCols; gx++) {
    for (let gy = 0; gy < gridRows; gy++) {
      // Grid hücresinin merkezinin lon/lat'ı
      const lon = ((gx + 0.5) / gridCols) * (maxLon - minLon) + minLon;
      const lat = ((gridRows - gy - 0.5) / gridRows) * (maxLat - minLat) + minLat;
      let found = false;
      for (const city of cityPolygons) {
        for (const polygon of city.polygons) {
          for (const ring of polygon) {
            if (pointInPolygon([lon, lat], ring)) {
              pixelGrid[gx][gy] = city.color;
              nameGrid[gx][gy] = city.name;
              found = true;
              break;
            }
          }
          if (found) break;
        }
        if (found) break;
      }
      // Eğer hiçbir şehirde değilse, null kalır
    }
  }

  // Apply paintedPixels overrides
  for (const key in paintedPixels) {
    const [gxStr, gyStr] = key.split('-');
    const gx = parseInt(gxStr, 10);
    const gy = parseInt(gyStr, 10);
    if (gx >= 0 && gx < gridCols && gy >= 0 && gy < gridRows) {
      pixelGrid[gx][gy] = paintedPixels[key].color;
    }
  }

  // --- Draw to off-screen buffer ---
  for (let gx = 0; gx < gridCols; gx++) {
    for (let gy = 0; gy < gridRows; gy++) {
      const color = pixelGrid[gx][gy];
      if (color) {
        bufferCtx.fillStyle = color;
        bufferCtx.fillRect(gx, gy, 1, 1);
      }
    }
  }
}

function drawMap() {
  // Canvas'ı oluştur veya güncelle
  const container = document.querySelector('.map-container');
  const width = window.innerWidth;
  const height = window.innerHeight - 40;
  if (!canvas) {
    canvas = document.createElement('canvas');
    container.appendChild(canvas);
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.zIndex = '0';
    ctx = canvas.getContext('2d');
  }
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = '100vw';
  canvas.style.height = height + 'px';

  // Piksel boyutu (zoom'a göre)
  pixelSize = Math.min(width / gridCols, height / gridRows) * zoom;

  // İlk yüklemede gerçek boyalı alanı merkeze al
  if (!window.__mapCentered) {
    let minGX = gridCols, maxGX = -1, minGY = gridRows, maxGY = -1;
    for (let gx = 0; gx < gridCols; gx++) {
      for (let gy = 0; gy < gridRows; gy++) {
        if (pixelGrid[gx][gy]) {
          if (gx < minGX) minGX = gx;
          if (gx > maxGX) maxGX = gx;
          if (gy < minGY) minGY = gy;
          if (gy > maxGY) maxGY = gy;
        }
      }
    }
    if (maxGX >= minGX && maxGY >= minGY) {
      const usedWidth = (maxGX - minGX + 1) * pixelSize;
      const usedHeight = (maxGY - minGY + 1) * pixelSize;
      offsetX = (width - usedWidth) / 2 - minGX * pixelSize;
      offsetY = (height - usedHeight) / 2 - minGY * pixelSize;
    } else {
      // Fallback eski yöntem
      offsetX = (width - gridCols * pixelSize) / 2;
      offsetY = (height - gridRows * pixelSize) / 2;
    }
    window.__mapCentered = true;
  }

  // Offset'leri sınırla (pan sınırı)
  offsetX = Math.max(Math.min(offsetX, width / 2), -gridCols * pixelSize + width / 2);
  offsetY = Math.max(Math.min(offsetY, height / 2), -gridRows * pixelSize + height / 2);

  // Tek draw: off-screen buffer → ana canvas (ölçeklenmiş)
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(offsetX, offsetY);
  ctx.scale(pixelSize, pixelSize);
  ctx.drawImage(bufferCanvas, 0, 0);
  ctx.restore();

  // --- Lightweight grid overlay ---
  const showGrid = pixelSize >= 4; // only draw when zoomed enough
  if (showGrid) {
    const borderAlpha = Math.min(1, (pixelSize - 3) / 10);
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(0,0,0,${borderAlpha})`;
    ctx.beginPath();
    // visible column range
    const startCol = Math.max(0, Math.floor((-offsetX) / pixelSize));
    const endCol = Math.min(gridCols, Math.ceil((canvas.width - offsetX) / pixelSize));
    for (let c = startCol; c <= endCol; c++) {
      const x = offsetX + c * pixelSize;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
    }
    // visible row range
    const startRow = Math.max(0, Math.floor((-offsetY) / pixelSize));
    const endRow = Math.min(gridRows, Math.ceil((canvas.height - offsetY) / pixelSize));
    for (let r = startRow; r <= endRow; r++) {
      const y = offsetY + r * pixelSize;
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();
  }

  // Tooltip oluştur
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.style.position = 'fixed';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.background = 'rgba(0,0,0,0.8)';
    tooltip.style.color = '#fff';
    tooltip.style.padding = '4px 10px';
    tooltip.style.borderRadius = '6px';
    tooltip.style.fontSize = '16px';
    tooltip.style.zIndex = '10';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);
  }

  // Mouse hareketiyle şehir ismi göster
  canvas.onmousemove = function(e) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const gx = Math.floor((mx - offsetX) / pixelSize);
    const gy = Math.floor((my - offsetY) / pixelSize);
    if (gx >= 0 && gx < gridCols && gy >= 0 && gy < gridRows) {
      const key = `${gx}-${gy}`;
      const painted = paintedPixels[key];
      const cityNameToShow = (painted && painted.by) ? painted.by : nameGrid[gx][gy];
      if (cityNameToShow) {
        const defenders = cityCounts[cityNameToShow] || 0;
        const defenderText = defenders === 1 ? '1 defender' : `${defenders} defenders`;
        tooltip.textContent = `${cityNameToShow}: ${defenderText}`;
        tooltip.style.left = e.clientX + 12 + 'px';
        tooltip.style.top = e.clientY + 8 + 'px';
        tooltip.style.display = 'block';
      } else {
        tooltip.style.display = 'none';
      }
    } else {
      tooltip.style.display = 'none';
    }
  };

  canvas.onmouseleave = function() {
    tooltip.style.display = 'none';
  };

  // Tıklama ile piksel boyama
  canvas.onmousedown = function(e) {
    if (e.button !== 0) return;
    isDragging = true;
    dragStart.x = e.clientX;
    dragStart.y = e.clientY;
    dragOffsetStart.x = offsetX;
    dragOffsetStart.y = offsetY;
  };
  window.onmousemove = function(e) {
    if (isDragging) {
      offsetX = dragOffsetStart.x + (e.clientX - dragStart.x);
      offsetY = dragOffsetStart.y + (e.clientY - dragStart.y);
      drawMap();
    }
  };
  window.onmouseup = function(e) {
    isDragging = false;
  };

  canvas.onclick = function(e) {
    if (isDragging) return; // Sürükleme sırasında tıklama sayma
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const gx = Math.floor((mx - offsetX) / pixelSize);
    const gy = Math.floor((my - offsetY) / pixelSize);
    if (!canPaint) { alert('Please login with Reddit first'); return; }
    if (!myCityName) {
      alert('Please choose a state first!');
      return;
    }
    if (Date.now() - lastPaintTime < COOLDOWN_MS) {
      const remainingS = Math.ceil((COOLDOWN_MS - (Date.now() - lastPaintTime))/1000);
      alert(`You must wait ${remainingS} seconds before painting again!`);
      return;
    }
    if (gx >= 0 && gx < gridCols && gy >= 0 && gy < gridRows) {
      const currentColor = pixelGrid[gx][gy];
      if (currentColor === null) return; // dış bölge tıklanamaz
      if (currentColor !== myCityColor) {
        pixelGrid[gx][gy] = myCityColor;
        // buffer'ı da güncelle
        bufferCtx.fillStyle = myCityColor;
        bufferCtx.fillRect(gx, gy, 1, 1);
        const pixelKey = `${gx}-${gy}`;
        set(ref(db, `pixels/${pixelKey}`), { color: myCityColor, by: myCityName, user: redditUser, t: serverTimestamp() });
        lastPaintTime = Date.now();
        saveUserPaintTime(lastPaintTime);
        startCooldown();
        drawMap();
      }
    }
  };

  // Mouse wheel ile zoom
  canvas.onwheel = function(e) {
    e.preventDefault();
    const mouseX = e.offsetX;
    const mouseY = e.offsetY;
    const prevZoom = zoom;
    const zoomFactor = 1.1;
    if (e.deltaY < 0) {
      zoom *= zoomFactor;
    } else {
      zoom /= zoomFactor;
    }
    zoom = Math.max(0.5, Math.min(zoom, 20));
    // Zoom merkezini mouse konumuna göre ayarla
    offsetX = mouseX - ((mouseX - offsetX) * (zoom / prevZoom));
    offsetY = mouseY - ((mouseY - offsetY) * (zoom / prevZoom));
    drawMap();
  };

  // Touch support
  let pinchStartDist = 0;
  let pinchStartZoom = 1;
  let pinchCenter = {x:0,y:0};

  function getTouchDist(t1, t2) {
    return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
  }

  canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      isDragging = true;
      dragStart.x = e.touches[0].clientX;
      dragStart.y = e.touches[0].clientY;
      dragOffsetStart.x = offsetX;
      dragOffsetStart.y = offsetY;
    } else if (e.touches.length === 2) {
      isDragging = false;
      const [t1, t2] = e.touches;
      pinchStartDist = getTouchDist(t1, t2);
      pinchStartZoom = zoom;
      pinchCenter.x = (t1.clientX + t2.clientX) / 2;
      pinchCenter.y = (t1.clientY + t2.clientY) / 2;
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 1 && isDragging) {
      offsetX = dragOffsetStart.x + (e.touches[0].clientX - dragStart.x);
      offsetY = dragOffsetStart.y + (e.touches[0].clientY - dragStart.y);
      drawMap();
    } else if (e.touches.length === 2) {
      const [t1, t2] = e.touches;
      const newDist = getTouchDist(t1, t2);
      if (pinchStartDist > 0) {
        const factor = newDist / pinchStartDist;
        const prevZoom = zoom;
        zoom = Math.max(0.5, Math.min(pinchStartZoom * factor, 20));
        // adjust offsets relative to pinch center
        offsetX = pinchCenter.x - ((pinchCenter.x - offsetX) * (zoom / prevZoom));
        offsetY = pinchCenter.y - ((pinchCenter.y - offsetY) * (zoom / prevZoom));
        drawMap();
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchend', () => {
    if (event.touches.length === 0) {
      isDragging = false;
      pinchStartDist = 0;
    }
  });
}

// Bir polygonu daha büyük ve belirgin piksellerle doldur
function fillPolygonWithPixels(ctx, points, color, width, height) {
  // Bounding box hesapla
  let minX = Math.max(0, Math.floor(Math.min(...points.map(p => p[0]))));
  let maxX = Math.min(width, Math.ceil(Math.max(...points.map(p => p[0]))));
  let minY = Math.max(0, Math.floor(Math.min(...points.map(p => p[1]))));
  let maxY = Math.min(height, Math.ceil(Math.max(...points.map(p => p[1]))));
  const pixelSize = Math.max(10, Math.floor(width / 120)); // Daha büyük ve belirgin piksel
  ctx.save();
  ctx.beginPath();
  points.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.clip();
  for (let x = minX; x < maxX; x += pixelSize) {
    for (let y = minY; y < maxY; y += pixelSize) {
      if (ctx.isPointInPath(x + pixelSize / 2, y + pixelSize / 2)) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, pixelSize, pixelSize);
      }
    }
  }
  ctx.restore();
}

// Remove window DOMContentLoaded listener and replace with setupUI function
function setupUI() {
  // Button events
  const btn = document.getElementById('change-city-btn');
  const confirmBtn = document.getElementById('confirm-city');
  const dropdown = document.getElementById('city-dropdown');
  const resetBtn = document.getElementById('reset-map-btn');
  if (btn) {
    btn.addEventListener('click', showCitySelector);
  }
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      const sel = dropdown.value;
      joinCity(sel);
      hideCitySelector();
      if (btn) btn.textContent = sel;
    });
  }
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to completely reset the map?')) {
        remove(ref(db, 'pixels')).then(()=>{
          Object.keys(paintedPixels).forEach(k=>delete paintedPixels[k]);
          computePixelGrid();
          drawMap();
        });
      }
    });
  }

  // İlk girişte şehir seçilmemişse modal göster
  if (!myCityName) {
    showCitySelector();
  } else {
    if (btn) btn.textContent = myCityName;
  }

  if (myCityName) {
    joinCity(myCityName);
    if (!myCityColor) myCityColor = cityColorMap[myCityName];
  }

  const availableNames = Object.keys(cityColorMap);
  if (myCityName && !availableNames.includes(myCityName)) {
    // kayıtlı ad bu GeoJSON'da yok → sil
    localStorage.removeItem('myCityName');
    localStorage.removeItem('myCityColor');
    myCityName = null;
    myCityColor = null;
  }

  // Reddit login button
  const loginBtn = document.getElementById('reddit-login-btn');
  if (loginBtn) {
    loginBtn.addEventListener('click', redditLogin);
  }

  // Determine Reddit login state
  getRedditUsername().then(name => {
    // Cleanup previous user's listener if switching users
    if (redditUser !== name) {
      cleanupCooldownListener();
    }
    
    redditUser = name;
    const userBox = document.getElementById('reddit-user-display');
    if (redditUser) {
      canPaint = true;
      if (loginBtn) loginBtn.style.display = 'none';
      if (userBox) { userBox.textContent = redditUser; userBox.style.display = 'block'; }
      // Load user's cooldown from Firebase
      loadUserCooldown();
    } else {
      canPaint = false;
      if (loginBtn) loginBtn.style.display = 'block';
      if (userBox) userBox.style.display = 'none';
      // Cleanup listener when logged out
      cleanupCooldownListener();
      // Start cooldown display without data
      startCooldown();
    }
  });
}

// After globals
let cityCounts = {};
const clientId = localStorage.getItem('clientId') || crypto.randomUUID();
localStorage.setItem('clientId', clientId);

function joinCity(cityName) {
  if (!cityName) return;
  // Remove from previous city list if any
  if (myCityName && myCityName !== cityName) {
    const oldRef = ref(db, `cityPlayers/${myCityName}/${clientId}`);
    set(oldRef, null);
  }
  myCityName = cityName;
  myCityColor = cityColorMap[cityName];
  localStorage.setItem('myCityName', myCityName);
  localStorage.setItem('myCityColor', myCityColor);
  const playerRef = ref(db, `cityPlayers/${cityName}/${clientId}`);
  // onDisconnect remove
  import('https://www.gstatic.com/firebasejs/11.9.1/firebase-database.js').then(({onDisconnect})=>{
    onDisconnect(playerRef).remove();
  });
  set(playerRef, true);
}

// Listen cityPlayers to compute counts
const cityPlayersRef = ref(db, 'cityPlayers');
onValue(cityPlayersRef, snap=>{
  const data = snap.val() || {};
  cityCounts = {};
  Object.keys(data).forEach(city=>{
    cityCounts[city]= Object.keys(data[city]).length;
  });
});

// Cooldown constants and variables
const COOLDOWN_MS = 5 * 60 * 1000; // 5 dk
let lastPaintTime = 0;
let cooldownInterval = null;
let cooldownListener = null; // Track listener for cleanup

// Load user's last paint time from Firebase and listen for real-time updates
async function loadUserCooldown() {
  if (!redditUser) return;
  
  // Cleanup previous listener if exists
  cleanupCooldownListener();
  
  try {
    const paintTimeRef = ref(db, `paintTimes/${redditUser}`);
    // Real-time listener - updates when user paints from another device
    cooldownListener = onValue(paintTimeRef, (snapshot) => {
      const newTime = snapshot.val() || 0;
      if (newTime !== lastPaintTime) {
        lastPaintTime = newTime;
        startCooldown();
      }
    });
  } catch (error) {
    console.error('Error loading cooldown:', error);
    lastPaintTime = 0;
  }
}

// Cleanup cooldown listener
function cleanupCooldownListener() {
  if (cooldownListener) {
    cooldownListener(); // Firebase unsubscribe
    cooldownListener = null;
  }
}

// Save user's paint time to Firebase
async function saveUserPaintTime(timestamp) {
  if (!redditUser) return;
  try {
    const paintTimeRef = ref(db, `paintTimes/${redditUser}`);
    await set(paintTimeRef, timestamp);
  } catch (error) {
    console.error('Error saving paint time:', error);
  }
}

function startCooldown() {
  updateCooldownDisplay();
  if (cooldownInterval) clearInterval(cooldownInterval);
  cooldownInterval = setInterval(updateCooldownDisplay, 1000);
}

function updateCooldownDisplay() {
  const display = document.getElementById('cooldown-display');
  if (!display) return;
  const remaining = COOLDOWN_MS - (Date.now() - lastPaintTime);
  if (remaining <= 0) {
    display.textContent = 'Ready to paint';
    if (cooldownInterval) {
      clearInterval(cooldownInterval);
      cooldownInterval = null;
    }
  } else {
    const sec = Math.floor(remaining / 1000) % 60;
    const min = Math.floor(remaining / 60000);
    display.textContent = `Next paint in: ${min}:${sec.toString().padStart(2,'0')}`;
  }
} 