import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { calculateDistanceBetweenPoints } from './droneMath';

/**
 * Captures the Leaflet map in a strict 1:1 square frame.
 * Directly draws the drone grid, yellow safety barricade, all drones, direction arrows, and text badges
 * on top of the satellite imagery so that NO layers or SVG vectors are ever missing.
 */
export async function captureMapSnapshot(mapElement, mapInstance, missionData) {
  const {
    gridRows = 10,
    gridCols = 10,
    spacingMeters = 3,
    gridAngle = 0,
    droneAltitude = 5,
    gridCenter = { lat: 18.5362, lng: 73.7929 },
    points = [],
    barricadePoints = [],
    barricadeDimensions = { widthMeters: 36, heightMeters: 42, widthFeet: 118, heightFeet: 138, areaSqM: 1512, areaSqFt: 16275 },
    drones = [],
    operatorStation = null,
    operatorDistance = 5,
    operatorSide = 'south',
    textAnnotations = [],
    arrowAnnotations = [],
    measurePointA = null,
    measurePointB = null
  } = missionData || {};

  const outputSize = 1000; // 1:1 square resolution (1000x1000 px)
  const outCanvas = document.createElement('canvas');
  outCanvas.width = outputSize;
  outCanvas.height = outputSize;
  const ctx = outCanvas.getContext('2d');

  let rawMapCanvas = null;

  if (mapElement) {
    try {
      rawMapCanvas = await html2canvas(mapElement, {
        useCORS: true,
        allowTaint: false,
        logging: false,
        scale: 1.5,
        ignoreElements: (el) => {
          if (!el || !el.classList) return false;
          if (
            el.classList.contains('leaflet-control-container') ||
            el.classList.contains('leaflet-control-zoom') ||
            el.classList.contains('leaflet-control-attribution') ||
            el.classList.contains('map-top-bar') ||
            el.classList.contains('map-layer-selector') ||
            el.classList.contains('map-floating-status') ||
            el.classList.contains('map-search-card') ||
            el.classList.contains('clean-map-badge') ||
            el.classList.contains('leaflet-marker-pane') ||
            el.classList.contains('leaflet-overlay-pane') ||
            el.classList.contains('leaflet-shadow-pane') ||
            el.classList.contains('leaflet-popup-pane') ||
            el.classList.contains('leaflet-tooltip-pane')
          ) {
            return true;
          }
          if (el.closest) {
            if (
              el.closest('.leaflet-marker-pane') ||
              el.closest('.leaflet-overlay-pane') ||
              el.closest('.leaflet-shadow-pane') ||
              el.closest('.leaflet-popup-pane') ||
              el.closest('.leaflet-tooltip-pane') ||
              el.closest('.map-top-bar') ||
              el.closest('.map-layer-selector') ||
              el.closest('.map-floating-status') ||
              el.closest('.clean-map-badge')
            ) {
              return true;
            }
          }
          return false;
        }
      });
    } catch (err) {
      console.warn('html2canvas capture warning, using direct canvas render:', err);
    }
  }

  // Determine container dimensions and 1:1 square crop region
  const containerW = mapElement ? mapElement.clientWidth : 800;
  const containerH = mapElement ? mapElement.clientHeight : 600;

  // Compute bounding box of all mission points in container pixels
  let minPxX = containerW;
  let maxPxX = 0;
  let minPxY = containerH;
  let maxPxY = 0;

  const includePointInBox = (pt) => {
    if (!pt) return;
    minPxX = Math.min(minPxX, pt.x);
    maxPxX = Math.max(maxPxX, pt.x);
    minPxY = Math.min(minPxY, pt.y);
    maxPxY = Math.max(maxPxY, pt.y);
  };

  if (mapInstance) {
    // Include center
    const centerP = mapInstance.latLngToContainerPoint([gridCenter.lat, gridCenter.lng]);
    includePointInBox(centerP);

    // Include barricade points
    barricadePoints.forEach((pt) => {
      includePointInBox(mapInstance.latLngToContainerPoint(pt));
    });

    // Include drone points
    points.forEach((pt) => {
      includePointInBox(mapInstance.latLngToContainerPoint(pt));
    });

    // Include operator
    if (operatorStation && operatorStation.operator) {
      includePointInBox(mapInstance.latLngToContainerPoint([operatorStation.operator.lat, operatorStation.operator.lng]));
    }

    // Include arrows
    arrowAnnotations.forEach((arr) => {
      includePointInBox(mapInstance.latLngToContainerPoint([arr.startLat, arr.startLng]));
      includePointInBox(mapInstance.latLngToContainerPoint([arr.endLat, arr.endLng]));
    });

    // Include text annotations
    textAnnotations.forEach((txt) => {
      includePointInBox(mapInstance.latLngToContainerPoint([txt.lat, txt.lng]));
    });

    // Include measurement points
    if (measurePointA) {
      includePointInBox(mapInstance.latLngToContainerPoint([measurePointA.lat, measurePointA.lng]));
    }
    if (measurePointB) {
      includePointInBox(mapInstance.latLngToContainerPoint([measurePointB.lat, measurePointB.lng]));
    }
  }

  // Ensure sensible fallback bounds
  if (minPxX >= maxPxX || minPxY >= maxPxY) {
    minPxX = containerW * 0.2;
    maxPxX = containerW * 0.8;
    minPxY = containerH * 0.2;
    maxPxY = containerH * 0.8;
  }

  const boxCenterX = (minPxX + maxPxX) / 2;
  const boxCenterY = (minPxY + maxPxY) / 2;
  const spanX = maxPxX - minPxX;
  const spanY = maxPxY - minPxY;

  // 1:1 Square Frame dimension with padding
  const padding = 70;
  let squareSpan = Math.max(spanX, spanY) + padding * 2;
  const minDim = Math.min(containerW, containerH);
  squareSpan = Math.min(Math.max(squareSpan, minDim * 0.65), minDim);

  let cropX = boxCenterX - squareSpan / 2;
  let cropY = boxCenterY - squareSpan / 2;

  // Clamp within container
  if (cropX < 0) cropX = 0;
  if (cropY < 0) cropY = 0;
  if (cropX + squareSpan > containerW) cropX = Math.max(0, containerW - squareSpan);
  if (cropY + squareSpan > containerH) cropY = Math.max(0, containerH - squareSpan);

  // Coordinate transformation helpers from container pixels to 1:1 output canvas (0 - 1000)
  const toOutX = (px) => ((px - cropX) / squareSpan) * outputSize;
  const toOutY = (py) => ((py - cropY) / squareSpan) * outputSize;

  // 1. DRAW SATELLITE BASE
  if (rawMapCanvas) {
    const scaleX = rawMapCanvas.width / containerW;
    const scaleY = rawMapCanvas.height / containerH;

    ctx.drawImage(
      rawMapCanvas,
      cropX * scaleX,
      cropY * scaleY,
      squareSpan * scaleX,
      squareSpan * scaleY,
      0,
      0,
      outputSize,
      outputSize
    );
  } else {
    // Dark satellite styled gradient if raw canvas not available
    const bgGrad = ctx.createLinearGradient(0, 0, 0, outputSize);
    bgGrad.addColorStop(0, '#09101d');
    bgGrad.addColorStop(1, '#020617');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, outputSize, outputSize);

    // Subtle grid texture
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < outputSize; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, outputSize);
      ctx.stroke();
    }
    for (let y = 0; y < outputSize; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(outputSize, y);
      ctx.stroke();
    }
  }

  // 2. DRAW 10-FOOT YELLOW SAFETY BARRICADE PERIMETER
  if (mapInstance && barricadePoints && barricadePoints.length >= 4) {
    ctx.beginPath();
    barricadePoints.forEach((pt, i) => {
      const p = mapInstance.latLngToContainerPoint(pt);
      const ox = toOutX(p.x);
      const oy = toOutY(p.y);
      if (i === 0) ctx.moveTo(ox, oy);
      else ctx.lineTo(ox, oy);
    });
    ctx.closePath();

    // Yellow warning translucent fill
    ctx.fillStyle = 'rgba(217, 119, 6, 0.12)';
    ctx.fill();

    // Hazard Yellow dashed border
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 3.5;
    ctx.setLineDash([12, 8]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 3. DRAW CYAN SWARM FORMATION BOUNDARY
  if (mapInstance && points && points.length >= 4) {
    ctx.beginPath();
    points.forEach((pt, i) => {
      const p = mapInstance.latLngToContainerPoint(pt);
      const ox = toOutX(p.x);
      const oy = toOutY(p.y);
      if (i === 0) ctx.moveTo(ox, oy);
      else ctx.lineTo(ox, oy);
    });
    ctx.closePath();

    ctx.fillStyle = 'rgba(234, 88, 12, 0.08)';
    ctx.fill();

    ctx.strokeStyle = '#ea580c';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 4. DRAW ALL DRONE POSITIONS (SCALED PROPORTIONALLY TO ZOOM LEVEL)
  let pxSpacing = 16;
  if (mapInstance && Array.isArray(drones) && drones.length >= 2) {
    const p0 = mapInstance.latLngToContainerPoint([drones[0].lat, drones[0].lng]);
    const p1 = mapInstance.latLngToContainerPoint([drones[1].lat, drones[1].lng]);
    const ox0 = toOutX(p0.x);
    const oy0 = toOutY(p0.y);
    const ox1 = toOutX(p1.x);
    const oy1 = toOutY(p1.y);
    pxSpacing = Math.hypot(ox1 - ox0, oy1 - oy0) || 16;
  }

  // Dynamic radius based on zoom:
  // If zoomed way out (e.g. pxSpacing = 2-3px), drone dot is ~1px with no halo so drones NEVER overlap or look too big!
  // If zoomed in (e.g. pxSpacing = 20-30px), drone dot is 4px with nice glow.
  const droneRadius = Math.max(1.0, Math.min(4.0, pxSpacing * 0.28));
  const showGlow = pxSpacing >= 9;
  const glowRadius = droneRadius * 1.5;
  const strokeWidth = droneRadius <= 1.4 ? 0.5 : 1.2;

  if (mapInstance && Array.isArray(drones)) {
    drones.forEach((d) => {
      const p = mapInstance.latLngToContainerPoint([d.lat, d.lng]);
      const ox = toOutX(p.x);
      const oy = toOutY(p.y);

      const isOrigin = d.row === 1 && d.col === 1;

      // Glow halo only when spacing allows
      if (showGlow) {
        ctx.beginPath();
        ctx.arc(ox, oy, glowRadius, 0, Math.PI * 2);
        ctx.fillStyle = isOrigin ? 'rgba(225, 29, 72, 0.35)' : 'rgba(234, 88, 12, 0.25)';
        ctx.fill();
      }

      // Drone core dot
      ctx.beginPath();
      ctx.arc(ox, oy, droneRadius, 0, Math.PI * 2);
      ctx.fillStyle = isOrigin ? '#e11d48' : '#ea580c';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = strokeWidth;
      ctx.stroke();
    });
  }

  // 5. DRAW GROUND CONTROL STATION (🪑 CHAIR & 3 📡 ANTENNAS)
  if (mapInstance && operatorStation && operatorStation.operator) {
    const op = mapInstance.latLngToContainerPoint([operatorStation.operator.lat, operatorStation.operator.lng]);
    const ox = toOutX(op.x);
    const oy = toOutY(op.y);

    // Dynamic scale for chair and antennas based on drone spacing
    const chairR = Math.max(9, Math.min(16, pxSpacing * 1.1));
    const antR = Math.max(5, Math.min(10, pxSpacing * 0.65));
    const chairFontSize = Math.max(10, Math.min(16, pxSpacing * 1.1));
    const antFontSize = Math.max(7, Math.min(11, pxSpacing * 0.75));

    // Swarm link line
    const cp = mapInstance.latLngToContainerPoint([gridCenter.lat, gridCenter.lng]);
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(toOutX(cp.x), toOutY(cp.y));
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Chair Marker Circle
    ctx.beginPath();
    ctx.arc(ox, oy, chairR, 0, Math.PI * 2);
    ctx.fillStyle = '#d97706';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = `${Math.round(chairFontSize)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🪑', ox, oy);

    // 3 Antennas
    if (Array.isArray(operatorStation.antennas)) {
      operatorStation.antennas.forEach((ant) => {
        const ap = mapInstance.latLngToContainerPoint([ant.lat, ant.lng]);
        const ax = toOutX(ap.x);
        const ay = toOutY(ap.y);

        ctx.beginPath();
        ctx.arc(ax, ay, antR, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
        ctx.strokeStyle = '#ea580c';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.font = `${Math.round(antFontSize)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('📡', ax, ay);
      });
    }
  }

  // 6. DRAW ALL DIRECTION ARROWS (FULL LINE + HEAD + MIDPOINT LABEL)
  if (mapInstance && Array.isArray(arrowAnnotations)) {
    arrowAnnotations.forEach((arr) => {
      const sp = mapInstance.latLngToContainerPoint([arr.startLat, arr.startLng]);
      const ep = mapInstance.latLngToContainerPoint([arr.endLat, arr.endLng]);

      const sx = toOutX(sp.x);
      const sy = toOutY(sp.y);
      const ex = toOutX(ep.x);
      const ey = toOutY(ep.y);

      const color = arr.color || '#ea580c';

      // 1. Vector Path Line
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3.5;
      ctx.stroke();

      // 2. Base Circle Marker
      ctx.beginPath();
      ctx.arc(sx, sy, 7, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 3. Arrowhead Polygon at (ex, ey)
      const angle = Math.atan2(ey - sy, ex - sx);
      const headLen = 18;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(
        ex - headLen * Math.cos(angle - Math.PI / 6),
        ey - headLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        ex - headLen * Math.cos(angle + Math.PI / 6),
        ey - headLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 4. Midpoint Label Badge
      const mx = (sx + ex) / 2;
      const my = (sy + ey) / 2;
      ctx.font = 'bold 13px sans-serif';
      const textWidth = ctx.measureText(arr.label || 'DIRECTION ➔').width;
      const badgeW = textWidth + 18;
      const badgeH = 26;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(mx - badgeW / 2, my - badgeH / 2, badgeW, badgeH, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(arr.label || 'DIRECTION ➔', mx, my);
    });
  }

  // 7. DRAW ALL ON-MAP TEXT ANNOTATION BADGES
  if (mapInstance && Array.isArray(textAnnotations)) {
    textAnnotations.forEach((item) => {
      const p = mapInstance.latLngToContainerPoint([item.lat, item.lng]);
      const ox = toOutX(p.x);
      const oy = toOutY(p.y);

      let color = '#ea580c';
      const c = (item.color || item.category || '').toLowerCase();
      if (c === 'yellow' || c === '#eab308' || c === '#d97706') color = '#d97706';
      else if (c === 'red' || c === '#f43f5e' || c === '#e11d48') color = '#e11d48';
      else if (c === 'green' || c === '#10b981' || c === '#059669') color = '#059669';
      else if (c === 'purple' || c === '#a855f7' || c === '#7c3aed') color = '#7c3aed';
      else if (item.color && item.color.startsWith('#')) color = item.color;

      ctx.font = 'bold 13px sans-serif';
      const tm = ctx.measureText(item.text).width;
      const bw = tm + 20;
      const bh = 26;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(ox - bw / 2, oy - bh / 2, bw, bh, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.text, ox, oy);
    });
  }

  // 7.5. DRAW MEASURED DISTANCE LINE IF ACTIVE
  if (mapInstance && measurePointA && measurePointB) {
    const pa = mapInstance.latLngToContainerPoint([measurePointA.lat, measurePointA.lng]);
    const pb = mapInstance.latLngToContainerPoint([measurePointB.lat, measurePointB.lng]);

    const ax = toOutX(pa.x);
    const ay = toOutY(pa.y);
    const bx = toOutX(pb.x);
    const by = toOutY(pb.y);

    // Green dashed measurement line
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 3.5;
    ctx.setLineDash([8, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Pin A Circle & Label
    ctx.beginPath();
    ctx.arc(ax, ay, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#ea580c';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('A', ax, ay);

    // Pin B Circle & Label
    ctx.beginPath();
    ctx.arc(bx, by, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#059669';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('B', bx, by);

    // Midpoint Distance Badge
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const distInfo = calculateDistanceBetweenPoints(measurePointA, measurePointB);
    const badgeText = `${distInfo.meters} m (${distInfo.feet} ft)`;

    ctx.font = 'bold 12px sans-serif';
    const bw = ctx.measureText(badgeText).width + 18;
    const bh = 24;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(mx - bw / 2, my - bh / 2, bw, bh, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#059669';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, mx, my);
  }

  // 8. OVERLAY 1:1 FRAME TOP METRIC BADGES
  // Top-Left: Yellow Barricade Dimensions Badge
  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(18, 18, 320, 68, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#b45309';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('🚧 SAFETY BARRICADE (10 FT BUFFER)', 30, 28);

  ctx.fillStyle = '#0f172a';
  ctx.font = '11.5px sans-serif';
  ctx.fillText(
    `Width: ${barricadeDimensions.widthMeters}m (${barricadeDimensions.widthFeet}ft)  •  Height: ${barricadeDimensions.heightMeters}m (${barricadeDimensions.heightFeet}ft)`,
    30,
    46
  );
  ctx.fillStyle = '#64748b';
  ctx.font = '10.5px sans-serif';
  ctx.fillText(
    `Safe Enclosed Area: ${barricadeDimensions.areaSqM.toLocaleString()} m² (${barricadeDimensions.areaSqFt.toLocaleString()} ft²)`,
    30,
    64
  );

  // Top-Right: Drone Fleet & Altitude Badge
  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.strokeStyle = '#ea580c';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(outputSize - 338, 18, 320, 68, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#c2410c';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('🛸 DRONE SWARM & ALTITUDE', outputSize - 326, 28);

  ctx.fillStyle = '#0f172a';
  ctx.font = '11.5px sans-serif';
  ctx.fillText(
    `Fleet: ${gridRows}×${gridCols} (${gridRows * gridCols} Drones)  •  Spacing: ${spacingMeters}m`,
    outputSize - 326,
    46
  );
  ctx.fillStyle = '#c2410c';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText(
    `Distance to Ground: ${droneAltitude}m AGL (${(droneAltitude * 3.28084).toFixed(1)}ft)`,
    outputSize - 326,
    64
  );

  // Bottom-Left: Frame Aspect Ratio Badge
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(18, outputSize - 40, 150, 24, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FRAME SIZE: 1:1 SQUARE', 93, outputSize - 28);

  // Bottom-Right: North Compass
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.beginPath();
  ctx.arc(outputSize - 32, outputSize - 32, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ea580c';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#e11d48';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('▲ N', outputSize - 32, outputSize - 32);

  return outCanvas.toDataURL('image/png');
}

/**
 * Generates an official, publication-grade PDF mission & site safety report
 * with a strictly 1:1 SQUARE map image frame.
 */
export function generateMissionPDF(data) {
  const {
    mapImageUrl,
    gridRows = 10,
    gridCols = 10,
    spacingMeters = 3,
    gridAngle = 0,
    droneAltitude = 5,
    totalDrones = 100,
    gridCenter = { lat: 18.5362, lng: 73.7929 },
    barricadeFeet = 10,
    barricadeDimensions = {
      widthMeters: 36.1,
      heightMeters: 42.6,
      widthFeet: 118.4,
      heightFeet: 139.8,
      areaSqM: 1537.9,
      areaSqFt: 16553.8
    },
    droneAreaSqM = 900,
    droneAreaSqFt = 9687.5,
    operatorDistance = 5,
    operatorSide = 'south',
    operatorStation = null,
    barricadePoints = [],
    textAnnotations = [],
    arrowAnnotations = []
  } = data;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 182mm

  // 1. TOP HEADER BANNER
  doc.setFillColor(15, 23, 42); // #0f172a
  doc.rect(0, 0, pageWidth, 26, 'F');

  // Accent Line
  doc.setFillColor(234, 88, 12); // Terracotta
  doc.rect(0, 25, pageWidth / 2, 1.5, 'F');
  doc.setFillColor(217, 119, 6); // Warm Amber
  doc.rect(pageWidth / 2, 25, pageWidth / 2, 1.5, 'F');

  // Brand & Report Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('FLYBIT AEROGRID PRO', margin, 11);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(245, 158, 11);
  doc.text('Powered by RĀGHAVA', margin + 60, 11);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(234, 88, 12);
  doc.text('DRONE SWARM MISSION PLAN & SITE SAFETY REPORT', margin, 17);

  const timestamp = new Date().toLocaleString();
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`Generated: ${timestamp}`, pageWidth - margin, 11, { align: 'right' });
  doc.text(`Center GPS: ${gridCenter.lat.toFixed(6)}, ${gridCenter.lng.toFixed(6)}`, pageWidth - margin, 17, { align: 'right' });

  let curY = 30;

  // 2. CAPTURED AERIAL MAP IMAGE (STRICT 1:1 SQUARE FRAME)
  if (mapImageUrl) {
    const squareImgSize = 98; // 98mm x 98mm exact 1:1 square frame
    const imgX = (pageWidth - squareImgSize) / 2; // Perfectly centered horizontally

    doc.setFillColor(241, 245, 249);
    doc.rect(imgX - 1, curY - 1, squareImgSize + 2, squareImgSize + 2, 'F');

    doc.addImage(mapImageUrl, 'PNG', imgX, curY, squareImgSize, squareImgSize);

    // 1:1 Square Border in Warm Terracotta
    doc.setDrawColor(234, 88, 12);
    doc.setLineWidth(0.6);
    doc.rect(imgX, curY, squareImgSize, squareImgSize, 'S');

    // Caption
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      'Figure 1: Captured 1:1 Aerial View showing Drone Grid, 10ft Safety Barricade, Direction Arrows, & GCS',
      pageWidth / 2,
      curY + squareImgSize + 4.5,
      { align: 'center' }
    );

    curY += squareImgSize + 8;
  }

  // Helper for section header
  const drawSectionHeader = (title, colorRGB = [234, 88, 12]) => {
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, curY, contentWidth, 6, 'F');
    doc.setFillColor(...colorRGB);
    doc.rect(margin, curY, 2.5, 6, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(title, margin + 5, curY + 4.2);
    curY += 9;
  };

  // Helper for 2-column key-value rows with robust column spacing
  const drawRow = (label1, val1, label2, val2) => {
    const colW = contentWidth / 2; // 91mm
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(label1, margin, curY);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(val1, margin + 38, curY);

    if (label2) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(label2, margin + colW, curY);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(val2, margin + colW + 38, curY);
    }

    curY += 5.2;
  };

  // 1. SECTION: 🚧 SAFETY BARRICADE SPECIFICATIONS
  drawSectionHeader('1. SAFETY BARRICADE (YELLOW BORDER) SPECIFICATIONS', [217, 119, 6]);
  drawRow(
    'Yellow Border Width:',
    `${barricadeDimensions.widthMeters} m (${barricadeDimensions.widthFeet} ft)`,
    'Yellow Border Height:',
    `${barricadeDimensions.heightMeters} m (${barricadeDimensions.heightFeet} ft)`
  );
  drawRow(
    'Total Barricaded Area:',
    `${barricadeDimensions.areaSqM.toLocaleString()} m² (${barricadeDimensions.areaSqFt.toLocaleString()} ft²)`,
    'Safety Buffer Margin:',
    `${barricadeFeet} Feet (${(barricadeFeet * 0.3048).toFixed(1)} m)`
  );
  drawRow(
    'Operator Enclosure:',
    'Pilot Chair & Antennas Enclosed',
    'Perimeter Border Style:',
    'Safety Amber Dashed Line'
  );

  curY += 3;

  // 2. SECTION: 🛸 DRONE FLEET & FORMATION SPECIFICATIONS
  drawSectionHeader('2. DRONE FLEET & FLIGHT SPECIFICATIONS', [234, 88, 12]);
  drawRow(
    'Formation Pattern:',
    `${gridRows}R × ${gridCols}C (${totalDrones} Drones)`,
    'Drone Field Area:',
    `${droneAreaSqM.toLocaleString()} m² (${droneAreaSqFt.toLocaleString()} ft²)`
  );
  drawRow(
    'Distance Between Drones:',
    `${spacingMeters} m (${(spacingMeters * 3.28084).toFixed(1)} ft)`,
    'Distance to Ground (Alt):',
    `${droneAltitude} m AGL (${(droneAltitude * 3.28084).toFixed(1)} ft)`
  );
  drawRow(
    'Swarm Dimensions:',
    `${(gridCols * spacingMeters).toFixed(1)}m W × ${(gridRows * spacingMeters).toFixed(1)}m H`,
    'Swarm Orientation Angle:',
    `${gridAngle}° Clockwise from North`
  );

  curY += 3;

  // 3. SECTION: 📍 GPS BOUNDARIES & MAP ANNOTATIONS
  drawSectionHeader('3. GPS COORDINATES & ON-MAP ANNOTATIONS', [99, 102, 241]);

  if (barricadePoints && barricadePoints.length >= 4) {
    drawRow(
      'NW Corner GPS:',
      `${barricadePoints[0][0].toFixed(6)}, ${barricadePoints[0][1].toFixed(6)}`,
      'NE Corner GPS:',
      `${barricadePoints[1][0].toFixed(6)}, ${barricadePoints[1][1].toFixed(6)}`
    );
    drawRow(
      'SE Corner GPS:',
      `${barricadePoints[2][0].toFixed(6)}, ${barricadePoints[2][1].toFixed(6)}`,
      'SW Corner GPS:',
      `${barricadePoints[3][0].toFixed(6)}, ${barricadePoints[3][1].toFixed(6)}`
    );
  }

  const textCount = (textAnnotations || []).length;
  const arrowCount = (arrowAnnotations || []).length;
  drawRow(
    'Active Map Notes:',
    `${textCount} Text Label(s) placed`,
    'Direction Arrows:',
    `${arrowCount} Directional Vector(s)`
  );

  // 7. FOOTER BAR
  doc.setFillColor(15, 23, 42);
  doc.rect(0, pageHeight - 11, pageWidth, 11, 'F');

  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('Flybit Dynamics • Powered by RĀGHAVA • Drone Fleet Operations & Site Safety System', margin, pageHeight - 4.5);
  doc.text('Page 1 of 1 • 1:1 Square Frame Site Aerial Inspection', pageWidth - margin, pageHeight - 4.5, { align: 'right' });

  // Download the PDF
  const filename = `AeroGrid_Flight_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);

  return doc;
}
