import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/11.9.1/firebase-analytics.js';
import { getDatabase, ref, set, onValue, serverTimestamp, remove } from 'https://www.gstatic.com/firebasejs/11.9.1/firebase-database.js';
import mapUrl from './tr.json?url';

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

// Hızlı bağlantı testi (geçici)
const testRef = ref(db, 'test/hello');
set(testRef, { msg: 'Merhaba Firebase', time: Date.now() }).then(() => {
  console.log('Firebase test verisi yazıldı');
});
onValue(testRef, snap => {
  console.log('Firebase verisi geldi:', snap.val());
});

// Şehirler arası etkileşim veya dinamik işlemler için JS kodları buraya eklenecek.

// GeoJSON'u yükle ve haritayı çiz
let geojsonData = null;
let pixelGrid = [];
let nameGrid = [];
let gridCols = 200; // Piksel grid genişliği (düşük tut, performans için)
let gridRows = 100; // Piksel grid yüksekliği
let zoom = 1;
let offsetX = 0;
let offsetY = 0;
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let dragOffsetStart = { x: 0, y: 0 };
let canvas, ctx;
let pixelSize = 1; // Ekrana çizilirken hesaplanacak
let tooltip = null;

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

fetch(mapUrl)
  .then(response => response.json())
  .then(data => {
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

  // Türkiye'nin yaklaşık sınırları
  const minLon = 25.0, maxLon = 45.0;
  const minLat = 35.5, maxLat = 42.1;

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
}

function drawMap() {
  // Canvas'ı oluştur veya güncelle
  const container = document.querySelector('.map-container');
  container.innerHTML = '';
  const width = window.innerWidth;
  const height = window.innerHeight - 40;
  canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = '100vw';
  canvas.style.height = height + 'px';
  canvas.style.display = 'block';
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.zIndex = '0';
  container.appendChild(canvas);
  ctx = canvas.getContext('2d');

  // Piksel boyutu (zoom'a göre)
  pixelSize = Math.min(width / gridCols, height / gridRows) * zoom;

  // İlk yüklemede merkezi ortala
  if (!window.__mapCentered) {
    offsetX = (width - gridCols * pixelSize) / 2;
    offsetY = (height - gridRows * pixelSize) / 2;
    window.__mapCentered = true;
  }

  // Offset'leri sınırla (pan sınırı)
  offsetX = Math.max(Math.min(offsetX, width / 2), -gridCols * pixelSize + width / 2);
  offsetY = Math.max(Math.min(offsetY, height / 2), -gridRows * pixelSize + height / 2);

  // Tüm grid'i ekrana çiz
  for (let gx = 0; gx < gridCols; gx++) {
    for (let gy = 0; gy < gridRows; gy++) {
      const color = pixelGrid[gx][gy];
      if (color) {
        const x = gx * pixelSize + offsetX;
        const y = gy * pixelSize + offsetY;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, pixelSize, pixelSize);
        // Çerçeve kalınlığı ve opaklığı zoom'a göre ayarlanır
        let borderAlpha = Math.min(1, Math.max(0, (zoom - 1) * 0.7)); // zoom=1'de 0, zoom=2'de 0.7, zoom>=2.5'te 1
        if (borderAlpha > 0) {
          ctx.lineWidth = Math.max(0.15, 0.25 * zoom); // zoom arttıkça kalınlaşır
          ctx.strokeStyle = `rgba(0,0,0,${borderAlpha})`;
          ctx.strokeRect(x, y, pixelSize, pixelSize);
        }
      }
    }
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
        const defenderText = defenders === 1 ? '1 kişi savaşıyor' : `${defenders} kişi savaşıyor`;
        tooltip.textContent = `${cityNameToShow} için ${defenderText}`;
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
    if (!myCityName) {
      alert('Önce bir kütük (şehir) seçmelisin!');
      return;
    }
    if (Date.now() - lastPaintTime < COOLDOWN_MS) {
      const remainingS = Math.ceil((COOLDOWN_MS - (Date.now() - lastPaintTime))/1000);
      alert(`Boyama için ${remainingS} saniye daha beklemelisin!`);
      return;
    }
    if (gx >= 0 && gx < gridCols && gy >= 0 && gy < gridRows) {
      const currentColor = pixelGrid[gx][gy];
      if (currentColor === null) return; // dış bölge tıklanamaz
      if (currentColor !== myCityColor) {
        pixelGrid[gx][gy] = myCityColor;
        const pixelKey = `${gx}-${gy}`;
        set(ref(db, `pixels/${pixelKey}`), { color: myCityColor, by: myCityName, t: serverTimestamp() });
        lastPaintTime = Date.now();
        localStorage.setItem('lastPaintTime', lastPaintTime.toString());
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
      if (confirm('Haritayı tamamen sıfırlamak istediğine emin misin?')) {
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
let lastPaintTime = parseInt(localStorage.getItem('lastPaintTime') || '0', 10);
let cooldownInterval = null;

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
    display.textContent = 'Boyama hazır';
    if (cooldownInterval) {
      clearInterval(cooldownInterval);
      cooldownInterval = null;
    }
  } else {
    const sec = Math.floor(remaining / 1000) % 60;
    const min = Math.floor(remaining / 60000);
    display.textContent = `Sonraki boyamaya: ${min}:${sec.toString().padStart(2,'0')}`;
  }
}

// start initial cooldown timer on load
startCooldown(); 