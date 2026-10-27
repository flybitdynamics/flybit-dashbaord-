import * as turf from '@turf/turf';

/**
 * Calculates meters per degree latitude & longitude at a given latitude
 */
export function getMetersPerDegree(lat) {
  const metersPerDegLat = 111132.954 - 559.822 * Math.cos(2 * lat * Math.PI / 180);
  const metersPerDegLng = 111412.84 * Math.cos(lat * Math.PI / 180);
  return { metersPerDegLat, metersPerDegLng };
}

/**
 * Builds a clean rectangular boundary for a given center, rows, cols, spacing, and angle
 */
export function buildRectangularBoundary(centerLat, centerLng, rows, cols, spacingMeters, angleDeg = 0) {
  const { metersPerDegLat, metersPerDegLng } = getMetersPerDegree(centerLat);

  // Half span with 0.5 spacing margin around outer drones
  const halfWidth = (cols * spacingMeters) / 2;
  const halfHeight = (rows * spacingMeters) / 2;

  const rad = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);

  const localCorners = [
    { x: -halfWidth, y: halfHeight },  // Top-Left (NW)
    { x: halfWidth, y: halfHeight },   // Top-Right (NE)
    { x: halfWidth, y: -halfHeight },  // Bottom-Right (SE)
    { x: -halfWidth, y: -halfHeight }  // Bottom-Left (SW)
  ];

  return localCorners.map((pt) => {
    const rotX = pt.x * cosA - pt.y * sinA;
    const rotY = pt.x * sinA + pt.y * cosA;
    return [
      centerLat + (rotY / metersPerDegLat),
      centerLng + (rotX / metersPerDegLng)
    ];
  });
}

/**
 * Builds a safety barricade boundary offset by a buffer distance (default 10 feet = 3.048 meters).
 * Completely encompasses the drone fleet, the pilot chair, and all 3 antennas with uniform safety clearance.
 */
export function buildBarricadeBoundary(
  centerLat,
  centerLng,
  rows,
  cols,
  spacingMeters,
  bufferFeet = 10,
  angleDeg = 0,
  operatorStation = null,
  includeOperator = true
) {
  const bufferMeters = bufferFeet * 0.3048; // 10 ft = 3.048 m
  const { metersPerDegLat, metersPerDegLng } = getMetersPerDegree(centerLat);

  // Swarm bounds in local grid coordinates
  const halfWidth = (cols * spacingMeters) / 2;
  const halfHeight = (rows * spacingMeters) / 2;

  const rad = (angleDeg * Math.PI) / 180;
  const cosRad = Math.cos(rad);
  const sinRad = Math.sin(rad);

  // Bounding box in local grid coordinates aligned with swarm rotation
  let minLocalX = -halfWidth;
  let maxLocalX = halfWidth;
  let minLocalY = -halfHeight;
  let maxLocalY = halfHeight;

  // Resolve operator station (if not provided but requested, calculate default south station)
  let station = operatorStation;
  if (includeOperator && !station) {
    station = calculateOperatorStation(centerLat, centerLng, rows, cols, spacingMeters, angleDeg);
  }

  if (includeOperator && station) {
    // 1. Enclose pilot on chair
    if (station.operator && station.operator.lat != null && station.operator.lng != null) {
      const dLatM = (station.operator.lat - centerLat) * metersPerDegLat;
      const dLngM = (station.operator.lng - centerLng) * metersPerDegLng;
      const opX = dLngM * Math.cos(-rad) - dLatM * Math.sin(-rad);
      const opY = dLngM * Math.sin(-rad) + dLatM * Math.cos(-rad);

      // Chair & pilot seating radius (1.5m clearance)
      const chairRadius = 1.5;
      minLocalX = Math.min(minLocalX, opX - chairRadius);
      maxLocalX = Math.max(maxLocalX, opX + chairRadius);
      minLocalY = Math.min(minLocalY, opY - chairRadius);
      maxLocalY = Math.max(maxLocalY, opY + chairRadius);
    }

    // 2. Enclose all 3 antennas
    if (Array.isArray(station.antennas)) {
      station.antennas.forEach((ant) => {
        if (ant && ant.lat != null && ant.lng != null) {
          const dLatM = (ant.lat - centerLat) * metersPerDegLat;
          const dLngM = (ant.lng - centerLng) * metersPerDegLng;
          const antX = dLngM * Math.cos(-rad) - dLatM * Math.sin(-rad);
          const antY = dLngM * Math.sin(-rad) + dLatM * Math.cos(-rad);

          // Antenna tripod clearance (0.8m radius)
          const antRadius = 0.8;
          minLocalX = Math.min(minLocalX, antX - antRadius);
          maxLocalX = Math.max(maxLocalX, antX + antRadius);
          minLocalY = Math.min(minLocalY, antY - antRadius);
          maxLocalY = Math.max(maxLocalY, antY + antRadius);
        }
      });
    }
  }

  // Outer safety barricade perimeter margin (10 feet = 3.048m)
  const left = minLocalX - bufferMeters;
  const right = maxLocalX + bufferMeters;
  const bottom = minLocalY - bufferMeters;
  const top = maxLocalY + bufferMeters;

  const localCorners = [
    { x: left, y: top },      // Top-Left (NW)
    { x: right, y: top },     // Top-Right (NE)
    { x: right, y: bottom },  // Bottom-Right (SE)
    { x: left, y: bottom }    // Bottom-Left (SW)
  ];

  return localCorners.map((pt) => {
    const rotX = pt.x * cosRad - pt.y * sinRad;
    const rotY = pt.x * sinRad + pt.y * cosRad;
    return [
      centerLat + (rotY / metersPerDegLat),
      centerLng + (rotX / metersPerDegLng)
    ];
  });
}

/**
 * Calculates the width and height of the yellow safety barricade boundary in meters and feet
 */
export function calculateBarricadeDimensions(
  centerLat,
  centerLng,
  rows,
  cols,
  spacingMeters,
  bufferFeet = 10,
  angleDeg = 0,
  operatorStation = null,
  includeOperator = true
) {
  const bufferMeters = bufferFeet * 0.3048; // 10 ft = 3.048 m
  const { metersPerDegLat, metersPerDegLng } = getMetersPerDegree(centerLat);

  const halfWidth = (cols * spacingMeters) / 2;
  const halfHeight = (rows * spacingMeters) / 2;

  const rad = (angleDeg * Math.PI) / 180;

  let minLocalX = -halfWidth;
  let maxLocalX = halfWidth;
  let minLocalY = -halfHeight;
  let maxLocalY = halfHeight;

  let station = operatorStation;
  if (includeOperator && !station) {
    station = calculateOperatorStation(centerLat, centerLng, rows, cols, spacingMeters, angleDeg);
  }

  if (includeOperator && station) {
    if (station.operator && station.operator.lat != null && station.operator.lng != null) {
      const dLatM = (station.operator.lat - centerLat) * metersPerDegLat;
      const dLngM = (station.operator.lng - centerLng) * metersPerDegLng;
      const opX = dLngM * Math.cos(-rad) - dLatM * Math.sin(-rad);
      const opY = dLngM * Math.sin(-rad) + dLatM * Math.cos(-rad);

      const chairRadius = 1.5;
      minLocalX = Math.min(minLocalX, opX - chairRadius);
      maxLocalX = Math.max(maxLocalX, opX + chairRadius);
      minLocalY = Math.min(minLocalY, opY - chairRadius);
      maxLocalY = Math.max(maxLocalY, opY + chairRadius);
    }

    if (Array.isArray(station.antennas)) {
      station.antennas.forEach((ant) => {
        if (ant && ant.lat != null && ant.lng != null) {
          const dLatM = (ant.lat - centerLat) * metersPerDegLat;
          const dLngM = (ant.lng - centerLng) * metersPerDegLng;
          const antX = dLngM * Math.cos(-rad) - dLatM * Math.sin(-rad);
          const antY = dLngM * Math.sin(-rad) + dLatM * Math.cos(-rad);

          const antRadius = 0.8;
          minLocalX = Math.min(minLocalX, antX - antRadius);
          maxLocalX = Math.max(maxLocalX, antX + antRadius);
          minLocalY = Math.min(minLocalY, antY - antRadius);
          maxLocalY = Math.max(maxLocalY, antY + antRadius);
        }
      });
    }
  }

  const widthM = (maxLocalX - minLocalX) + 2 * bufferMeters;
  const heightM = (maxLocalY - minLocalY) + 2 * bufferMeters;
  const widthFt = widthM / 0.3048;
  const heightFt = heightM / 0.3048;
  const areaSqM = widthM * heightM;
  const areaSqFt = areaSqM * 10.7639;

  return {
    widthMeters: Math.round(widthM * 10) / 10,
    heightMeters: Math.round(heightM * 10) / 10,
    widthFeet: Math.round(widthFt * 10) / 10,
    heightFeet: Math.round(heightFt * 10) / 10,
    areaSqM: Math.round(areaSqM * 10) / 10,
    areaSqFt: Math.round(areaSqFt * 10) / 10
  };
}

/**
 * Generates an exact square or rectangular grid of drones based on rows, cols, and spacing
 */
export function generateRectangularDroneFleet(centerLat, centerLng, rows, cols, spacingMeters, angleDeg = 0, droneLimit = null) {
  const { metersPerDegLat, metersPerDegLng } = getMetersPerDegree(centerLat);

  const rad = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);

  const totalPossible = rows * cols;
  const limit = (droneLimit && droneLimit > 0) ? Math.min(droneLimit, totalPossible) : totalPossible;

  const drones = [];
  let count = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (count >= limit) break;

      // Local (x, y) relative to center
      const x = (c - (cols - 1) / 2) * spacingMeters;
      const y = ((rows - 1) / 2 - r) * spacingMeters;

      const rotX = x * cosA - y * sinA;
      const rotY = x * sinA + y * cosA;

      const lat = centerLat + (rotY / metersPerDegLat);
      const lng = centerLng + (rotX / metersPerDegLng);

      count++;
      drones.push({
        id: `drone-${count}`,
        index: count,
        row: r + 1,
        col: c + 1,
        lat,
        lng,
        altitudeMeters: 5.0,
        battery: 100,
        status: 'ready'
      });
    }
    if (count >= limit) break;
  }

  return { drones, totalCount: drones.length, totalAvailable: totalPossible, isTruncated: false };
}

/**
 * Builds handle positions for center, 4 corners, and 4 edge midpoints
 */
export function buildRectangularHandles(centerLat, centerLng, rows, cols, spacingMeters, angleDeg = 0) {
  const { metersPerDegLat, metersPerDegLng } = getMetersPerDegree(centerLat);
  const halfWidth = (cols * spacingMeters) / 2;
  const halfHeight = (rows * spacingMeters) / 2;

  const rad = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);

  const rotateAndProject = (x, y) => {
    const rx = x * cosA - y * sinA;
    const ry = x * sinA + y * cosA;
    return [
      centerLat + (ry / metersPerDegLat),
      centerLng + (rx / metersPerDegLng)
    ];
  };

  const rotationStemDistance = halfHeight + Math.max(2.0, spacingMeters * 1.5);
  const topEdgeCenter = rotateAndProject(0, halfHeight);
  const rotationPoint = rotateAndProject(0, rotationStemDistance);

  return {
    center: [centerLat, centerLng],
    rotation: {
      point: rotationPoint,
      stem: [topEdgeCenter, rotationPoint]
    },
    corners: [
      { id: 'nw', type: 'corner', point: rotateAndProject(-halfWidth, halfHeight), cursor: 'nwse-resize', label: 'Top-Left' },
      { id: 'ne', type: 'corner', point: rotateAndProject(halfWidth, halfHeight), cursor: 'nesw-resize', label: 'Top-Right' },
      { id: 'se', type: 'corner', point: rotateAndProject(halfWidth, -halfHeight), cursor: 'nwse-resize', label: 'Bottom-Right' },
      { id: 'sw', type: 'corner', point: rotateAndProject(-halfWidth, -halfHeight), cursor: 'nesw-resize', label: 'Bottom-Left' }
    ],
    edges: [
      { id: 'n', type: 'row', point: rotateAndProject(0, halfHeight), cursor: 'ns-resize', label: 'Top Edge (Rows)' },
      { id: 's', type: 'row', point: rotateAndProject(0, -halfHeight), cursor: 'ns-resize', label: 'Bottom Edge (Rows)' },
      { id: 'e', type: 'col', point: rotateAndProject(halfWidth, 0), cursor: 'ew-resize', label: 'Right Edge (Cols)' },
      { id: 'w', type: 'col', point: rotateAndProject(-halfWidth, 0), cursor: 'ew-resize', label: 'Left Edge (Cols)' }
    ]
  };
}

/**
 * Calculates rotation angle in degrees (0 to 360 clockwise from North)
 */
export function calculateRotationAngle(centerLat, centerLng, mouseLat, mouseLng) {
  const { metersPerDegLat, metersPerDegLng } = getMetersPerDegree(centerLat);
  const dLatM = (mouseLat - centerLat) * metersPerDegLat;
  const dLngM = (mouseLng - centerLng) * metersPerDegLng;
  let angle = Math.round(Math.atan2(dLngM, dLatM) * (180 / Math.PI));
  if (angle < 0) angle += 360;
  return angle;
}

/**
 * Calculates positions for Drone Operator Station (on chair) and 3 Antennas
 * Can be positioned on any side (South, North, East, West, or Corners SW, SE, NW, NE)
 * or dragged to any custom position
 */
export function calculateOperatorStation(centerLat, centerLng, rows, cols, spacingMeters, angleDeg = 0, side = 'south', distanceMeters = 5.0, customPos = null) {
  const { metersPerDegLat, metersPerDegLng } = getMetersPerDegree(centerLat);
  const halfWidth = (cols * spacingMeters) / 2;
  const halfHeight = (rows * spacingMeters) / 2;

  const rad = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);

  const rotateAndProject = (x, y) => {
    const rx = x * cosA - y * sinA;
    const ry = x * sinA + y * cosA;
    return [
      centerLat + (ry / metersPerDegLat),
      centerLng + (rx / metersPerDegLng)
    ];
  };

  let opLocalX = 0;
  let opLocalY = -(halfHeight + distanceMeters);

  if (customPos) {
    const dLatM = (customPos.lat - centerLat) * metersPerDegLat;
    const dLngM = (customPos.lng - centerLng) * metersPerDegLng;
    opLocalX = dLngM * Math.cos(-rad) - dLatM * Math.sin(-rad);
    opLocalY = dLngM * Math.sin(-rad) + dLatM * Math.cos(-rad);
  } else {
    switch (side) {
      case 'north':
        opLocalX = 0;
        opLocalY = halfHeight + distanceMeters;
        break;
      case 'south':
        opLocalX = 0;
        opLocalY = -(halfHeight + distanceMeters);
        break;
      case 'east':
        opLocalX = halfWidth + distanceMeters;
        opLocalY = 0;
        break;
      case 'west':
        opLocalX = -(halfWidth + distanceMeters);
        opLocalY = 0;
        break;
      case 'sw':
        opLocalX = -halfWidth - (distanceMeters * 0.707);
        opLocalY = -halfHeight - (distanceMeters * 0.707);
        break;
      case 'se':
        opLocalX = halfWidth + (distanceMeters * 0.707);
        opLocalY = -halfHeight - (distanceMeters * 0.707);
        break;
      case 'nw':
        opLocalX = -halfWidth - (distanceMeters * 0.707);
        opLocalY = halfHeight + (distanceMeters * 0.707);
        break;
      case 'ne':
        opLocalX = halfWidth + (distanceMeters * 0.707);
        opLocalY = halfHeight + (distanceMeters * 0.707);
        break;
      default:
        opLocalX = 0;
        opLocalY = -(halfHeight + distanceMeters);
    }
  }

  const operatorPoint = rotateAndProject(opLocalX, opLocalY);

  // Direction vector pointing from operator station toward swarm center
  const dirX = -opLocalX;
  const dirY = -opLocalY;
  const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
  const fwdX = dirX / len;
  const fwdY = dirY / len;
  const rightX = fwdY;
  const rightY = -fwdX;

  // 3 Antennas arranged in front of the operator chair:
  // Antenna 1: Left (-1.2m lateral, +0.6m forward)
  const ant1LocalX = opLocalX - rightX * 1.2 + fwdX * 0.6;
  const ant1LocalY = opLocalY - rightY * 1.2 + fwdY * 0.6;

  // Antenna 2: Center (0m lateral, +1.0m forward)
  const ant2LocalX = opLocalX + fwdX * 1.0;
  const ant2LocalY = opLocalY + fwdY * 1.0;

  // Antenna 3: Right (+1.2m lateral, +0.6m forward)
  const ant3LocalX = opLocalX + rightX * 1.2 + fwdX * 0.6;
  const ant3LocalY = opLocalY + rightY * 1.2 + fwdY * 0.6;

  const ant1Point = rotateAndProject(ant1LocalX, ant1LocalY);
  const ant2Point = rotateAndProject(ant2LocalX, ant2LocalY);
  const ant3Point = rotateAndProject(ant3LocalX, ant3LocalY);

  // Distance from nearest grid edge
  const distFromEdge = Math.max(0, Math.round(
    Math.sqrt(Math.max(0, Math.abs(opLocalX) - halfWidth) ** 2 + Math.max(0, Math.abs(opLocalY) - halfHeight) ** 2) * 10
  ) / 10);

  return {
    operator: {
      lat: operatorPoint[0],
      lng: operatorPoint[1],
      distanceFromGridMeters: distFromEdge || distanceMeters
    },
    antennas: [
      { id: 'ant-1', name: 'Antenna 1 (RTK Base)', role: 'RTK Differential GPS Base (868 MHz)', lat: ant1Point[0], lng: ant1Point[1] },
      { id: 'ant-2', name: 'Antenna 2 (C2 Link)', role: 'Command & Control Swarm Link (2.4 GHz)', lat: ant2Point[0], lng: ant2Point[1] },
      { id: 'ant-3', name: 'Antenna 3 (Telemetry)', role: 'High-Bandwidth Video/Telemetry (5.8 GHz)', lat: ant3Point[0], lng: ant3Point[1] }
    ]
  };
}

/**
 * Calculates new rows and columns when a corner or edge handle is dragged
 */
export function calculateDimensionsFromHandle(centerLat, centerLng, mouseLat, mouseLng, handleType, spacingMeters, currentRows, currentCols, angleDeg = 0) {
  const { metersPerDegLat, metersPerDegLng } = getMetersPerDegree(centerLat);
  const dLatM = (mouseLat - centerLat) * metersPerDegLat;
  const dLngM = (mouseLng - centerLng) * metersPerDegLng;

  const rad = (angleDeg * Math.PI) / 180;
  const localX = dLngM * Math.cos(-rad) - dLatM * Math.sin(-rad);
  const localY = dLngM * Math.sin(-rad) + dLatM * Math.cos(-rad);

  let newRows = currentRows;
  let newCols = currentCols;

  if (handleType === 'corner' || handleType === 'col') {
    newCols = Math.max(1, Math.min(100, Math.round((2 * Math.abs(localX)) / spacingMeters)));
  }
  if (handleType === 'corner' || handleType === 'row') {
    newRows = Math.max(1, Math.min(100, Math.round((2 * Math.abs(localY)) / spacingMeters)));
  }

  return { newRows, newCols };
}

/**
 * Calculates area of polygon in square meters, square feet, and hectares
 * @param {Array<[number, number]>} latLngs - Array of [lat, lng]
 */
export function calculatePolygonMetrics(latLngs) {
  if (!latLngs || latLngs.length < 3) {
    return { areaSqM: 0, areaSqFt: 0, areaHectares: 0, perimeterMeters: 0 };
  }

  // Turf expects [lng, lat] coordinate format
  const coords = latLngs.map(([lat, lng]) => [lng, lat]);
  // Close the polygon ring if not closed
  if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
    coords.push(coords[0]);
  }

  const polygon = turf.polygon([coords]);
  const areaSqM = turf.area(polygon);
  const perimeterMeters = turf.length(turf.lineString(coords), { units: 'meters' });

  return {
    areaSqM: Math.round(areaSqM * 100) / 100,
    areaSqFt: Math.round(areaSqM * 10.7639 * 100) / 100,
    areaHectares: Math.round((areaSqM / 10000) * 1000) / 1000,
    perimeterMeters: Math.round(perimeterMeters * 100) / 100,
    bbox: turf.bbox(polygon)
  };
}

/**
 * Generates drone grid points at specific meter intervals inside the polygon
 * @param {Array<[number, number]>} latLngs - [[lat, lng], ...]
 * @param {number} spacingMeters - Drone distance interval (e.g., 1m, 2m, 5m)
 * @param {number} angleDeg - Rotation angle of grid in degrees
 * @param {string} layoutType - 'grid' or 'hex'
 * @param {number} maxPoints - Safety cap
 * @param {number|null} droneLimit - Optional specific number of drones to place
 */
export function generateDroneFleet(latLngs, spacingMeters = 1, angleDeg = 0, layoutType = 'grid', maxPoints = 2500, droneLimit = null) {
  if (!latLngs || latLngs.length < 3) return { drones: [], isTruncated: false, totalAvailable: 0 };

  const coords = latLngs.map(([lat, lng]) => [lng, lat]);
  if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
    coords.push(coords[0]);
  }
  const polygon = turf.polygon([coords]);
  const bbox = turf.bbox(polygon); // [minX, minY, maxX, maxY] = [west, south, east, north]

  const centerLat = (bbox[1] + bbox[3]) / 2;
  const centerLng = (bbox[0] + bbox[2]) / 2;

  // Meters per degree approximation at current latitude
  const metersPerDegLat = 111132.954 - 559.822 * Math.cos(2 * centerLat * Math.PI / 180);
  const metersPerDegLng = 111412.84 * Math.cos(centerLat * Math.PI / 180);

  // Compute diagonal size of bounding box in meters
  const widthMeters = turf.distance([bbox[0], centerLat], [bbox[2], centerLat], { units: 'meters' });
  const heightMeters = turf.distance([centerLng, bbox[1]], [centerLng, bbox[3]], { units: 'meters' });
  const diagMeters = Math.sqrt(widthMeters * widthMeters + heightMeters * heightMeters);

  const rad = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);

  const candidates = [];
  let isTruncated = false;

  // We scan along a local 2D grid in meters centered on polygon centroid
  const halfSpan = diagMeters / 2 + spacingMeters;
  const yStep = layoutType === 'hex' ? spacingMeters * (Math.sqrt(3) / 2) : spacingMeters;

  let rowIdx = 0;
  for (let y = -halfSpan; y <= halfSpan; y += yStep) {
    const xOffset = (layoutType === 'hex' && (rowIdx % 2 !== 0)) ? spacingMeters / 2 : 0;
    for (let x = -halfSpan + xOffset; x <= halfSpan; x += spacingMeters) {
      // Rotate (x, y) by angleDeg
      const rotX = x * cosA - y * sinA;
      const rotY = x * sinA + y * cosA;

      // Convert back to lng/lat offset from center
      const ptLng = centerLng + (rotX / metersPerDegLng);
      const ptLat = centerLat + (rotY / metersPerDegLat);

      const pt = turf.point([ptLng, ptLat]);

      // Check if point is inside the boundary
      if (turf.booleanPointInPolygon(pt, polygon)) {
        // Distance from center for cohesive cluster selection when limit is set
        const distSq = (rotX * rotX) + (rotY * rotY);
        candidates.push({
          lat: ptLat,
          lng: ptLng,
          col: Math.round(x / spacingMeters),
          row: rowIdx,
          distSq,
          altitudeMeters: 5.0,
          battery: 100,
          status: 'ready'
        });

        if (candidates.length >= maxPoints) {
          isTruncated = true;
          break;
        }
      }
    }
    if (isTruncated) break;
    rowIdx++;
  }

  const totalAvailable = candidates.length;

  // If a specific number of drones is defined, select closest to center to maintain compact formation
  let selectedCandidates = candidates;
  if (droneLimit !== null && droneLimit !== undefined && droneLimit > 0 && droneLimit < candidates.length) {
    selectedCandidates = [...candidates].sort((a, b) => a.distSq - b.distSq).slice(0, droneLimit);
  }

  // Format drone records with consecutive IDs
  const drones = selectedCandidates.map((c, i) => ({
    id: `drone-${i + 1}`,
    index: i + 1,
    lat: c.lat,
    lng: c.lng,
    col: c.col,
    row: c.row,
    altitudeMeters: c.altitudeMeters,
    battery: c.battery,
    status: c.status
  }));

  return { drones, isTruncated, totalCount: drones.length, totalAvailable };
}

/**
 * Automatically calculates optimal inter-drone spacing (meters) to fit approximately the requested target number of drones
 * @param {Array<[number, number]>} latLngs - Polygon vertices
 * @param {number} targetDroneCount - Desired number of drones (e.g. 10, 50, 100, 250)
 * @param {number} angleDeg - Formation angle
 * @param {string} layoutType - 'grid' or 'hex'
 * @returns {number} optimal spacing in meters rounded to 2 decimal places
 */
export function calculateSpacingForTargetDrones(latLngs, targetDroneCount, angleDeg = 0, layoutType = 'grid') {
  if (!latLngs || latLngs.length < 3 || targetDroneCount <= 0) return 1.0;

  const metrics = calculatePolygonMetrics(latLngs);
  if (metrics.areaSqM <= 0) return 1.0;

  // Theoretical initial estimate: Area / TargetCount = spacing^2
  let initialSpacing = Math.sqrt(metrics.areaSqM / targetDroneCount);
  if (layoutType === 'hex') {
    initialSpacing = Math.sqrt((2 * metrics.areaSqM) / (Math.sqrt(3) * targetDroneCount));
  }

  // Refine using binary search between 0.3m and 50m
  let low = 0.3;
  let high = 50.0;
  let bestSpacing = Math.max(0.3, Math.min(50.0, initialSpacing));

  for (let iter = 0; iter < 12; iter++) {
    const mid = (low + high) / 2;
    const testResult = generateDroneFleet(latLngs, mid, angleDeg, layoutType, 5000);
    const count = testResult.drones.length;

    if (Math.abs(count - targetDroneCount) <= 1) {
      bestSpacing = mid;
      break;
    }

    if (count > targetDroneCount) {
      // Too many drones => need larger spacing
      low = mid;
      bestSpacing = mid;
    } else {
      // Too few drones => need tighter spacing
      high = mid;
      bestSpacing = mid;
    }
  }

  return Math.round(bestSpacing * 100) / 100;
}

/**
 * Pre-defined preset test locations (India)
 */
export const PRESET_LOCATIONS = [
  { name: 'Pune - Pashan / Bavdhan Tech Zone', lat: 18.5362, lng: 73.7929, zoom: 18 },
  { name: 'Bengaluru - Electronic City Campus', lat: 12.8452, lng: 77.6602, zoom: 18 },
  { name: 'Mumbai - BKC Business District', lat: 19.0657, lng: 72.8687, zoom: 18 },
  { name: 'Delhi NCR - Noida Sector 62 Park', lat: 28.6276, lng: 77.3725, zoom: 18 },
  { name: 'Hyderabad - HITEC City Plaza', lat: 17.4474, lng: 78.3762, zoom: 18 },
  { name: 'Ahmedabad - Narendra Modi Stadium', lat: 23.0917, lng: 72.5975, zoom: 18 }
];

/**
 * Calculates distance in meters, feet, kilometers, and compass bearing between two GPS coordinates
 * @param {[number, number] | {lat: number, lng: number}} pt1
 * @param {[number, number] | {lat: number, lng: number}} pt2
 */
export function calculateDistanceBetweenPoints(pt1, pt2) {
  if (!pt1 || !pt2) {
    return { meters: 0, feet: 0, kilometers: 0, bearingDeg: 0, compassDir: 'N' };
  }

  const lat1 = Array.isArray(pt1) ? pt1[0] : pt1.lat;
  const lng1 = Array.isArray(pt1) ? pt1[1] : pt1.lng;
  const lat2 = Array.isArray(pt2) ? pt2[0] : pt2.lat;
  const lng2 = Array.isArray(pt2) ? pt2[1] : pt2.lng;

  const meters = turf.distance([lng1, lat1], [lng2, lat2], { units: 'meters' });
  const feet = meters * 3.28084;
  const kilometers = meters / 1000;

  const { metersPerDegLat, metersPerDegLng } = getMetersPerDegree((lat1 + lat2) / 2);
  const dLatM = (lat2 - lat1) * metersPerDegLat;
  const dLngM = (lng2 - lng1) * metersPerDegLng;
  let bearingDeg = Math.atan2(dLngM, dLatM) * (180 / Math.PI);
  if (bearingDeg < 0) bearingDeg += 360;

  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const dirIdx = Math.round(bearingDeg / 45) % 8;
  const compassDir = directions[dirIdx];

  return {
    meters: Math.round(meters * 100) / 100,
    feet: Math.round(feet * 10) / 10,
    kilometers: Math.round(kilometers * 1000) / 1000,
    bearingDeg: Math.round(bearingDeg * 10) / 10,
    compassDir
  };
}
