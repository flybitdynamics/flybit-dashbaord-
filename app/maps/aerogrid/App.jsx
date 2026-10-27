import React, { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import confetti from 'canvas-confetti';
import {
  getMetersPerDegree,
  calculatePolygonMetrics,
  buildRectangularBoundary,
  buildRectangularHandles,
  buildBarricadeBoundary,
  calculateBarricadeDimensions,
  calculateDimensionsFromHandle,
  calculateRotationAngle,
  calculateOperatorStation,
  generateRectangularDroneFleet,
  PRESET_LOCATIONS,
  calculateDistanceBetweenPoints
} from './droneMath';
import {
  captureMapSnapshot,
  generateMissionPDF
} from './pdfReport';
import {
  Play,
  RotateCcw,
  RotateCw,
  MapPin,
  Download,
  Radio,
  ZoomIn,
  Move,
  X,
  Navigation,
  Square,
  Minus,
  Plus,
  Type,
  ArrowRight,
  ShieldAlert,
  Fence,
  Trash2,
  Camera,
  FileText,
  CheckCircle2,
  Ruler
} from 'lucide-react';
import './App.css';
// FlyBit desk: the bar that links this planner to a show (see app/maps/ShowLink.tsx).
import { ShowLink } from '../ShowLink';

export default function App() {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const polygonLayer = useRef(null);
  const barricadeLayer = useRef(null);
  const droneMarkersGroup = useRef(null);
  const verticesMarkersGroup = useRef(null);
  const operatorGroup = useRef(null);
  const textAnnotationsGroup = useRef(null);
  const arrowAnnotationsGroup = useRef(null);
  const measureLayerGroup = useRef(null);
  const rotationStemPolylineRef = useRef(null);
  const searchMarkerRef = useRef(null);
  const tileLayerRef = useRef(null);

  // Core Swarm State: Strictly Square or Rectangular Grid
  const [gridCenter, setGridCenter] = useState({
    lat: PRESET_LOCATIONS[0].lat,
    lng: PRESET_LOCATIONS[0].lng
  });
  const [gridRows, setGridRows] = useState(10); // Default 10 rows
  const [gridCols, setGridCols] = useState(10); // Default 10 columns
  const [spacingMeters, setSpacingMeters] = useState(1); // Default 1m interval
  const [gridAngle, setGridAngle] = useState(0); // Rotation angle 0 - 360 deg
  const [droneLimit, setDroneLimit] = useState(null); // Optional drone limit

  // 10-Foot Yellow Safety Barricade Perimeter State
  const [showBarricade, setShowBarricade] = useState(true);
  const [barricadeFeet, setBarricadeFeet] = useState(10); // 10 feet buffer
  const [includeOperatorInBarricade, setIncludeOperatorInBarricade] = useState(true); // Enclose chair + 3 antennas
  const barricadeFeetRef = useRef(barricadeFeet);
  barricadeFeetRef.current = barricadeFeet;
  const includeOperatorInBarricadeRef = useRef(includeOperatorInBarricade);
  includeOperatorInBarricadeRef.current = includeOperatorInBarricade;

  // Drone Operator Station & 3 Antennas State (5m from corner/edge)
  const [operatorSide, setOperatorSide] = useState('south'); // 'south' | 'north' | 'east' | 'west' | 'sw' | 'se' | 'nw' | 'ne' | 'custom'
  const [operatorDistance, setOperatorDistance] = useState(5.0); // 5 meters from edge/corner
  const [customOperatorPos, setCustomOperatorPos] = useState(null); // When dragged freely
  const [showOperatorStation, setShowOperatorStation] = useState(true);

  // Map Text Annotations State
  const [textAnnotations, setTextAnnotations] = useState([
    {
      id: 'text-1',
      lat: PRESET_LOCATIONS[0].lat + 0.00016,
      lng: PRESET_LOCATIONS[0].lng,
      text: 'TAKEOFF & LANDING ZONE',
      color: 'yellow'
    }
  ]);
  const [newAnnotationText, setNewAnnotationText] = useState('');

  // Directional Arrow Annotations State
  const [arrowAnnotations, setArrowAnnotations] = useState([
    {
      id: 'arrow-1',
      startLat: PRESET_LOCATIONS[0].lat - 0.00004,
      startLng: PRESET_LOCATIONS[0].lng + 0.00018,
      endLat: PRESET_LOCATIONS[0].lat + 0.00014,
      endLng: PRESET_LOCATIONS[0].lng + 0.00018,
      label: 'FLIGHT HEADING ➔',
      color: '#ea580c'
    }
  ]);

  // Distance Measurement Tool State (Point-to-Point)
  const [isMeasuringMode, setIsMeasuringMode] = useState(false);
  const [measurePointA, setMeasurePointA] = useState(null); // { lat, lng }
  const [measurePointB, setMeasurePointB] = useState(null); // { lat, lng }
  const [measureHoverPoint, setMeasureHoverPoint] = useState(null); // { lat, lng }
  const isMeasuringModeRef = useRef(isMeasuringMode);
  isMeasuringModeRef.current = isMeasuringMode;
  const measurePointARef = useRef(measurePointA);
  measurePointARef.current = measurePointA;
  const measurePointBRef = useRef(measurePointB);
  measurePointBRef.current = measurePointB;

  // Derived Distance Measurement Metrics
  const measurementResult = useMemo(() => {
    if (measurePointA && measurePointB) {
      return calculateDistanceBetweenPoints(measurePointA, measurePointB);
    }
    if (measurePointA && measureHoverPoint) {
      return calculateDistanceBetweenPoints(measurePointA, measureHoverPoint);
    }
    return null;
  }, [measurePointA, measurePointB, measureHoverPoint]);

  // Persistent Refs to preserve drag state across re-renders
  const gridCenterRef = useRef(gridCenter);
  gridCenterRef.current = gridCenter;

  const gridRowsRef = useRef(gridRows);
  gridRowsRef.current = gridRows;

  const gridColsRef = useRef(gridCols);
  gridColsRef.current = gridCols;

  const spacingMetersRef = useRef(spacingMeters);
  spacingMetersRef.current = spacingMeters;

  const gridAngleRef = useRef(gridAngle);
  gridAngleRef.current = gridAngle;

  const operatorSideRef = useRef(operatorSide);
  operatorSideRef.current = operatorSide;

  const operatorDistanceRef = useRef(operatorDistance);
  operatorDistanceRef.current = operatorDistance;

  const customOperatorPosRef = useRef(customOperatorPos);
  customOperatorPosRef.current = customOperatorPos;

  const isDraggingRef = useRef(false);

  // Leaflet Layer Handle References
  const centerMarkerRef = useRef(null);
  const rotationMarkerRef = useRef(null);
  const cornerMarkersRef = useRef([]); // 4 corners: NW, NE, SE, SW
  const edgeMarkersRef = useRef([]);   // 4 edges: N, S, E, W
  const operatorMarkerRef = useRef(null);
  const antennaMarkersRef = useRef([]);

  // UI States
  const [tileLayerType, setTileLayerType] = useState('satellite'); // 'satellite' | 'dark' | 'osm'
  const [isSimulatingFlight, setIsSimulatingFlight] = useState(false);
  const [droneAltitude, setDroneAltitude] = useState(5.0); // meters
  const [isCleanMapMode, setIsCleanMapMode] = useState(false); // Tab clean map mode (hides sidebar & UI)
  const quickPrintRef = useRef(null);

  // Global Keyboard Shortcuts: Tab for Clean Map Mode, Ctrl+P / Cmd+P to directly print & download PDF
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Intercept Ctrl+P or Cmd+P to automatically generate and download the PDF
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        quickPrintRef.current?.();
        return;
      }

      const activeEl = document.activeElement;
      const tagName = activeEl?.tagName?.toLowerCase();
      // Never hijack Tab if user is typing in an input or textarea
      if (tagName === 'input' || tagName === 'textarea' || activeEl?.isContentEditable) {
        return;
      }

      // Shortcut 'm' or 'M' to toggle Distance Measurement Tool
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        setIsMeasuringMode((prev) => !prev);
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        setIsCleanMapMode((prev) => !prev);
      } else if (e.key === 'Escape') {
        if (measurePointBRef.current || measurePointARef.current) {
          setMeasurePointA(null);
          setMeasurePointB(null);
          setMeasureHoverPoint(null);
          return;
        }
        if (isMeasuringModeRef.current) {
          setIsMeasuringMode(false);
          return;
        }
        setIsCleanMapMode((prev) => (prev ? false : prev));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Update map cursor to crosshair when measuring mode is active
  useEffect(() => {
    if (!mapInstance.current) return;
    const container = mapInstance.current.getContainer();
    if (isMeasuringMode) {
      container.style.cursor = 'crosshair';
    } else {
      container.style.cursor = '';
    }
  }, [isMeasuringMode]);

  // Invalidate Leaflet map size when clean map mode toggles so it fills 100vw smoothly
  useEffect(() => {
    if (mapInstance.current) {
      const t1 = setTimeout(() => {
        mapInstance.current?.invalidateSize();
      }, 50);
      const t2 = setTimeout(() => {
        mapInstance.current?.invalidateSize();
      }, 250);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [isCleanMapMode]);

  // Direct Coordinate Relocation State (Search / Coordinate Bar)
  const [singleCoordInput, setSingleCoordInput] = useState(`${PRESET_LOCATIONS[0].lat.toFixed(6)}, ${PRESET_LOCATIONS[0].lng.toFixed(6)}`);
  const [singleCoordError, setSingleCoordError] = useState('');

  // Keep singleCoordInput in sync whenever gridCenter changes outside of active dragging
  useEffect(() => {
    if (!isDraggingRef.current) {
      setSingleCoordInput(`${gridCenter.lat.toFixed(6)}, ${gridCenter.lng.toFixed(6)}`);
    }
  }, [gridCenter]);

  // Derived 4-Corner Boundary Points (Strict Rectangle / Square)
  const points = useMemo(() => {
    return buildRectangularBoundary(
      gridCenter.lat,
      gridCenter.lng,
      gridRows,
      gridCols,
      spacingMeters,
      gridAngle
    );
  }, [gridCenter, gridRows, gridCols, spacingMeters, gridAngle]);

  // Derived Operator Station & 3 Antennas (5 meters from side/corner)
  const operatorStation = useMemo(() => {
    return calculateOperatorStation(
      gridCenter.lat,
      gridCenter.lng,
      gridRows,
      gridCols,
      spacingMeters,
      gridAngle,
      operatorSide,
      operatorDistance,
      customOperatorPos
    );
  }, [gridCenter, gridRows, gridCols, spacingMeters, gridAngle, operatorSide, operatorDistance, customOperatorPos]);

  // Derived 10-Foot Yellow Barricade Boundary (Encloses Drone Fleet + Operator Chair + Antennas)
  const barricadePoints = useMemo(() => {
    return buildBarricadeBoundary(
      gridCenter.lat,
      gridCenter.lng,
      gridRows,
      gridCols,
      spacingMeters,
      barricadeFeet,
      gridAngle,
      operatorStation,
      includeOperatorInBarricade
    );
  }, [gridCenter, gridRows, gridCols, spacingMeters, barricadeFeet, gridAngle, operatorStation, includeOperatorInBarricade]);

  // Derived Drag & Rotation Handle Positions
  const handlePositions = useMemo(() => {
    return buildRectangularHandles(
      gridCenter.lat,
      gridCenter.lng,
      gridRows,
      gridCols,
      spacingMeters,
      gridAngle
    );
  }, [gridCenter, gridRows, gridCols, spacingMeters, gridAngle]);

  // Derived Drone Fleet (Strict Rows x Columns Formation)
  const fleet = useMemo(() => {
    return generateRectangularDroneFleet(
      gridCenter.lat,
      gridCenter.lng,
      gridRows,
      gridCols,
      spacingMeters,
      gridAngle,
      droneLimit
    );
  }, [gridCenter, gridRows, gridCols, spacingMeters, gridAngle, droneLimit]);

  // Area & Perimeter Metrics
  const metrics = useMemo(() => {
    return calculatePolygonMetrics(points);
  }, [points]);

  // Barricade Area Metrics
  const barricadeMetrics = useMemo(() => {
    return calculatePolygonMetrics(barricadePoints);
  }, [barricadePoints]);

  // Derived 10-Foot Yellow Barricade Dimensions (Width, Height, Area in meters and feet)
  const barricadeDimensions = useMemo(() => {
    return calculateBarricadeDimensions(
      gridCenter.lat,
      gridCenter.lng,
      gridRows,
      gridCols,
      spacingMeters,
      barricadeFeet,
      gridAngle,
      operatorStation,
      includeOperatorInBarricade
    );
  }, [gridCenter, gridRows, gridCols, spacingMeters, barricadeFeet, gridAngle, operatorStation, includeOperatorInBarricade]);

  // Derived Drone Fleet Area & Physical Dimensions
  const droneDimensions = useMemo(() => {
    const widthM = gridCols * spacingMeters;
    const heightM = gridRows * spacingMeters;
    const areaSqM = widthM * heightM;
    return {
      widthMeters: widthM,
      heightMeters: heightM,
      widthFeet: Math.round((widthM / 0.3048) * 10) / 10,
      heightFeet: Math.round((heightM / 0.3048) * 10) / 10,
      areaSqM: Math.round(areaSqM * 10) / 10,
      areaSqFt: Math.round((areaSqM * 10.7639) * 10) / 10
    };
  }, [gridRows, gridCols, spacingMeters]);

  // Map Snapshot Capture & PDF Report Modal State
  const [isCapturingMap, setIsCapturingMap] = useState(false);
  const [capturedSnapshot, setCapturedSnapshot] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);

  // Tile provider URLs
  const getTileUrl = (type) => {
    switch (type) {
      case 'satellite':
        return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      case 'dark':
        return 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
      case 'osm':
      default:
        return 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    }
  };

  /**
   * Unified Swarm Move Drag Handler
   * Allows dragging anywhere on the polygon or center handle to smoothly move all drones & update coordinates in real-time
   */
  const startSwarmDrag = (e) => {
    if (isMeasuringModeRef.current || isDraggingRef.current || !mapInstance.current) return;
    const map = mapInstance.current;

    map.dragging.disable();
    isDraggingRef.current = true;
    map.getContainer().style.cursor = 'grabbing';

    const startMouse = e.latlng;
    const startCenter = { ...gridCenterRef.current };
    let lastCenter = { ...startCenter };

    // Capture starting position of all drone circle markers for 60fps translation
    const droneStartPositions = [];
    if (droneMarkersGroup.current) {
      droneMarkersGroup.current.eachLayer((marker) => {
        droneStartPositions.push({
          marker,
          lat: marker.getLatLng().lat,
          lng: marker.getLatLng().lng
        });
      });
    }

    // Capture starting position of operator and antenna markers
    const operatorStartPositions = [];
    if (operatorGroup.current) {
      operatorGroup.current.eachLayer((layer) => {
        if (layer.getLatLng) {
          operatorStartPositions.push({
            layer,
            lat: layer.getLatLng().lat,
            lng: layer.getLatLng().lng
          });
        }
      });
    }

    const onMouseMove = (moveEvent) => {
      const curMouse = moveEvent.latlng;
      const dLat = curMouse.lat - startMouse.lat;
      const dLng = curMouse.lng - startMouse.lng;
      const newCenterLat = startCenter.lat + dLat;
      const newCenterLng = startCenter.lng + dLng;
      lastCenter = { lat: newCenterLat, lng: newCenterLng };

      // 1. Calculate new preview handles and boundary
      const previewHandles = buildRectangularHandles(
        newCenterLat,
        newCenterLng,
        gridRowsRef.current,
        gridColsRef.current,
        spacingMetersRef.current,
        gridAngleRef.current
      );

      // 2. Real-time update of polygon boundary
      if (polygonLayer.current) {
        polygonLayer.current.setLatLngs(previewHandles.corners.map((c) => c.point));
      }

      // Real-time update of yellow barricade perimeter (enclosing fleet + chair + antennas)
      const previewOpStation = calculateOperatorStation(
        newCenterLat,
        newCenterLng,
        gridRowsRef.current,
        gridColsRef.current,
        spacingMetersRef.current,
        gridAngleRef.current,
        operatorSideRef.current,
        operatorDistanceRef.current,
        customOperatorPosRef.current ? {
          lat: customOperatorPosRef.current.lat + dLat,
          lng: customOperatorPosRef.current.lng + dLng
        } : null
      );

      const previewBarricade = buildBarricadeBoundary(
        newCenterLat,
        newCenterLng,
        gridRowsRef.current,
        gridColsRef.current,
        spacingMetersRef.current,
        barricadeFeetRef.current,
        gridAngleRef.current,
        previewOpStation,
        includeOperatorInBarricadeRef.current
      );
      if (barricadeLayer.current) {
        barricadeLayer.current.setLatLngs(previewBarricade);
      }

      // 3. Real-time update of rotation stem and handle
      if (rotationStemPolylineRef.current) {
        rotationStemPolylineRef.current.setLatLngs(previewHandles.rotation.stem);
      }
      if (rotationMarkerRef.current) {
        rotationMarkerRef.current.setLatLng(previewHandles.rotation.point);
      }

      // 4. Real-time update of center move handle
      if (centerMarkerRef.current) {
        centerMarkerRef.current.setLatLng([newCenterLat, newCenterLng]);
      }

      // 5. Real-time update of corners and edges
      cornerMarkersRef.current.forEach((m, idx) => {
        if (m && previewHandles.corners[idx]) m.setLatLng(previewHandles.corners[idx].point);
      });
      edgeMarkersRef.current.forEach((m, idx) => {
        if (m && previewHandles.edges[idx]) m.setLatLng(previewHandles.edges[idx].point);
      });

      // 6. Real-time 60fps shift of ALL drones!
      droneStartPositions.forEach(({ marker, lat, lng }) => {
        marker.setLatLng([lat + dLat, lng + dLng]);
      });

      // Shift operator and antennas together with swarm
      operatorStartPositions.forEach(({ layer, lat, lng }) => {
        layer.setLatLng([lat + dLat, lng + dLng]);
      });

      // 7. REAL-TIME UPDATE OF COORDINATES IN SEARCH BAR!
      setSingleCoordInput(`${newCenterLat.toFixed(6)}, ${newCenterLng.toFixed(6)}`);
      if (searchMarkerRef.current) {
        searchMarkerRef.current.setLatLng([newCenterLat, newCenterLng]);
      }
    };

    const onMouseUp = () => {
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      window.removeEventListener('mouseup', onMouseUp);
      map.dragging.enable();
      map.getContainer().style.cursor = '';
      isDraggingRef.current = false;

      const dLat = lastCenter.lat - startCenter.lat;
      const dLng = lastCenter.lng - startCenter.lng;

      if (customOperatorPos) {
        setCustomOperatorPos((prev) => prev ? { lat: prev.lat + dLat, lng: prev.lng + dLng } : null);
      }

      setGridCenter(lastCenter);
      setSingleCoordInput(`${lastCenter.lat.toFixed(6)}, ${lastCenter.lng.toFixed(6)}`);
      if (searchMarkerRef.current) {
        searchMarkerRef.current.setLatLng([lastCenter.lat, lastCenter.lng]);
      }
    };

    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Initialize Map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const initialLoc = PRESET_LOCATIONS[0];

    // India boundaries
    const indiaSouthWest = L.latLng(6.4, 68.1);
    const indiaNorthEast = L.latLng(37.5, 97.4);
    const indiaBounds = L.latLngBounds(indiaSouthWest, indiaNorthEast);

    const map = L.map(mapRef.current, {
      center: [initialLoc.lat, initialLoc.lng],
      zoom: initialLoc.zoom,
      minZoom: 4,
      maxZoom: 22,
      maxBounds: indiaBounds,
      maxBoundsViscosity: 0.8,
      zoomControl: false
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    tileLayerRef.current = L.tileLayer(getTileUrl(tileLayerType), {
      attribution: '&copy; Esri &mdash; Maxar, Earthstar Geographics',
      maxNativeZoom: 19,
      maxZoom: 22,
      crossOrigin: true
    }).addTo(map);

    // 10-Foot Yellow Safety Barricade Perimeter
    barricadeLayer.current = L.polygon([], {
      className: 'barricade-polygon',
      color: '#d97706',
      weight: 2,
      dashArray: '8, 6',
      fillColor: '#d97706',
      fillOpacity: 0.06,
      interactive: false
    }).addTo(map);

    const handleMapClick = (e) => {
      if (!isMeasuringModeRef.current) return;

      const clickPt = { lat: e.latlng.lat, lng: e.latlng.lng };

      if (!measurePointARef.current) {
        setMeasurePointA(clickPt);
        setMeasurePointB(null);
        setMeasureHoverPoint(null);
      } else if (!measurePointBRef.current) {
        setMeasurePointB(clickPt);
        setMeasureHoverPoint(null);
      } else {
        // Reset and start from new point A
        setMeasurePointA(clickPt);
        setMeasurePointB(null);
        setMeasureHoverPoint(null);
      }
    };

    const handleMouseMove = (e) => {
      if (!isMeasuringModeRef.current) return;
      if (measurePointARef.current && !measurePointBRef.current) {
        setMeasureHoverPoint({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    };

    // Draggable swarm polygon
    polygonLayer.current = L.polygon([], {
      className: 'draggable-swarm-polygon',
      color: '#ea580c',
      weight: 2,
      opacity: 0.9,
      fillColor: '#ea580c',
      fillOpacity: 0.12,
      dashArray: '6, 6',
      interactive: true
    }).addTo(map);

    polygonLayer.current.on('mousedown', (e) => {
      if (isMeasuringModeRef.current) return;
      L.DomEvent.stopPropagation(e);
      startSwarmDrag(e);
    });

    polygonLayer.current.on('click', (e) => {
      if (isMeasuringModeRef.current) {
        handleMapClick(e);
      }
    });

    polygonLayer.current.on('mousemove', (e) => {
      if (isMeasuringModeRef.current) {
        handleMouseMove(e);
      }
    });

    polygonLayer.current.bindTooltip('<b>DRAG SWARM TO MOVE</b><br/>Click & drag anywhere to relocate fleet', {
      direction: 'top',
      sticky: true
    });

    rotationStemPolylineRef.current = L.polyline([], {
      color: '#a855f7',
      weight: 2,
      dashArray: '3, 4',
      opacity: 0.85
    }).addTo(map);

    verticesMarkersGroup.current = L.layerGroup().addTo(map);
    droneMarkersGroup.current = L.layerGroup().addTo(map);
    operatorGroup.current = L.layerGroup().addTo(map);
    textAnnotationsGroup.current = L.layerGroup().addTo(map);
    arrowAnnotationsGroup.current = L.layerGroup().addTo(map);
    measureLayerGroup.current = L.layerGroup().addTo(map);

    map.on('click', handleMapClick);
    map.on('mousemove', handleMouseMove);

    mapInstance.current = map;

    return () => {
      map.off('click', handleMapClick);
      map.off('mousemove', handleMouseMove);
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  // Update Barricade Layer when points or toggle changes
  useEffect(() => {
    if (!mapInstance.current || !barricadeLayer.current) return;
    if (showBarricade) {
      barricadeLayer.current.setLatLngs(barricadePoints);
    } else {
      barricadeLayer.current.setLatLngs([]);
    }
  }, [barricadePoints, showBarricade]);

  // Handle Tile Layer Switch
  useEffect(() => {
    if (!mapInstance.current || !tileLayerRef.current) return;
    mapInstance.current.removeLayer(tileLayerRef.current);
    tileLayerRef.current = L.tileLayer(getTileUrl(tileLayerType), {
      maxNativeZoom: 19,
      maxZoom: 22,
      crossOrigin: true
    }).addTo(mapInstance.current);
    tileLayerRef.current.bringToBack();
  }, [tileLayerType]);

  // Right-Click Context Menu on Map: Instantly Relocate Drone Fleet
  useEffect(() => {
    if (!mapInstance.current) return;
    const map = mapInstance.current;

    const handleContextMenu = (e) => {
      const { lat, lng } = e.latlng;

      const popupContent = document.createElement('div');
      popupContent.style.padding = '4px 2px';
      popupContent.innerHTML = `
        <div style="font-weight:700; color:#ea580c; margin-bottom:4px; font-size:13px; display:flex; align-items:center; gap:6px;">
          <span>📍 Place Drone Fleet Here</span>
        </div>
        <div style="font-size:11px; color:#64748b; margin-bottom:8px;">
          Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}
        </div>
        <button id="btn-relocate-here" style="
          width:100%;
          background:linear-gradient(135deg, #f97316 0%, #ea580c 100%);
          border:none;
          border-radius:6px;
          color:#ffffff;
          font-weight:600;
          font-size:12px;
          padding:7px 12px;
          cursor:pointer;
        ">
          Relocate Fleet Here
        </button>
      `;

      L.popup()
        .setLatLng(e.latlng)
        .setContent(popupContent)
        .openOn(map);

      setTimeout(() => {
        const btn = document.getElementById('btn-relocate-here');
        if (btn) {
          btn.onclick = () => {
            setGridCenter({ lat, lng });
            setSingleCoordInput(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
            if (searchMarkerRef.current) {
              searchMarkerRef.current.setLatLng([lat, lng]);
            }
            map.closePopup();
          };
        }
      }, 50);
    };

    map.on('contextmenu', handleContextMenu);
    return () => {
      map.off('contextmenu', handleContextMenu);
    };
  }, []);

  // Synchronize Drag Handles (Center Move, Rotation, 4 Corners, 4 Edges)
  useEffect(() => {
    if (!mapInstance.current || !verticesMarkersGroup.current) return;

    // Guard: Never recreate markers during active drag!
    if (isDraggingRef.current) return;

    // 1. Center Move Handle (36px glowing cyan handle)
    if (!centerMarkerRef.current) {
      const centerHandle = L.marker(handlePositions.center, {
        icon: L.divIcon({
          className: 'center-move-handle',
          html: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#04101c" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18]
        }),
        zIndexOffset: 3000
      });

      centerHandle.on('mousedown', (e) => {
        L.DomEvent.stopPropagation(e);
        startSwarmDrag(e);
      });

      centerHandle.bindTooltip('<b>DRAG TO MOVE SWARM</b><br/>Click and drag to relocate fleet', {
        direction: 'top'
      });

      verticesMarkersGroup.current.addLayer(centerHandle);
      centerMarkerRef.current = centerHandle;
    } else {
      centerMarkerRef.current.setLatLng(handlePositions.center);
    }

    // 2. Rotation Handle (Glowing Purple circle extending from top center)
    if (!rotationMarkerRef.current) {
      const rotMarker = L.marker(handlePositions.rotation.point, {
        icon: L.divIcon({
          className: 'rotation-handle',
          html: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        }),
        draggable: true,
        zIndexOffset: 3100
      });

      rotMarker.on('dragstart', () => {
        isDraggingRef.current = true;
      });

      rotMarker.on('drag', (e) => {
        const mousePos = e.target.getLatLng();
        const newAngle = calculateRotationAngle(
          gridCenterRef.current.lat,
          gridCenterRef.current.lng,
          mousePos.lat,
          mousePos.lng
        );

        const previewHandles = buildRectangularHandles(
          gridCenterRef.current.lat,
          gridCenterRef.current.lng,
          gridRowsRef.current,
          gridColsRef.current,
          spacingMetersRef.current,
          newAngle
        );

        if (polygonLayer.current) {
          polygonLayer.current.setLatLngs(previewHandles.corners.map((c) => c.point));
        }

        const previewOpStation = calculateOperatorStation(
          gridCenterRef.current.lat,
          gridCenterRef.current.lng,
          gridRowsRef.current,
          gridColsRef.current,
          spacingMetersRef.current,
          newAngle,
          operatorSideRef.current,
          operatorDistanceRef.current,
          customOperatorPosRef.current
        );

        const previewBarricade = buildBarricadeBoundary(
          gridCenterRef.current.lat,
          gridCenterRef.current.lng,
          gridRowsRef.current,
          gridColsRef.current,
          spacingMetersRef.current,
          barricadeFeetRef.current,
          newAngle,
          previewOpStation,
          includeOperatorInBarricadeRef.current
        );
        if (barricadeLayer.current) {
          barricadeLayer.current.setLatLngs(previewBarricade);
        }

        if (rotationStemPolylineRef.current) {
          rotationStemPolylineRef.current.setLatLngs(previewHandles.rotation.stem);
        }

        cornerMarkersRef.current.forEach((m, idx) => {
          if (m && previewHandles.corners[idx]) m.setLatLng(previewHandles.corners[idx].point);
        });

        edgeMarkersRef.current.forEach((m, idx) => {
          if (m && previewHandles.edges[idx]) m.setLatLng(previewHandles.edges[idx].point);
        });
      });

      rotMarker.on('dragend', (e) => {
        isDraggingRef.current = false;
        const mousePos = e.target.getLatLng();
        const finalAngle = calculateRotationAngle(
          gridCenterRef.current.lat,
          gridCenterRef.current.lng,
          mousePos.lat,
          mousePos.lng
        );
        setGridAngle(finalAngle);
      });

      rotMarker.bindTooltip('<b>ROTATE SWARM GRID</b><br/>Drag in circle to rotate grid angle', {
        direction: 'top'
      });

      verticesMarkersGroup.current.addLayer(rotMarker);
      rotationMarkerRef.current = rotMarker;
    } else {
      rotationMarkerRef.current.setLatLng(handlePositions.rotation.point);
    }

    // Update rotation stem line
    if (rotationStemPolylineRef.current) {
      rotationStemPolylineRef.current.setLatLngs(handlePositions.rotation.stem);
    }

    // 3. Corner Handles (Amber dots - resize Rows and Columns simultaneously)
    handlePositions.corners.forEach((corner, idx) => {
      let cornerMarker = cornerMarkersRef.current[idx];
      if (!cornerMarker) {
        cornerMarker = L.marker(corner.point, {
          icon: L.divIcon({
            className: 'vertex-handle',
            iconSize: [18, 18],
            iconAnchor: [9, 9]
          }),
          draggable: true,
          zIndexOffset: 2500
        });

        cornerMarker.on('dragstart', () => {
          isDraggingRef.current = true;
        });

        cornerMarker.on('drag', (e) => {
          const mousePos = e.target.getLatLng();
          const { newRows, newCols } = calculateDimensionsFromHandle(
            gridCenterRef.current.lat,
            gridCenterRef.current.lng,
            mousePos.lat,
            mousePos.lng,
            'corner',
            spacingMetersRef.current,
            gridRowsRef.current,
            gridColsRef.current,
            gridAngleRef.current
          );

          const previewHandles = buildRectangularHandles(
            gridCenterRef.current.lat,
            gridCenterRef.current.lng,
            newRows,
            newCols,
            spacingMetersRef.current,
            gridAngleRef.current
          );

          if (polygonLayer.current) {
            polygonLayer.current.setLatLngs(previewHandles.corners.map((c) => c.point));
          }

          const previewOpStation = calculateOperatorStation(
            gridCenterRef.current.lat,
            gridCenterRef.current.lng,
            newRows,
            newCols,
            spacingMetersRef.current,
            gridAngleRef.current,
            operatorSideRef.current,
            operatorDistanceRef.current,
            customOperatorPosRef.current
          );

          const previewBarricade = buildBarricadeBoundary(
            gridCenterRef.current.lat,
            gridCenterRef.current.lng,
            newRows,
            newCols,
            spacingMetersRef.current,
            barricadeFeetRef.current,
            gridAngleRef.current,
            previewOpStation,
            includeOperatorInBarricadeRef.current
          );
          if (barricadeLayer.current) {
            barricadeLayer.current.setLatLngs(previewBarricade);
          }

          if (rotationStemPolylineRef.current) {
            rotationStemPolylineRef.current.setLatLngs(previewHandles.rotation.stem);
          }

          if (rotationMarkerRef.current) {
            rotationMarkerRef.current.setLatLng(previewHandles.rotation.point);
          }

          cornerMarkersRef.current.forEach((m, cIdx) => {
            if (m && cIdx !== idx && previewHandles.corners[cIdx]) {
              m.setLatLng(previewHandles.corners[cIdx].point);
            }
          });

          edgeMarkersRef.current.forEach((m, eIdx) => {
            if (m && previewHandles.edges[eIdx]) {
              m.setLatLng(previewHandles.edges[eIdx].point);
            }
          });
        });

        cornerMarker.on('dragend', (e) => {
          isDraggingRef.current = false;
          const mousePos = e.target.getLatLng();
          const { newRows, newCols } = calculateDimensionsFromHandle(
            gridCenterRef.current.lat,
            gridCenterRef.current.lng,
            mousePos.lat,
            mousePos.lng,
            'corner',
            spacingMetersRef.current,
            gridRowsRef.current,
            gridColsRef.current,
            gridAngleRef.current
          );
          setGridRows(newRows);
          setGridCols(newCols);
        });

        cornerMarker.bindTooltip(`<b>${corner.label} Corner</b><br/>Drag to resize Rows & Columns`, {
          direction: 'top'
        });

        verticesMarkersGroup.current.addLayer(cornerMarker);
        cornerMarkersRef.current[idx] = cornerMarker;
      } else {
        cornerMarker.setLatLng(corner.point);
      }
    });

    // 4. Edge Midpoint Handles (Green dots - resize Rows only or Columns only)
    handlePositions.edges.forEach((edge, idx) => {
      let edgeMarker = edgeMarkersRef.current[idx];
      if (!edgeMarker) {
        edgeMarker = L.marker(edge.point, {
          icon: L.divIcon({
            className: 'edge-handle',
            iconSize: [14, 14],
            iconAnchor: [7, 7]
          }),
          draggable: true,
          zIndexOffset: 2400
        });

        edgeMarker.on('dragstart', () => {
          isDraggingRef.current = true;
        });

        edgeMarker.on('drag', (e) => {
          const mousePos = e.target.getLatLng();
          const { newRows, newCols } = calculateDimensionsFromHandle(
            gridCenterRef.current.lat,
            gridCenterRef.current.lng,
            mousePos.lat,
            mousePos.lng,
            edge.type,
            spacingMetersRef.current,
            gridRowsRef.current,
            gridColsRef.current,
            gridAngleRef.current
          );

          const previewHandles = buildRectangularHandles(
            gridCenterRef.current.lat,
            gridCenterRef.current.lng,
            newRows,
            newCols,
            spacingMetersRef.current,
            gridAngleRef.current
          );

          if (polygonLayer.current) {
            polygonLayer.current.setLatLngs(previewHandles.corners.map((c) => c.point));
          }

          const previewOpStation = calculateOperatorStation(
            gridCenterRef.current.lat,
            gridCenterRef.current.lng,
            newRows,
            newCols,
            spacingMetersRef.current,
            gridAngleRef.current,
            operatorSideRef.current,
            operatorDistanceRef.current,
            customOperatorPosRef.current
          );

          const previewBarricade = buildBarricadeBoundary(
            gridCenterRef.current.lat,
            gridCenterRef.current.lng,
            newRows,
            newCols,
            spacingMetersRef.current,
            barricadeFeetRef.current,
            gridAngleRef.current,
            previewOpStation,
            includeOperatorInBarricadeRef.current
          );
          if (barricadeLayer.current) {
            barricadeLayer.current.setLatLngs(previewBarricade);
          }

          if (rotationStemPolylineRef.current) {
            rotationStemPolylineRef.current.setLatLngs(previewHandles.rotation.stem);
          }

          if (rotationMarkerRef.current) {
            rotationMarkerRef.current.setLatLng(previewHandles.rotation.point);
          }

          cornerMarkersRef.current.forEach((m, cIdx) => {
            if (m && previewHandles.corners[cIdx]) {
              m.setLatLng(previewHandles.corners[cIdx].point);
            }
          });

          edgeMarkersRef.current.forEach((m, eIdx) => {
            if (m && eIdx !== idx && previewHandles.edges[eIdx]) {
              m.setLatLng(previewHandles.edges[eIdx].point);
            }
          });
        });

        edgeMarker.on('dragend', (e) => {
          isDraggingRef.current = false;
          const mousePos = e.target.getLatLng();
          const { newRows, newCols } = calculateDimensionsFromHandle(
            gridCenterRef.current.lat,
            gridCenterRef.current.lng,
            mousePos.lat,
            mousePos.lng,
            edge.type,
            spacingMetersRef.current,
            gridRowsRef.current,
            gridColsRef.current,
            gridAngleRef.current
          );
          setGridRows(newRows);
          setGridCols(newCols);
        });

        edgeMarker.bindTooltip(`<b>${edge.label}</b><br/>Drag to resize ${edge.type === 'row' ? 'Rows' : 'Columns'}`, {
          direction: 'top'
        });

        verticesMarkersGroup.current.addLayer(edgeMarker);
        edgeMarkersRef.current[idx] = edgeMarker;
      } else {
        edgeMarker.setLatLng(edge.point);
      }
    });

    // Update boundary polygon geometry
    if (polygonLayer.current) {
      polygonLayer.current.setLatLngs(points);
    }
  }, [handlePositions, points]);

  // Render Drone Fleet Markers with zoom-adaptive radius and interactive: false to NEVER block drag interactions!
  useEffect(() => {
    if (!mapInstance.current || !droneMarkersGroup.current) return;

    const renderDrones = () => {
      if (!mapInstance.current || !droneMarkersGroup.current) return;
      droneMarkersGroup.current.clearLayers();

      if (fleet.drones.length === 0) return;

      // Calculate pixel spacing between adjacent drones at current map zoom
      let pxSpacing = 16;
      if (fleet.drones.length >= 2) {
        const p0 = mapInstance.current.latLngToContainerPoint([fleet.drones[0].lat, fleet.drones[0].lng]);
        const p1 = mapInstance.current.latLngToContainerPoint([fleet.drones[1].lat, fleet.drones[1].lng]);
        pxSpacing = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 16;
      }

      // Proportional radius: scales cleanly down to 1.0px at far zoom, up to 4.5px at close zoom
      const droneRadius = Math.max(1.0, Math.min(4.5, pxSpacing * 0.28));
      const strokeWidth = droneRadius <= 1.5 ? 0.6 : 1.2;

      fleet.drones.forEach((drone, idx) => {
        const isLeader = idx === 0;
        const marker = L.circleMarker([drone.lat, drone.lng], {
          radius: isLeader ? droneRadius * 1.35 : droneRadius,
          color: isLeader ? '#e11d48' : '#ffffff',
          weight: strokeWidth,
          fillColor: isLeader ? '#e11d48' : '#ea580c',
          fillOpacity: 0.95,
          interactive: false // Allows clicks and drags to pass directly to polygon and move handle!
        });

        droneMarkersGroup.current.addLayer(marker);
      });
    };

    renderDrones();

    const map = mapInstance.current;
    map.on('zoomend', renderDrones);
    return () => {
      map.off('zoomend', renderDrones);
    };
  }, [fleet]);

  // Render Drone Operator Station (Pilot on Chair) & 3 Antennas (5m from corner/edge)
  useEffect(() => {
    if (!mapInstance.current || !operatorGroup.current) return;
    operatorGroup.current.clearLayers();

    if (!showOperatorStation) return;

    const { operator, antennas } = operatorStation;

    // 1. Connection Line from Operator Station to Swarm
    const linkLine = L.polyline(
      [
        [operator.lat, operator.lng],
        handlePositions.edges[1].point
      ],
      {
        color: '#f59e0b',
        weight: 2,
        dashArray: '4, 4',
        opacity: 0.8
      }
    );
    operatorGroup.current.addLayer(linkLine);

    // 2. Drone Operator Station (Pilot on Chair)
    const operatorMarker = L.marker([operator.lat, operator.lng], {
      icon: L.divIcon({
        className: 'operator-chair-marker',
        html: `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; height:100%; font-size:18px;">
          <span>🪑</span>
        </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      }),
      draggable: true,
      zIndexOffset: 3200
    });

    operatorMarker.on('dragstart', () => {
      isDraggingRef.current = true;
    });

    operatorMarker.on('drag', (e) => {
      const newPos = e.target.getLatLng();
      const tempStation = calculateOperatorStation(
        gridCenterRef.current.lat,
        gridCenterRef.current.lng,
        gridRowsRef.current,
        gridColsRef.current,
        spacingMetersRef.current,
        gridAngleRef.current,
        'custom',
        operatorDistance,
        newPos
      );

      antennas.forEach((ant, idx) => {
        if (antennaMarkersRef.current[idx] && tempStation.antennas[idx]) {
          antennaMarkersRef.current[idx].setLatLng([
            tempStation.antennas[idx].lat,
            tempStation.antennas[idx].lng
          ]);
        }
      });

      linkLine.setLatLngs([
        [newPos.lat, newPos.lng],
        [gridCenterRef.current.lat, gridCenterRef.current.lng]
      ]);

      if (barricadeLayer.current) {
        const previewBarricade = buildBarricadeBoundary(
          gridCenterRef.current.lat,
          gridCenterRef.current.lng,
          gridRowsRef.current,
          gridColsRef.current,
          spacingMetersRef.current,
          barricadeFeetRef.current,
          gridAngleRef.current,
          tempStation,
          includeOperatorInBarricadeRef.current
        );
        barricadeLayer.current.setLatLngs(previewBarricade);
      }
    });

    operatorMarker.on('dragend', (e) => {
      isDraggingRef.current = false;
      const finalPos = e.target.getLatLng();
      setCustomOperatorPos({ lat: finalPos.lat, lng: finalPos.lng });
      setOperatorSide('custom');
    });

    operatorMarker.bindTooltip(
      `<div style="text-align:center;">
        <strong style="color:#f59e0b;">🪑 Drone Operator Station</strong><br/>
        <span>Pilot on Chair (GCS Unit)</span><br/>
        <span>Distance: ${operator.distanceFromGridMeters}m from swarm</span><br/>
        <span style="font-size:10px; color:#94a3b8;">Click & drag to relocate to any side</span>
      </div>`,
      { direction: 'top' }
    );

    operatorGroup.current.addLayer(operatorMarker);
    operatorMarkerRef.current = operatorMarker;

    // 3. Render 3 Antennas beside the chair
    antennaMarkersRef.current = [];
    antennas.forEach((ant) => {
      const antMarker = L.marker([ant.lat, ant.lng], {
        icon: L.divIcon({
          className: 'antenna-marker',
          html: `<div style="display:flex; align-items:center; justify-content:center; width:100%; height:100%; font-size:12px;">📡</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        }),
        zIndexOffset: 3150
      });

      antMarker.bindTooltip(
        `<div style="font-size:11px;">
          <strong style="color:#b45309;">${ant.name}</strong><br/>
          <span style="color:#64748b;">${ant.role}</span>
        </div>`,
        { direction: 'top' }
      );

      operatorGroup.current.addLayer(antMarker);
      antennaMarkersRef.current.push(antMarker);
    });
  }, [operatorStation, showOperatorStation, handlePositions]);

  // Render Map Text Annotations
  useEffect(() => {
    if (!mapInstance.current || !textAnnotationsGroup.current) return;
    textAnnotationsGroup.current.clearLayers();

    textAnnotations.forEach((item) => {
      const marker = L.marker([item.lat, item.lng], {
        icon: L.divIcon({
          className: `map-text-annotation ${item.color || 'yellow'}`,
          html: `<span>${item.text}</span>`,
          iconSize: null
        }),
        draggable: true,
        zIndexOffset: 3300
      });

      marker.on('dragend', (e) => {
        const newPos = e.target.getLatLng();
        setTextAnnotations((prev) =>
          prev.map((a) => (a.id === item.id ? { ...a, lat: newPos.lat, lng: newPos.lng } : a))
        );
      });

      const popupDiv = document.createElement('div');
      popupDiv.style.padding = '4px';
      popupDiv.innerHTML = `
        <div style="font-weight:700; color:#0f172a; margin-bottom:6px; font-size:12px;">Edit Text Label</div>
        <input id="edit-text-${item.id}" type="text" value="${item.text}" style="width:100%; background:#f8fafc; color:#0f172a; border:1px solid #cbd5e1; border-radius:4px; padding:5px 6px; font-size:12px; margin-bottom:8px; outline:none;" />
        <div style="display:flex; gap:6px;">
          <button id="save-text-${item.id}" style="flex:1; background:#ea580c; color:#fff; font-weight:600; border:none; border-radius:4px; padding:5px 8px; cursor:pointer; font-size:11px;">Save</button>
          <button id="del-text-${item.id}" style="background:#fff1f2; color:#e11d48; border:1px solid #fecdd3; border-radius:4px; padding:5px 8px; cursor:pointer; font-size:11px; font-weight:600;">Delete</button>
        </div>
      `;

      marker.bindPopup(popupDiv);

      marker.on('popupopen', () => {
        const saveBtn = document.getElementById(`save-text-${item.id}`);
        const delBtn = document.getElementById(`del-text-${item.id}`);
        const input = document.getElementById(`edit-text-${item.id}`);
        if (saveBtn && input) {
          saveBtn.onclick = () => {
            const val = input.value.trim();
            if (val) {
              setTextAnnotations((prev) =>
                prev.map((a) => (a.id === item.id ? { ...a, text: val } : a))
              );
            }
            marker.closePopup();
          };
        }
        if (delBtn) {
          delBtn.onclick = () => {
            setTextAnnotations((prev) => prev.filter((a) => a.id !== item.id));
            marker.closePopup();
          };
        }
      });

      textAnnotationsGroup.current.addLayer(marker);
    });
  }, [textAnnotations]);

  // Render Directional Arrow Annotations
  useEffect(() => {
    if (!mapInstance.current || !arrowAnnotationsGroup.current) return;
    arrowAnnotationsGroup.current.clearLayers();

    arrowAnnotations.forEach((arrow) => {
      const start = [arrow.startLat, arrow.startLng];
      const end = [arrow.endLat, arrow.endLng];

      // Shaft line
      const line = L.polyline([start, end], {
        color: arrow.color || '#ea580c',
        weight: 3,
        opacity: 0.95
      });
      arrowAnnotationsGroup.current.addLayer(line);

      // Bearing angle from start to end
      const { metersPerDegLat, metersPerDegLng } = getMetersPerDegree(arrow.startLat);
      const dLatM = (arrow.endLat - arrow.startLat) * metersPerDegLat;
      const dLngM = (arrow.endLng - arrow.startLng) * metersPerDegLng;
      const angleDeg = Math.atan2(dLngM, dLatM) * (180 / Math.PI);

      // Arrowhead at tip
      const headMarker = L.marker(end, {
        icon: L.divIcon({
          className: 'arrow-head-icon',
          html: `<div style="transform: rotate(${angleDeg}deg); width:28px; height:28px; display:flex; align-items:center; justify-content:center;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="${arrow.color || '#ea580c'}" stroke="#ffffff" stroke-width="1.5">
              <polygon points="12 2 22 18 12 14 2 18 12 2"/>
            </svg>
          </div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        }),
        draggable: true,
        zIndexOffset: 3200
      });

      headMarker.on('drag', (e) => {
        const newPos = e.target.getLatLng();
        line.setLatLngs([[arrow.startLat, arrow.startLng], [newPos.lat, newPos.lng]]);
      });

      headMarker.on('dragend', (e) => {
        const newPos = e.target.getLatLng();
        setArrowAnnotations((prev) =>
          prev.map((a) => (a.id === arrow.id ? { ...a, endLat: newPos.lat, endLng: newPos.lng } : a))
        );
      });

      arrowAnnotationsGroup.current.addLayer(headMarker);

      // Base Handle at origin
      const baseMarker = L.marker(start, {
        icon: L.divIcon({
          className: 'arrow-handle-marker',
          html: `<div style="background:${arrow.color || '#ea580c'}; width:12px; height:12px; border-radius:50%; border:2px solid #fff;"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        }),
        draggable: true,
        zIndexOffset: 3100
      });

      baseMarker.on('drag', (e) => {
        const newPos = e.target.getLatLng();
        line.setLatLngs([[newPos.lat, newPos.lng], [arrow.endLat, arrow.endLng]]);
      });

      baseMarker.on('dragend', (e) => {
        const newPos = e.target.getLatLng();
        setArrowAnnotations((prev) =>
          prev.map((a) => (a.id === arrow.id ? { ...a, startLat: newPos.lat, startLng: newPos.lng } : a))
        );
      });

      arrowAnnotationsGroup.current.addLayer(baseMarker);

      // Midpoint Label
      const midLat = (arrow.startLat + arrow.endLat) / 2;
      const midLng = (arrow.startLng + arrow.endLng) / 2;
      const labelMarker = L.marker([midLat, midLng], {
        icon: L.divIcon({
          className: 'map-arrow-label',
          html: `<span>${arrow.label || 'DIRECTION ➔'}</span>`,
          iconSize: null
        }),
        interactive: true
      });

      const popupDiv = document.createElement('div');
      popupDiv.style.padding = '4px';
      popupDiv.innerHTML = `
        <div style="font-weight:700; color:#0f172a; margin-bottom:6px; font-size:12px;">Edit Direction Arrow</div>
        <input id="edit-arrow-${arrow.id}" type="text" value="${arrow.label}" style="width:100%; background:#f8fafc; color:#0f172a; border:1px solid #cbd5e1; border-radius:4px; padding:5px 6px; font-size:12px; margin-bottom:8px; outline:none;" />
        <div style="display:flex; gap:6px;">
          <button id="save-arrow-${arrow.id}" style="flex:1; background:#ea580c; color:#fff; font-weight:600; border:none; border-radius:4px; padding:5px 8px; cursor:pointer; font-size:11px;">Save</button>
          <button id="del-arrow-${arrow.id}" style="background:#fff1f2; color:#e11d48; border:1px solid #fecdd3; border-radius:4px; padding:5px 8px; cursor:pointer; font-size:11px; font-weight:600;">Delete</button>
        </div>
      `;

      labelMarker.bindPopup(popupDiv);

      labelMarker.on('popupopen', () => {
        const saveBtn = document.getElementById(`save-arrow-${arrow.id}`);
        const delBtn = document.getElementById(`del-arrow-${arrow.id}`);
        const input = document.getElementById(`edit-arrow-${arrow.id}`);
        if (saveBtn && input) {
          saveBtn.onclick = () => {
            const val = input.value.trim();
            if (val) {
              setArrowAnnotations((prev) =>
                prev.map((a) => (a.id === arrow.id ? { ...a, label: val } : a))
              );
            }
            labelMarker.closePopup();
          };
        }
        if (delBtn) {
          delBtn.onclick = () => {
            setArrowAnnotations((prev) => prev.filter((a) => a.id !== arrow.id));
            labelMarker.closePopup();
          };
        }
      });

      arrowAnnotationsGroup.current.addLayer(labelMarker);
    });
  }, [arrowAnnotations]);

  // Render Distance Measurement Layers (Pins A & B, Measurement Line, Midpoint Badge, Live Hover Guide)
  useEffect(() => {
    if (!mapInstance.current || !measureLayerGroup.current) return;
    measureLayerGroup.current.clearLayers();

    // 1. Point A Pin (Draggable)
    if (measurePointA) {
      const pinA = L.marker([measurePointA.lat, measurePointA.lng], {
        icon: L.divIcon({
          className: 'measure-pin-container',
          html: `
            <div class="measure-pin measure-pin-a" title="Start Point (A) - Drag to adjust">
              <span>A</span>
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        }),
        draggable: true,
        zIndexOffset: 4500
      });

      pinA.on('drag', (e) => {
        const pos = e.target.getLatLng();
        setMeasurePointA({ lat: pos.lat, lng: pos.lng });
      });

      measureLayerGroup.current.addLayer(pinA);
    }

    // 2. Point B Pin (Draggable)
    if (measurePointB) {
      const pinB = L.marker([measurePointB.lat, measurePointB.lng], {
        icon: L.divIcon({
          className: 'measure-pin-container',
          html: `
            <div class="measure-pin measure-pin-b" title="End Point (B) - Drag to adjust">
              <span>B</span>
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        }),
        draggable: true,
        zIndexOffset: 4500
      });

      pinB.on('drag', (e) => {
        const pos = e.target.getLatLng();
        setMeasurePointB({ lat: pos.lat, lng: pos.lng });
      });

      measureLayerGroup.current.addLayer(pinB);
    }

    // 3. Completed Measurement Line & Distance Badge between Point A and Point B
    if (measurePointA && measurePointB) {
      const line = L.polyline(
        [[measurePointA.lat, measurePointA.lng], [measurePointB.lat, measurePointB.lng]],
        {
          color: '#10b981',
          weight: 3.5,
          dashArray: '8, 6',
          opacity: 0.95
        }
      );
      measureLayerGroup.current.addLayer(line);

      const midLat = (measurePointA.lat + measurePointB.lat) / 2;
      const midLng = (measurePointA.lng + measurePointB.lng) / 2;
      const res = calculateDistanceBetweenPoints(measurePointA, measurePointB);

      const badgeMarker = L.marker([midLat, midLng], {
        icon: L.divIcon({
          className: 'measure-line-badge-container',
          html: `
            <div class="measure-line-badge">
              <div class="measure-badge-main">📏 ${res.meters} m <small>(${res.feet} ft)</small></div>
              <div class="measure-badge-sub">${res.bearingDeg}° ${res.compassDir} &bull; ${(res.kilometers).toFixed(3)} km</div>
            </div>
          `,
          iconSize: null
        }),
        interactive: false,
        zIndexOffset: 4600
      });
      measureLayerGroup.current.addLayer(badgeMarker);
    }

    // 4. Live Cursor Guide Line from Point A to hover position
    if (measurePointA && !measurePointB && measureHoverPoint) {
      const guideLine = L.polyline(
        [[measurePointA.lat, measurePointA.lng], [measureHoverPoint.lat, measureHoverPoint.lng]],
        {
          color: '#ea580c',
          weight: 2,
          dashArray: '5, 5',
          opacity: 0.85
        }
      );
      measureLayerGroup.current.addLayer(guideLine);

      const midLat = (measurePointA.lat + measureHoverPoint.lat) / 2;
      const midLng = (measurePointA.lng + measureHoverPoint.lng) / 2;
      const res = calculateDistanceBetweenPoints(measurePointA, measureHoverPoint);

      const guideBadge = L.marker([midLat, midLng], {
        icon: L.divIcon({
          className: 'measure-line-badge-container',
          html: `
            <div class="measure-line-badge guide-badge">
              <span>${res.meters} m (${res.feet} ft)</span>
            </div>
          `,
          iconSize: null
        }),
        interactive: false,
        zIndexOffset: 4600
      });
      measureLayerGroup.current.addLayer(guideBadge);
    }
  }, [measurePointA, measurePointB, measureHoverPoint]);

  // Direct Coordinate Relocation Handler (Single lat, lng or Google Maps URL)
  const handleRelocateToSingleCoordinate = (coordsToUse) => {
    try {
      setSingleCoordError('');
      const inputStr = (typeof coordsToUse === 'string' ? coordsToUse : singleCoordInput).trim();
      if (!inputStr) {
        setSingleCoordError('Please enter latitude, longitude');
        return;
      }

      let lat = null;
      let lng = null;

      const gmapsMatch = inputStr.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (gmapsMatch) {
        lat = parseFloat(gmapsMatch[1]);
        lng = parseFloat(gmapsMatch[2]);
      } else {
        const parts = inputStr.split(/[,\s]+/).filter(Boolean);
        if (parts.length < 2) {
          setSingleCoordError('Format: Latitude, Longitude (e.g. 18.5362, 73.7929)');
          return;
        }
        lat = parseFloat(parts[0]);
        lng = parseFloat(parts[1]);
      }

      if (isNaN(lat) || isNaN(lng)) {
        setSingleCoordError('Invalid numeric coordinates');
        return;
      }

      setGridCenter({ lat, lng });
      setSingleCoordInput(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);

      if (mapInstance.current) {
        mapInstance.current.setView([lat, lng], 19);

        if (searchMarkerRef.current) {
          mapInstance.current.removeLayer(searchMarkerRef.current);
        }

        searchMarkerRef.current = L.marker([lat, lng], {
          icon: L.divIcon({
            className: 'search-pulse-pin',
            html: `<div style="background:#ea580c; width:16px; height:16px; border-radius:50%; border:2px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,0.25);"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          })
        }).addTo(mapInstance.current);

        searchMarkerRef.current.bindPopup(
          `<div style="text-align:center;">
            <strong style="color:#ea580c;">Fleet Relocated</strong><br/>
            <span>Lat: ${lat.toFixed(6)}</span><br/>
            <span>Lng: ${lng.toFixed(6)}</span>
          </div>`
        ).openPopup();
      }
    } catch (err) {
      setSingleCoordError(err.message || 'Error relocating to coordinate');
    }
  };

  // Add a text annotation to the map
  const handleAddText = (textToAdd = 'TAKEOFF ZONE', color = 'yellow') => {
    const newId = `text-${Date.now()}`;
    // Position outside the top edge of barricade
    const offset = 0.00015;
    const newAnnotation = {
      id: newId,
      lat: gridCenter.lat + offset,
      lng: gridCenter.lng + (Math.random() - 0.5) * 0.0001,
      text: textToAdd,
      color
    };
    setTextAnnotations((prev) => [...prev, newAnnotation]);
  };

  // Add a direction arrow annotation to the map
  const handleAddArrow = (label = 'FLIGHT PATH ➔', color = '#ea580c') => {
    const newId = `arrow-${Date.now()}`;
    const newArrow = {
      id: newId,
      startLat: gridCenter.lat,
      startLng: gridCenter.lng + 0.00018,
      endLat: gridCenter.lat + 0.00015,
      endLng: gridCenter.lng + 0.00018,
      label,
      color
    };
    setArrowAnnotations((prev) => [...prev, newArrow]);
  };

  // Launch celebratory simulation
  const handleLaunchMission = () => {
    setIsSimulatingFlight(true);
    confetti({
      particleCount: 90,
      spread: 75,
      origin: { y: 0.6 }
    });
    setTimeout(() => {
      setIsSimulatingFlight(false);
    }, 4000);
  };

  // Export JSON mission plan
  const handleExportMission = () => {
    const missionPlan = {
      timestamp: new Date().toISOString(),
      formationShape: gridRows === gridCols ? 'Square' : 'Rectangle',
      gridRows,
      gridColumns: gridCols,
      gridSpacingMeters: spacingMeters,
      gridAngleDeg: gridAngle,
      targetAltitudeMeters: droneAltitude,
      totalDrones: fleet.drones.length,
      centerCoordinate: gridCenter,
      areaMetrics: metrics,
      safetyBarricade: {
        enabled: showBarricade,
        bufferFeet: barricadeFeet,
        bufferMeters: barricadeFeet * 0.3048,
        enclosesOperatorStation: includeOperatorInBarricade,
        areaMetrics: barricadeMetrics,
        corners: barricadePoints
      },
      groundControlStation: {
        operatorLocation: {
          latitude: operatorStation.operator.lat,
          longitude: operatorStation.operator.lng,
          distanceFromGridMeters: operatorStation.operator.distanceFromGridMeters,
          selectedSide: operatorSide
        },
        antennas: operatorStation.antennas.map((ant) => ({
          id: ant.id,
          name: ant.name,
          role: ant.role,
          latitude: ant.lat,
          longitude: ant.lng
        }))
      },
      mapAnnotations: {
        textNotes: textAnnotations,
        directionArrows: arrowAnnotations
      },
      boundaryCorners: points,
      droneCoordinates: fleet.drones.map((d) => ({
        droneId: d.id,
        index: d.index,
        row: d.row,
        col: d.col,
        latitude: d.lat,
        longitude: d.lng,
        altitude: droneAltitude
      }))
    };

    const blob = new Blob([JSON.stringify(missionPlan, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `drone_mission_full_${gridRows}x${gridCols}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Everything the snapshot and the reports draw from, as the map stands now.
  const currentMissionData = () => ({
        gridRows,
        gridCols,
        spacingMeters,
        gridAngle,
        droneAltitude,
        totalDrones: fleet.drones.length,
        gridCenter,
        points,
        barricadePoints,
        barricadeFeet,
        barricadeDimensions,
        droneAreaSqM: droneDimensions.areaSqM,
        droneAreaSqFt: droneDimensions.areaSqFt,
        drones: fleet.drones,
        operatorStation,
        operatorDistance,
        operatorSide,
        textAnnotations,
        arrowAnnotations,
        measurePointA,
        measurePointB
  });

  // FlyBit desk: the layout on the map, with a snapshot, for saving onto a show.
  const captureLayoutForShow = async () => {
    const imageDataUrl = await captureMapSnapshot(mapRef.current, mapInstance.current, currentMissionData());
    return {
      imageDataUrl,
      layout: {
        center: { lat: gridCenter.lat, lng: gridCenter.lng },
        rows: gridRows,
        cols: gridCols,
        drones: fleet.drones.length,
        spacingMeters,
        angleDeg: gridAngle,
        altitudeMeters: droneAltitude,
        droneAreaSqM: droneDimensions.areaSqM,
        barricadeFeet: showBarricade ? barricadeFeet : 0,
        barricadeWidthM: showBarricade ? barricadeDimensions.widthMeters : 0,
        barricadeHeightM: showBarricade ? barricadeDimensions.heightMeters : 0,
        barricadeAreaSqM: showBarricade ? barricadeDimensions.areaSqM : 0,
        operator: showOperatorStation
          ? (operatorSide === 'custom' ? 'placed by hand' : `${operatorSide}, ${operatorDistance} m from the grid`)
          : 'not shown',
        droneLimit,
        showOperator: showOperatorStation,
        operatorSide,
        operatorDistance,
        operatorPosition: customOperatorPos,
      },
    };
  };

  // FlyBit desk: put a show's saved layout back on the map.
  const restoreShowLayout = (layout) => {
    handleRelocateToSingleCoordinate(`${layout.center.lat}, ${layout.center.lng}`);
    setGridRows(layout.rows);
    setGridCols(layout.cols);
    setSpacingMeters(layout.spacingMeters);
    setGridAngle(layout.angleDeg);
    setDroneAltitude(layout.altitudeMeters);
    setDroneLimit(layout.droneLimit ?? null);
    setShowBarricade(layout.barricadeFeet > 0);
    if (layout.barricadeFeet > 0) setBarricadeFeet(layout.barricadeFeet);
    if (layout.showOperator !== undefined) setShowOperatorStation(layout.showOperator);
    if (layout.operatorSide) setOperatorSide(layout.operatorSide);
    if (layout.operatorDistance) setOperatorDistance(layout.operatorDistance);
    setCustomOperatorPos(layout.operatorSide === 'custom' ? (layout.operatorPosition ?? null) : null);
  };

  // Capture Map Area Snapshot and Open PDF/Inspection Report Modal
  const handleCaptureAndShowReport = async () => {
    setIsCapturingMap(true);
    try {
      const mapElement = mapRef.current;
      const missionData = currentMissionData();

      const imageUrl = await captureMapSnapshot(mapElement, mapInstance.current, missionData);
      setCapturedSnapshot({
        imageUrl,
        timestamp: new Date().toLocaleString(),
        missionData
      });
      setShowReportModal(true);
    } catch (err) {
      console.error('Failed to capture map snapshot:', err);
    } finally {
      setIsCapturingMap(false);
    }
  };

  // Download PDF Report
  const handleDownloadPDF = () => {
    if (!capturedSnapshot) return;
    generateMissionPDF({
      mapImageUrl: capturedSnapshot.imageUrl,
      gridRows,
      gridCols,
      spacingMeters,
      gridAngle,
      droneAltitude,
      totalDrones: fleet.drones.length,
      gridCenter,
      barricadeFeet,
      barricadeDimensions,
      droneAreaSqM: droneDimensions.areaSqM,
      droneAreaSqFt: droneDimensions.areaSqFt,
      operatorDistance,
      operatorSide,
      operatorStation,
      barricadePoints,
      textAnnotations,
      arrowAnnotations
    });
    confetti({ particleCount: 60, spread: 55, origin: { y: 0.6 } });
  };

  // Direct Quick Print & Download PDF: Captures map and automatically downloads PDF on Ctrl+P / Cmd+P
  const handleQuickPrintPDF = async () => {
    if (showReportModal && capturedSnapshot?.imageUrl) {
      handleDownloadPDF();
      return;
    }

    setIsCapturingMap(true);
    try {
      const mapElement = mapRef.current;
      const missionData = {
        gridRows,
        gridCols,
        spacingMeters,
        gridAngle,
        droneAltitude,
        totalDrones: fleet.drones.length,
        gridCenter,
        points,
        barricadePoints,
        barricadeFeet,
        barricadeDimensions,
        droneAreaSqM: droneDimensions.areaSqM,
        droneAreaSqFt: droneDimensions.areaSqFt,
        drones: fleet.drones,
        operatorStation,
        operatorDistance,
        operatorSide,
        textAnnotations,
        arrowAnnotations,
        measurePointA,
        measurePointB
      };

      const imageUrl = await captureMapSnapshot(mapElement, mapInstance.current, missionData);
      setCapturedSnapshot({
        imageUrl,
        timestamp: new Date().toLocaleString(),
        missionData
      });

      generateMissionPDF({
        mapImageUrl: imageUrl,
        gridRows,
        gridCols,
        spacingMeters,
        gridAngle,
        droneAltitude,
        totalDrones: fleet.drones.length,
        gridCenter,
        barricadeFeet,
        barricadeDimensions,
        droneAreaSqM: droneDimensions.areaSqM,
        droneAreaSqFt: droneDimensions.areaSqFt,
        operatorDistance,
        operatorSide,
        operatorStation,
        barricadePoints,
        textAnnotations,
        arrowAnnotations
      });

      confetti({ particleCount: 75, spread: 65, origin: { y: 0.6 } });
    } catch (err) {
      console.error('Failed to quick-print and download PDF:', err);
    } finally {
      setIsCapturingMap(false);
    }
  };

  // Keep quickPrintRef updated with latest state
  quickPrintRef.current = handleQuickPrintPDF;

  // Save Map Screenshot PNG
  const handleDownloadPNG = () => {
    if (!capturedSnapshot?.imageUrl) return;
    const a = document.createElement('a');
    a.href = capturedSnapshot.imageUrl;
    a.download = `AeroGrid_Map_Capture_${Date.now()}.png`;
    a.click();
  };

  // Fit camera to rectangular fleet
  const handleFitPolygon = () => {
    if (!mapInstance.current || points.length === 0) return;
    const bounds = L.latLngBounds(showBarricade ? barricadePoints : points);
    mapInstance.current.fitBounds(bounds, { padding: [60, 60] });
  };

  // Reset to default 10x10 at 1m spacing, 0 deg
  const handleResetGrid = () => {
    setGridRows(10);
    setGridCols(10);
    setSpacingMeters(1);
    setGridAngle(0);
    setDroneLimit(null);
    setOperatorSide('south');
    setOperatorDistance(5.0);
    setCustomOperatorPos(null);
    setBarricadeFeet(10);
  };

  return (
    <div className={`app-container ${isCleanMapMode ? 'clean-map-mode' : ''}`}>
      {/* Map Viewport */}
      <div className={`map-viewport ${isMeasuringMode ? 'measuring-mode' : ''}`}>
        <div ref={mapRef} style={{ height: '100%', width: '100%' }} />

        {/* FlyBit desk: which show this layout is for, and saving it there. */}
        {!isCleanMapMode && (
          <ShowLink
            capture={captureLayoutForShow}
            onRestore={restoreShowLayout}
            onGoTo={(coords) => handleRelocateToSingleCoordinate(coords)}
          />
        )}

        {/* Clean Map Mode Floating Banner */}
        {isCleanMapMode && (
          <div
            className="clean-map-badge"
            onClick={() => setIsCleanMapMode(false)}
            title="Clean Map Mode active: Click to restore interface, or press TAB"
          >
            <span className="clean-dot" />
            <span className="clean-title">Clean Map View</span>
            <span className="clean-hint">
              Press <kbd>TAB</kbd> or <kbd>ESC</kbd> to restore UI
            </span>
            <button
              className="clean-close-btn"
              onClick={(e) => {
                e.stopPropagation();
                setIsCleanMapMode(false);
              }}
              title="Restore Interface"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* Unified Top Control Bar */}
        <div className="map-top-bar">
          {/* Direct Coordinate Relocation Input */}
          <div className="map-coord-box">
            <MapPin size={16} color="#ea580c" style={{ flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Enter Lat, Lng (e.g. 18.5362, 73.7929)"
              value={singleCoordInput}
              onChange={(e) => {
                setSingleCoordInput(e.target.value);
                setSingleCoordError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRelocateToSingleCoordinate();
              }}
              className="coord-direct-input"
            />
            <button
              className="coord-relocate-btn"
              onClick={() => handleRelocateToSingleCoordinate()}
              title="Relocate map and set drones at this coordinate"
            >
              <Navigation size={13} style={{ marginRight: '3px' }} />
              <span>Go to Coordinate</span>
            </button>
            {singleCoordInput && (
              <button
                className="search-clear-btn"
                onClick={() => {
                  setSingleCoordInput('');
                  setSingleCoordError('');
                }}
                title="Clear"
              >
                <X size={13} />
              </button>
            )}
            {singleCoordError && (
              <div style={{ color: '#fb7185', fontSize: '0.75rem', padding: '0 4px' }}>
                {singleCoordError}
              </div>
            )}
          </div>

          {/* Floating Map Controls */}
          <div className="map-floating-toolbar">
            <button
              className={`toolbar-btn ${isMeasuringMode ? 'active' : ''}`}
              onClick={() => {
                setIsMeasuringMode(!isMeasuringMode);
                if (isMeasuringMode) {
                  setMeasureHoverPoint(null);
                }
              }}
              title="Measure distance between any 2 points on the map (or press M)"
              style={isMeasuringMode ? {
                background: '#ecfdf5',
                borderColor: '#a7f3d0',
                color: '#059669'
              } : {}}
            >
              <Ruler size={14} color={isMeasuringMode ? '#059669' : '#ea580c'} />
              <span>{isMeasuringMode ? 'Measuring...' : 'Measure [M]'}</span>
            </button>

            <button
              className="toolbar-btn"
              onClick={() => setIsCleanMapMode(true)}
              title="Clean Map View: Hide all UI and view only map overlays (or press Tab key)"
              style={{
                background: '#fff7ed',
                borderColor: '#fed7aa',
                color: '#c2410c'
              }}
            >
              <Square size={14} />
              <span>Clean View [Tab]</span>
            </button>

            <button
              className="toolbar-btn"
              onClick={handleQuickPrintPDF}
              disabled={isCapturingMap}
              title="Print & automatically download official PDF flight report (or press Ctrl+P)"
              style={{
                background: '#fffbeb',
                borderColor: '#fde68a',
                color: '#b45309'
              }}
            >
              <FileText size={15} color="#b45309" />
              <span>{isCapturingMap ? 'Printing PDF...' : 'Print PDF [Ctrl+P]'}</span>
            </button>

            <button
              className="toolbar-btn"
              onClick={handleCaptureAndShowReport}
              disabled={isCapturingMap}
              title="Inspect 1:1 map capture and full mission safety report"
            >
              <Camera size={15} />
              <span>Inspect</span>
            </button>

            <button className="toolbar-btn" onClick={handleFitPolygon} title="Fit camera to fleet area">
              <ZoomIn size={15} />
              <span>Center</span>
            </button>

            <button
              className="toolbar-btn"
              onClick={handleResetGrid}
              title="Reset to 10x10 standard 1m grid"
            >
              <RotateCcw size={15} />
              <span>Reset 10×10</span>
            </button>
          </div>
        </div>

        {/* Floating Distance Measurement Tool HUD */}
        {(isMeasuringMode || measurePointA) && (
          <div className="measurement-hud-card">
            <div className="measurement-hud-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="measure-icon-badge">
                  <Ruler size={15} color="#10b981" />
                </div>
                <div>
                  <h4 className="measure-hud-title">Distance Measurement</h4>
                  <div className="measure-hud-subtitle">
                    {!measurePointA
                      ? 'Click on map to set Start Point (A)'
                      : !measurePointB
                        ? 'Click on map to set End Point (B)'
                        : 'Points set • Drag A or B to adjust'}
                  </div>
                </div>
              </div>
              <button
                className="measure-close-btn"
                onClick={() => {
                  setIsMeasuringMode(false);
                  setMeasurePointA(null);
                  setMeasurePointB(null);
                  setMeasureHoverPoint(null);
                }}
                title="Exit Measurement Tool"
              >
                <X size={14} />
              </button>
            </div>

            {measurementResult ? (
              <div className="measurement-hud-body">
                <div className="measure-main-readout">
                  <span className="measure-value">{measurementResult.meters}</span>
                  <span className="measure-unit">m</span>
                  <span className="measure-secondary">({measurementResult.feet} ft)</span>
                </div>

                <div className="measure-details-grid">
                  <div className="measure-detail-item">
                    <span className="detail-label">Kilometers:</span>
                    <span className="detail-val">{measurementResult.kilometers} km</span>
                  </div>
                  <div className="measure-detail-item">
                    <span className="detail-label">Heading:</span>
                    <span className="detail-val">{measurementResult.bearingDeg}° {measurementResult.compassDir}</span>
                  </div>
                  {measurePointA && (
                    <div className="measure-detail-item" style={{ gridColumn: 'span 2' }}>
                      <span className="detail-label">Point A GPS:</span>
                      <span className="detail-val gps-text">
                        {measurePointA.lat.toFixed(6)}, {measurePointA.lng.toFixed(6)}
                      </span>
                    </div>
                  )}
                  {measurePointB && (
                    <div className="measure-detail-item" style={{ gridColumn: 'span 2' }}>
                      <span className="detail-label">Point B GPS:</span>
                      <span className="detail-val gps-text">
                        {measurePointB.lat.toFixed(6)}, {measurePointB.lng.toFixed(6)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="measure-actions">
                  <button
                    className="chip-btn"
                    onClick={() => {
                      setMeasurePointA(null);
                      setMeasurePointB(null);
                      setMeasureHoverPoint(null);
                    }}
                    style={{ flex: 1, padding: '6px 10px', fontSize: '11px' }}
                  >
                    Reset Points
                  </button>
                  <button
                    className="chip-btn active"
                    onClick={() => setIsMeasuringMode(false)}
                    style={{ flex: 1, padding: '6px 10px', fontSize: '11px', background: 'rgba(16, 185, 129, 0.2)', borderColor: '#10b981', color: '#6ee7b7' }}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div className="measure-hud-empty">
                <div className="empty-pin-indicator">
                  <span className="pin-pulse" />
                  <span>Click anywhere on the map to set Start Point (A)</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Map Style Selector */}
        <div className="map-layer-selector">
          <button
            className={`layer-btn ${tileLayerType === 'satellite' ? 'active' : ''}`}
            onClick={() => setTileLayerType('satellite')}
          >
            Satellite
          </button>
          <button
            className={`layer-btn ${tileLayerType === 'dark' ? 'active' : ''}`}
            onClick={() => setTileLayerType('dark')}
          >
            Dark Grid
          </button>
          <button
            className={`layer-btn ${tileLayerType === 'osm' ? 'active' : ''}`}
            onClick={() => setTileLayerType('osm')}
          >
            Street Map
          </button>
        </div>

        {/* Live Status Overlay */}
        <div className="map-floating-status" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div className="status-dot" style={{ background: '#10b981' }} />
          <span>
            {gridRows === gridCols ? 'Square Grid' : 'Rectangle Grid'}: {gridRows}R × {gridCols}C ({fleet.drones.length} Drones) &bull;
            🚧 Safety Border: <strong style={{ color: '#b45309' }}>{barricadeDimensions.widthMeters}m W × {barricadeDimensions.heightMeters}m H</strong> ({barricadeDimensions.areaSqFt.toLocaleString()} ft²) &bull;
            🛫 Drone Alt: <strong style={{ color: '#c2410c' }}>{droneAltitude}m AGL</strong> &bull;
            📏 Spacing: <strong>{spacingMeters}m</strong> &bull;
            🪑 Operator: {operatorDistance}m
          </span>
        </div>
      </div>

      {/* Cyberpunk Mission Control Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="brand-header-left">
            <img src="/logo.png" alt="Flybit Dynamics" className="brand-logo-img" />
            <div className="brand-header-divider" />
            <div className="brand-powered-wrap">
              <span className="powered-text">Powered by</span>
              <span className="raghava-brand">RĀGHAVA</span>
            </div>
          </div>

        </div>

        <div className="sidebar-content">
          {/* Card 1: Swarm Grid Dimensions (Rows & Columns) */}
          <div className="glass-card">
            <div className="card-title">
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Square size={16} color="#ea580c" />
                <span>Swarm Dimensions (Rows & Columns)</span>
              </span>
              <span className="badge" style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>
                {gridRows === gridCols ? '⬛ Square' : '▯ Rectangle'}
              </span>
            </div>

            {/* Stepper Inputs for Rows and Columns */}
            <div className="dimension-inputs-row">
              {/* Rows Input */}
              <div className="dimension-card">
                <div className="dimension-header">
                  <span className="dimension-label">ROWS</span>
                  <span style={{ fontSize: '0.7rem', color: '#c2410c' }}>
                    {(gridRows * spacingMeters).toFixed(1)}m
                  </span>
                </div>
                <div className="dimension-stepper">
                  <button
                    className="step-btn"
                    onClick={() => setGridRows((prev) => Math.max(1, prev - 1))}
                    title="Decrease rows"
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={gridRows}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val)) setGridRows(Math.max(1, Math.min(100, val)));
                    }}
                    className="dimension-num-input"
                  />
                  <button
                    className="step-btn"
                    onClick={() => setGridRows((prev) => Math.min(100, prev + 1))}
                    title="Increase rows"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              {/* Columns Input */}
              <div className="dimension-card">
                <div className="dimension-header">
                  <span className="dimension-label">COLUMNS</span>
                  <span style={{ fontSize: '0.7rem', color: '#c2410c' }}>
                    {(gridCols * spacingMeters).toFixed(1)}m
                  </span>
                </div>
                <div className="dimension-stepper">
                  <button
                    className="step-btn"
                    onClick={() => setGridCols((prev) => Math.max(1, prev - 1))}
                    title="Decrease columns"
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={gridCols}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val)) setGridCols(Math.max(1, Math.min(100, val)));
                    }}
                    className="dimension-num-input"
                  />
                  <button
                    className="step-btn"
                    onClick={() => setGridCols((prev) => Math.min(100, prev + 1))}
                    title="Increase columns"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Shape Presets */}
            <div style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '6px' }}>
                QUICK SIZE PRESETS:
              </div>
              <div className="quick-buttons" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                <button
                  className={`chip-btn ${gridRows === 5 && gridCols === 5 ? 'active' : ''}`}
                  onClick={() => { setGridRows(5); setGridCols(5); }}
                >
                  5×5 (25)
                </button>
                <button
                  className={`chip-btn ${gridRows === 10 && gridCols === 10 ? 'active' : ''}`}
                  onClick={() => { setGridRows(10); setGridCols(10); }}
                >
                  10×10 (100)
                </button>
                <button
                  className={`chip-btn ${gridRows === 15 && gridCols === 15 ? 'active' : ''}`}
                  onClick={() => { setGridRows(15); setGridCols(15); }}
                >
                  15×15 (225)
                </button>
                <button
                  className={`chip-btn ${gridRows === 20 && gridCols === 20 ? 'active' : ''}`}
                  onClick={() => { setGridRows(20); setGridCols(20); }}
                >
                  20×20 (400)
                </button>
                <button
                  className={`chip-btn ${gridRows === 8 && gridCols === 16 ? 'active' : ''}`}
                  onClick={() => { setGridRows(8); setGridCols(16); }}
                >
                  8×16 (128)
                </button>
                <button
                  className={`chip-btn ${gridRows === 6 && gridCols === 12 ? 'active' : ''}`}
                  onClick={() => { setGridRows(6); setGridCols(12); }}
                >
                  6×12 (72)
                </button>
              </div>
            </div>

            {/* Total Drones Badge Bar */}
            <div style={{
              marginTop: '12px',
              padding: '8px 12px',
              background: '#fff7ed',
              border: '1px solid #fed7aa',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.82rem'
            }}>
              <span style={{ color: 'var(--text-muted)' }}>Total Swarm Fleet:</span>
              <strong style={{ color: '#c2410c', fontSize: '0.95rem' }}>
                {gridRows} × {gridCols} = {fleet.drones.length} Drones
              </strong>
            </div>
          </div>

          {/* Card 2: 10-Foot Yellow Safety Barricade Perimeter */}
          <div className="glass-card">
            <div className="card-title">
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Fence size={16} color="#d97706" />
                <span>10-Foot Safety Barricade</span>
              </span>
              <button
                className={`chip-btn ${showBarricade ? 'active' : ''}`}
                onClick={() => setShowBarricade(!showBarricade)}
                style={{ padding: '2px 8px', fontSize: '11px' }}
              >
                {showBarricade ? '🚧 Border Active' : 'Hidden'}
              </button>
            </div>

            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
              Safety barricade border enclosing the entire drone flight zone AND pilot chair & antennas with an exclusion buffer (default 10 feet = 3.05m). Keeps the entire operational area fixed and marked.
            </div>

            {showBarricade && (
              <>
                {/* Enclose Operator Station Toggle */}
                <div style={{
                  marginBottom: '12px',
                  padding: '8px 10px',
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px'
                }}>
                  <div style={{ fontSize: '0.75rem', color: '#92400e' }}>
                    <strong>🪑 Cover Pilot Chair & Antennas</strong>
                    <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)' }}>
                      Encloses ground station inside safety border
                    </div>
                  </div>
                  <button
                    className={`chip-btn ${includeOperatorInBarricade ? 'active' : ''}`}
                    onClick={() => setIncludeOperatorInBarricade(!includeOperatorInBarricade)}
                    style={{ padding: '3px 8px', fontSize: '11px', whiteSpace: 'nowrap' }}
                  >
                    {includeOperatorInBarricade ? '✓ Enclosed' : 'Fleet Only'}
                  </button>
                </div>
                {/* Buffer Distance Selection */}
                <div className="control-group">
                  <div className="control-label">
                    <span>Barricade Buffer Distance</span>
                    <span className="control-val-tag" style={{ color: '#b45309' }}>
                      {barricadeFeet} Feet ({(barricadeFeet * 0.3048).toFixed(1)}m)
                    </span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="30"
                    step="5"
                    value={barricadeFeet}
                    onChange={(e) => setBarricadeFeet(parseInt(e.target.value) || 10)}
                    className="custom-range"
                  />
                  <div className="quick-buttons">
                    <button
                      className={`chip-btn ${barricadeFeet === 5 ? 'active' : ''}`}
                      onClick={() => setBarricadeFeet(5)}
                    >
                      5 ft (1.5m)
                    </button>
                    <button
                      className={`chip-btn ${barricadeFeet === 10 ? 'active' : ''}`}
                      onClick={() => setBarricadeFeet(10)}
                    >
                      10 ft (3.05m Standard)
                    </button>
                    <button
                      className={`chip-btn ${barricadeFeet === 15 ? 'active' : ''}`}
                      onClick={() => setBarricadeFeet(15)}
                    >
                      15 ft (4.57m)
                    </button>
                    <button
                      className={`chip-btn ${barricadeFeet === 20 ? 'active' : ''}`}
                      onClick={() => setBarricadeFeet(20)}
                    >
                      20 ft (6.10m)
                    </button>
                  </div>
                </div>

                {/* Yellow Barricade Width & Height Dimensions */}
                <div style={{
                  marginTop: '12px',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px'
                }}>
                  <div style={{
                    padding: '8px 10px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px'
                  }}>
                    <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Safety Border Width
                    </div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#b45309', marginTop: '2px' }}>
                      {barricadeDimensions.widthMeters} m
                    </div>
                    <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)' }}>
                      {barricadeDimensions.widthFeet} ft
                    </div>
                  </div>

                  <div style={{
                    padding: '8px 10px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px'
                  }}>
                    <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Safety Border Height
                    </div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#b45309', marginTop: '2px' }}>
                      {barricadeDimensions.heightMeters} m
                    </div>
                    <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)' }}>
                      {barricadeDimensions.heightFeet} ft
                    </div>
                  </div>
                </div>

                {/* Total Barricaded Area Stats */}
                <div style={{
                  marginTop: '8px',
                  padding: '8px 10px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.78rem'
                }}>
                  <span style={{ color: 'var(--text-body)' }}>Total Barricaded Area:</span>
                  <strong style={{ color: '#b45309' }}>
                    {barricadeDimensions.areaSqFt.toLocaleString()} ft² ({barricadeDimensions.areaSqM.toLocaleString()} m²)
                  </strong>
                </div>

                {/* Capture & View PDF Report Button */}
                <button
                  className="btn-primary"
                  onClick={handleCaptureAndShowReport}
                  disabled={isCapturingMap}
                  style={{
                    marginTop: '10px',
                    width: '100%',
                    padding: '9px 12px',
                    fontSize: '0.82rem',
                    background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                    color: '#ffffff',
                    fontWeight: 700,
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    boxShadow: '0 4px 14px rgba(217, 119, 6, 0.25)',
                    cursor: 'pointer'
                  }}
                >
                  <Camera size={16} color="#ffffff" />
                  <span>{isCapturingMap ? 'Capturing Map Snapshot...' : '📸 Capture Map & View PDF Report'}</span>
                </button>
              </>
            )}
          </div>

          {/* Card 3: Map Text & Direction Arrow Annotations */}
          <div className="glass-card">
            <div className="card-title">
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Type size={16} color="#ea580c" />
                <span>Text Labels & Direction Arrows</span>
              </span>
              <span className="badge">Interactive</span>
            </div>

            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
              Add custom text markers and directional orientation arrows anywhere on the map. Click and drag markers directly on the map.
            </div>

            {/* 1. Add Text Feature */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Type size={12} />
                <span>ADD TEXT LABEL TO MAP:</span>
              </div>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                <input
                  type="text"
                  placeholder="Enter label (e.g. TAKEOFF ZONE)"
                  value={newAnnotationText}
                  onChange={(e) => setNewAnnotationText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newAnnotationText.trim()) {
                      handleAddText(newAnnotationText.trim(), 'yellow');
                      setNewAnnotationText('');
                    }
                  }}
                  style={{
                    flex: 1,
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '6px 8px',
                    color: '#0f172a',
                    fontSize: '0.8rem',
                    outline: 'none'
                  }}
                />
                <button
                  className="coord-relocate-btn"
                  onClick={() => {
                    if (newAnnotationText.trim()) {
                      handleAddText(newAnnotationText.trim(), 'yellow');
                      setNewAnnotationText('');
                    }
                  }}
                  style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                >
                  <Plus size={13} />
                  <span>Add</span>
                </button>
              </div>

              {/* Quick Text Label Presets */}
              <div className="quick-buttons" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                <button className="chip-btn" onClick={() => handleAddText('TAKEOFF ZONE', 'yellow')}>
                  + "TAKEOFF ZONE"
                </button>
                <button className="chip-btn" onClick={() => handleAddText('SPECTATOR STAND', 'green')}>
                  + "SPECTATORS"
                </button>
                <button className="chip-btn" onClick={() => handleAddText('RESTRICTED / NO-FLY', 'red')}>
                  + "NO-FLY ZONE"
                </button>
                <button className="chip-btn" onClick={() => handleAddText('OBSTACLE / TREES', 'red')}>
                  + "OBSTACLE"
                </button>
              </div>
            </div>

            {/* 2. Add Arrow Feature */}
            <div style={{ paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ArrowRight size={12} />
                <span>ADD DIRECTION ARROW TO MAP:</span>
              </div>
              <div className="quick-buttons" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                <button className="chip-btn" onClick={() => handleAddArrow('FLIGHT HEADING ➔', '#ea580c')}>
                  + Flight Heading
                </button>
                <button className="chip-btn" onClick={() => handleAddArrow('WIND DIRECTION ➔', '#d97706')}>
                  + Wind Direction
                </button>
                <button className="chip-btn" onClick={() => handleAddArrow('ENTRY ROUTE ➔', '#059669')}>
                  + Entry Route
                </button>
                <button className="chip-btn" onClick={() => handleAddArrow('SPECTATOR VIEW ➔', '#7c3aed')}>
                  + Audience View
                </button>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '6px' }}>
                💡 Drag the arrow tip on the map to change direction and angle, or drag the base to move!
              </div>
            </div>
          </div>

          {/* Card 4: Drone Operator & 3 Antennas Ground Station */}
          <div className="glass-card">
            <div className="card-title">
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '16px' }}>🪑</span>
                <span>Drone Operator & 3 Antennas</span>
              </span>
              <span className="badge" style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}>
                {operatorDistance}m from Swarm
              </span>
            </div>

            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Drone pilot stationed on chair with 3 high-gain ground antennas (RTK Base, C2 Link, Telemetry). Relocate to any side/corner or drag the chair on the map.
            </div>

            {/* Relocate Operator Side Buttons */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '6px' }}>
                RELOCATE OPERATOR & ANTENNAS TO SIDE:
              </div>
              <div className="quick-buttons" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                <button
                  className={`chip-btn ${operatorSide === 'south' && !customOperatorPos ? 'active' : ''}`}
                  onClick={() => { setOperatorSide('south'); setCustomOperatorPos(null); }}
                >
                  South (Bottom)
                </button>
                <button
                  className={`chip-btn ${operatorSide === 'north' && !customOperatorPos ? 'active' : ''}`}
                  onClick={() => { setOperatorSide('north'); setCustomOperatorPos(null); }}
                >
                  North (Top)
                </button>
                <button
                  className={`chip-btn ${operatorSide === 'east' && !customOperatorPos ? 'active' : ''}`}
                  onClick={() => { setOperatorSide('east'); setCustomOperatorPos(null); }}
                >
                  East (Right)
                </button>
                <button
                  className={`chip-btn ${operatorSide === 'west' && !customOperatorPos ? 'active' : ''}`}
                  onClick={() => { setOperatorSide('west'); setCustomOperatorPos(null); }}
                >
                  West (Left)
                </button>
              </div>

              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', margin: '8px 0 6px 0' }}>
                OR RELOCATE TO CORNER:
              </div>
              <div className="quick-buttons" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                <button
                  className={`chip-btn ${operatorSide === 'sw' && !customOperatorPos ? 'active' : ''}`}
                  onClick={() => { setOperatorSide('sw'); setCustomOperatorPos(null); }}
                >
                  SW Corner
                </button>
                <button
                  className={`chip-btn ${operatorSide === 'se' && !customOperatorPos ? 'active' : ''}`}
                  onClick={() => { setOperatorSide('se'); setCustomOperatorPos(null); }}
                >
                  SE Corner
                </button>
                <button
                  className={`chip-btn ${operatorSide === 'nw' && !customOperatorPos ? 'active' : ''}`}
                  onClick={() => { setOperatorSide('nw'); setCustomOperatorPos(null); }}
                >
                  NW Corner
                </button>
                <button
                  className={`chip-btn ${operatorSide === 'ne' && !customOperatorPos ? 'active' : ''}`}
                  onClick={() => { setOperatorSide('ne'); setCustomOperatorPos(null); }}
                >
                  NE Corner
                </button>
              </div>
            </div>

            {/* Operator Distance Slider */}
            <div className="control-group">
              <div className="control-label">
                <span>Distance from Swarm Perimeter</span>
                <span className="control-val-tag" style={{ color: '#b45309' }}>{operatorDistance} Meters</span>
              </div>
              <input
                type="range"
                min="2"
                max="30"
                step="1"
                value={operatorDistance}
                onChange={(e) => setOperatorDistance(parseFloat(e.target.value) || 5)}
                className="custom-range"
              />
              <div className="quick-buttons">
                <button
                  className={`chip-btn ${operatorDistance === 3 ? 'active' : ''}`}
                  onClick={() => setOperatorDistance(3)}
                >
                  3m
                </button>
                <button
                  className={`chip-btn ${operatorDistance === 5 ? 'active' : ''}`}
                  onClick={() => setOperatorDistance(5)}
                >
                  5m (Standard)
                </button>
                <button
                  className={`chip-btn ${operatorDistance === 8 ? 'active' : ''}`}
                  onClick={() => setOperatorDistance(8)}
                >
                  8m
                </button>
                <button
                  className={`chip-btn ${operatorDistance === 12 ? 'active' : ''}`}
                  onClick={() => setOperatorDistance(12)}
                >
                  12m
                </button>
              </div>
            </div>

            {/* Hardware Status Display */}
            <div style={{
              marginTop: '10px',
              padding: '8px 10px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '0.74rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b45309' }}>
                <span>🪑 Drone Pilot:</span>
                <strong>Active at GCS Station</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                <span>📡 Antenna 1 (RTK Base):</span>
                <span style={{ color: '#0f172a' }}>868 MHz &bull; Precision GPS</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                <span>📡 Antenna 2 (C2 Link):</span>
                <span style={{ color: '#0f172a' }}>2.4 GHz &bull; Swarm Command</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                <span>📡 Antenna 3 (Telemetry):</span>
                <span style={{ color: '#0f172a' }}>5.8 GHz &bull; HD Video Feed</span>
              </div>
            </div>

            <div style={{ fontSize: '0.73rem', color: '#64748b', marginTop: '8px' }}>
              💡 Drag the 🪑 chair marker directly on the map to place the operator station anywhere!
            </div>
          </div>

          {/* Card 5: Rotate Swarm Grid */}
          <div className="glass-card">
            <div className="card-title">
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <RotateCw size={16} color="#7c3aed" />
                <span>Rotate Swarm Grid</span>
              </span>
              <span className="badge" style={{ background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe' }}>
                {gridAngle}° {gridAngle === 0 ? '(North)' : gridAngle === 90 ? '(East)' : gridAngle === 180 ? '(South)' : gridAngle === 270 ? '(West)' : ''}
              </span>
            </div>

            {/* Angle Slider & Angle Input */}
            <div className="control-group">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <input
                  type="range"
                  min="0"
                  max="360"
                  step="1"
                  value={gridAngle}
                  onChange={(e) => setGridAngle(parseInt(e.target.value) || 0)}
                  className="custom-range"
                  style={{ flex: 1 }}
                />
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  minWidth: '65px'
                }}>
                  <input
                    type="number"
                    min="0"
                    max="360"
                    value={gridAngle}
                    onChange={(e) => {
                      let val = parseInt(e.target.value);
                      if (!isNaN(val)) {
                        if (val < 0) val = 0;
                        if (val > 360) val = 360;
                        setGridAngle(val);
                      }
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#7c3aed',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      width: '38px',
                      outline: 'none',
                      textAlign: 'right'
                    }}
                  />
                  <span style={{ color: '#7c3aed', fontSize: '0.8rem', marginLeft: '2px' }}>°</span>
                </div>
              </div>

              {/* Stepper Buttons (-15, -5, +5, +15) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '10px' }}>
                <button
                  className="chip-btn"
                  onClick={() => setGridAngle((prev) => (prev - 15 + 360) % 360)}
                  title="Rotate -15 degrees"
                >
                  -15°
                </button>
                <button
                  className="chip-btn"
                  onClick={() => setGridAngle((prev) => (prev - 5 + 360) % 360)}
                  title="Rotate -5 degrees"
                >
                  -5°
                </button>
                <button
                  className="chip-btn"
                  onClick={() => setGridAngle((prev) => (prev + 5) % 360)}
                  title="Rotate +5 degrees"
                >
                  +5°
                </button>
                <button
                  className="chip-btn"
                  onClick={() => setGridAngle((prev) => (prev + 15) % 360)}
                  title="Rotate +15 degrees"
                >
                  +15°
                </button>
              </div>

              {/* Quick Cardinal Directions */}
              <div className="quick-buttons" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                <button
                  className={`chip-btn ${gridAngle === 0 ? 'active' : ''}`}
                  onClick={() => setGridAngle(0)}
                >
                  0° (N)
                </button>
                <button
                  className={`chip-btn ${gridAngle === 90 ? 'active' : ''}`}
                  onClick={() => setGridAngle(90)}
                >
                  90° (E)
                </button>
                <button
                  className={`chip-btn ${gridAngle === 180 ? 'active' : ''}`}
                  onClick={() => setGridAngle(180)}
                >
                  180° (S)
                </button>
                <button
                  className={`chip-btn ${gridAngle === 270 ? 'active' : ''}`}
                  onClick={() => setGridAngle(270)}
                >
                  270° (W)
                </button>
              </div>

              <div style={{ fontSize: '0.73rem', color: '#64748b', marginTop: '8px' }}>
                💡 Drag the purple rotation handle on the map to spin the fleet!
              </div>
            </div>
          </div>

          {/* Card 6: Inter-Drone Distance & Elevation */}
          <div className="glass-card">
            <div className="card-title">
              <span>Distance Spacing & Altitude</span>
              <span className="badge">{spacingMeters}m Gap</span>
            </div>

            {/* Inter-Drone Distance Control */}
            <div className="control-group">
              <div className="control-label">
                <span>Inter-Drone Distance</span>
                <span className="control-val-tag">{spacingMeters} Meter{spacingMeters > 1 ? 's' : ''}</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="20"
                step="0.5"
                value={spacingMeters}
                onChange={(e) => setSpacingMeters(parseFloat(e.target.value))}
                className="custom-range"
              />
              <div className="quick-buttons">
                <button
                  className={`chip-btn ${spacingMeters === 1 ? 'active' : ''}`}
                  onClick={() => setSpacingMeters(1)}
                >
                  1m (Standard)
                </button>
                <button
                  className={`chip-btn ${spacingMeters === 2 ? 'active' : ''}`}
                  onClick={() => setSpacingMeters(2)}
                >
                  2m
                </button>
                <button
                  className={`chip-btn ${spacingMeters === 3 ? 'active' : ''}`}
                  onClick={() => setSpacingMeters(3)}
                >
                  3m
                </button>
                <button
                  className={`chip-btn ${spacingMeters === 5 ? 'active' : ''}`}
                  onClick={() => setSpacingMeters(5)}
                >
                  5m
                </button>
              </div>
            </div>

            {/* Target Drone Elevation */}
            <div className="control-group" style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)' }}>
              <div className="control-label">
                <span>Target Drone Elevation</span>
                <span className="control-val-tag">{droneAltitude}m AGL</span>
              </div>
              <input
                type="range"
                min="1"
                max="120"
                step="1"
                value={droneAltitude}
                onChange={(e) => setDroneAltitude(parseInt(e.target.value))}
                className="custom-range"
              />
            </div>
          </div>

          {/* Card 7: Distance Measurement Tool */}
          <div className="glass-card" style={isMeasuringMode ? { borderColor: 'rgba(5, 150, 105, 0.4)', boxShadow: '0 4px 16px rgba(5, 150, 105, 0.1)' } : {}}>
            <div className="card-title">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Ruler size={16} color="#059669" />
                <span>Distance Measurement</span>
              </div>
              <span className="badge" style={isMeasuringMode ? { background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' } : {}}>
                {isMeasuringMode ? 'ACTIVE [M]' : measurePointA ? 'PINNED' : 'READY'}
              </span>
            </div>

            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.4 }}>
              Check accurate distance between any 2 points on the map. Click on the map to set Point A & B, or drag pins to adjust.
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <button
                className="btn-primary"
                onClick={() => {
                  setIsMeasuringMode(!isMeasuringMode);
                  if (isMeasuringMode) setMeasureHoverPoint(null);
                }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  fontSize: '0.8rem',
                  background: isMeasuringMode
                    ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                    : '#f1f5f9',
                  color: isMeasuringMode ? '#ffffff' : '#334155',
                  border: isMeasuringMode ? '1px solid #059669' : '1px solid #cbd5e1',
                  boxShadow: isMeasuringMode ? '0 2px 10px rgba(5, 150, 105, 0.25)' : 'none'
                }}
              >
                <Ruler size={15} />
                <span>{isMeasuringMode ? 'Stop Measuring' : 'Measure Distance [M]'}</span>
              </button>

              {(measurePointA || measurePointB) && (
                <button
                  className="chip-btn"
                  onClick={() => {
                    setMeasurePointA(null);
                    setMeasurePointB(null);
                    setMeasureHoverPoint(null);
                  }}
                  title="Clear measurement pins"
                  style={{ padding: '8px 12px' }}
                >
                  <RotateCcw size={14} />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {/* Quick action to start measurement from Swarm Center */}
            {!measurePointA && (
              <button
                className="chip-btn"
                onClick={() => {
                  setMeasurePointA({ lat: gridCenter.lat, lng: gridCenter.lng });
                  setMeasurePointB(null);
                  setMeasureHoverPoint(null);
                  setIsMeasuringMode(true);
                }}
                style={{ width: '100%', marginBottom: '10px', padding: '6px 10px', fontSize: '0.75rem', justifyContent: 'center', gap: '6px' }}
              >
                <MapPin size={13} color="#ea580c" />
                <span>Measure from Drone Grid Center</span>
              </button>
            )}

            {/* Real-time Distance Readout */}
            {measurePointA && measurePointB && measurementResult && (
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Measured Distance:</span>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#059669', fontFamily: 'var(--font-heading)' }}>
                      {measurementResult.meters}
                    </span>
                    <span style={{ fontSize: '0.85rem', color: '#059669', marginLeft: '3px' }}>m</span>
                    <span style={{ fontSize: '0.8rem', color: '#047857', marginLeft: '6px' }}>({measurementResult.feet} ft)</span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.74rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '6px' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Kilometers:</span>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{measurementResult.kilometers} km</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Bearing / Direction:</span>
                    <div style={{ fontWeight: 600, color: '#c2410c' }}>{measurementResult.bearingDeg}° {measurementResult.compassDir}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Point A:</span>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#c2410c' }}>
                      {measurePointA.lat.toFixed(5)}, {measurePointA.lng.toFixed(5)}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Point B:</span>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#059669' }}>
                      {measurePointB.lat.toFixed(5)}, {measurePointB.lng.toFixed(5)}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: '0.7rem', color: '#64748b', fontStyle: 'italic', textAlign: 'center', marginTop: '2px' }}>
                  Tip: Drag Pin A or Pin B directly on the map to adjust.
                </div>
              </div>
            )}

            {isMeasuringMode && !measurePointA && (
              <div style={{
                background: '#ecfdf5',
                border: '1px dashed #6ee7b7',
                borderRadius: '8px',
                padding: '10px',
                fontSize: '0.75rem',
                color: '#065f46',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span className="clean-dot" />
                <span>Step 1: Click anywhere on the map to set <strong>Start Point (A)</strong></span>
              </div>
            )}

            {isMeasuringMode && measurePointA && !measurePointB && (
              <div style={{
                background: '#fff7ed',
                border: '1px dashed #fdba74',
                borderRadius: '8px',
                padding: '10px',
                fontSize: '0.75rem',
                color: '#9a3412',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span className="clean-dot" style={{ background: '#ea580c' }} />
                <span>Step 2: Click on the map to set <strong>End Point (B)</strong></span>
              </div>
            )}
          </div>

          {/* Card 8: Area & Perimeter Metrics */}
          <div className="glass-card">
            <div className="card-title">
              <span>Calculated Area Metrics</span>
              <span className="badge">{metrics.areaSqM.toLocaleString()} m²</span>
            </div>

            <div className="metrics-grid">
              <div className="metric-box">
                <div className="metric-label">Drone Area</div>
                <div className="metric-value">
                  {metrics.areaSqM.toLocaleString()}
                  <span className="metric-unit">m²</span>
                </div>
              </div>
              <div className="metric-box">
                <div className="metric-label">Square Feet</div>
                <div className="metric-value">
                  {metrics.areaSqFt.toLocaleString()}
                  <span className="metric-unit">ft²</span>
                </div>
              </div>
              <div className="metric-box">
                <div className="metric-label">Physical Span</div>
                <div className="metric-value" style={{ fontSize: '1rem', color: '#059669' }}>
                  {(gridCols * spacingMeters).toFixed(0)}m × {(gridRows * spacingMeters).toFixed(0)}m
                </div>
              </div>
              <div className="metric-box">
                <div className="metric-label">Active Fleet</div>
                <div className="metric-value" style={{ color: '#ea580c' }}>
                  {fleet.drones.length.toLocaleString()}
                  <span className="metric-unit">units</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              className="btn-primary"
              onClick={handleCaptureAndShowReport}
              disabled={isCapturingMap || fleet.drones.length === 0}
              style={{
                background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                color: '#ffffff',
                fontWeight: 700,
                boxShadow: '0 4px 14px rgba(217, 119, 6, 0.25)'
              }}
            >
              <Camera size={18} color="#ffffff" />
              <span>{isCapturingMap ? 'Capturing Map Snapshot...' : '📸 Capture Map & View PDF Report'}</span>
            </button>

            <button
              className="btn-primary"
              onClick={handleLaunchMission}
              disabled={fleet.drones.length === 0 || isSimulatingFlight}
            >
              <Play size={18} />
              <span>{isSimulatingFlight ? 'Simulating Swarm Flight...' : 'Simulate Fleet Takeoff'}</span>
            </button>

            <button
              className="btn-secondary"
              onClick={handleExportMission}
              disabled={fleet.drones.length === 0}
            >
              <Download size={16} />
              <span>Export Waypoint Mission (JSON / GPS)</span>
            </button>

            <button
              className="btn-secondary"
              onClick={handleResetGrid}
            >
              <RotateCcw size={15} />
              <span>Reset Grid to 10×10 (0°)</span>
            </button>
          </div>

          {/* Sidebar Footer Branding: Logo + Powered by RĀGHAVA */}
          <div className="sidebar-brand-footer">
            <div className="footer-brand-wrap">
              <img src="/logo.png" alt="Flybit Dynamics" className="footer-brand-logo" />
              <div className="footer-brand-divider" />
              <div className="footer-brand-powered">
                <span className="footer-powered-by">Powered by</span>
                <span className="footer-raghava-name">RĀGHAVA</span>
              </div>
            </div>
            <div className="footer-brand-sub">
              AEROGRID PRO &bull; SWARM INTELLIGENCE & SITE SAFETY
            </div>
          </div>
        </div>
      </div>

      {/* Flight Plan & Site Safety Inspection Modal */}
      {showReportModal && capturedSnapshot && (
        <div className="report-modal-backdrop" onClick={() => setShowReportModal(false)}>
          <div className="report-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="report-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <img src="/logo.png" alt="Flybit Dynamics" style={{ height: '26px', objectFit: 'contain' }} />
                <div style={{ width: '1px', height: '22px', background: 'rgba(255, 255, 255, 0.2)' }} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '0.98rem', color: '#ffffff', fontFamily: 'var(--font-heading)' }}>
                      Site Aerial Inspection & Mission Safety Report
                    </h3>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                      Powered by <strong style={{ color: '#ea580c', letterSpacing: '0.04em' }}>RĀGHAVA</strong>
                    </span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    Captured at {capturedSnapshot.timestamp} &bull; Coordinates: {gridCenter.lat.toFixed(6)}, {gridCenter.lng.toFixed(6)}
                  </div>
                </div>
              </div>
              <button
                className="chip-btn"
                onClick={() => setShowReportModal(false)}
                style={{ padding: '4px 8px' }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="report-modal-body">
              {/* Captured Map Aerial View */}
              <div className="report-preview-img-container">
                <img
                  src={capturedSnapshot.imageUrl}
                  alt="Captured Drone Site Aerial View"
                  className="report-preview-img"
                />
                <div style={{
                  position: 'absolute',
                  top: '10px',
                  left: '10px',
                  background: 'rgba(255, 255, 255, 0.96)',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#0f172a',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
                }}>
                  <div className="status-dot" style={{ background: '#ea580c' }} />
                  <span>Captured Live Map Aerial View</span>
                </div>
              </div>

              {/* 4 Detailed Specifications Cards */}
              <div className="report-spec-grid">
                {/* 1. Yellow Barricade Specifications */}
                <div className="glass-card" style={{ border: '1px solid #e2e8f0', margin: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <Fence size={16} color="#d97706" />
                    <strong style={{ fontSize: '0.85rem', color: '#b45309' }}>
                      Safety Barricade Perimeter
                    </strong>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.78rem' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Border Width:</span>
                      <div style={{ fontWeight: 700, color: '#b45309' }}>
                        {barricadeDimensions.widthMeters} m ({barricadeDimensions.widthFeet} ft)
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Border Height:</span>
                      <div style={{ fontWeight: 700, color: '#b45309' }}>
                        {barricadeDimensions.heightMeters} m ({barricadeDimensions.heightFeet} ft)
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Total Safe Area:</span>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>
                        {barricadeDimensions.areaSqM.toLocaleString()} m² ({barricadeDimensions.areaSqFt.toLocaleString()} ft²)
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Safety Buffer:</span>
                      <div style={{ fontWeight: 700, color: '#059669' }}>
                        {barricadeFeet} ft ({(barricadeFeet * 0.3048).toFixed(1)}m)
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Drone Fleet & Flight Specifications */}
                <div className="glass-card" style={{ border: '1px solid #e2e8f0', margin: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <Radio size={16} color="#ea580c" />
                    <strong style={{ fontSize: '0.85rem', color: '#c2410c' }}>
                      Drone Fleet & Grid Specifications
                    </strong>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.78rem' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Swarm Formation:</span>
                      <div style={{ fontWeight: 700, color: '#c2410c' }}>
                        {gridRows}R × {gridCols}C ({fleet.drones.length} Drones)
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Drone Field Area:</span>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>
                        {droneDimensions.areaSqM.toLocaleString()} m² ({droneDimensions.areaSqFt.toLocaleString()} ft²)
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Field Width × Height:</span>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>
                        {droneDimensions.widthMeters}m × {droneDimensions.heightMeters}m
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Swarm Heading:</span>
                      <div style={{ fontWeight: 700, color: '#7c3aed' }}>
                        {gridAngle}° Clockwise
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Distance Metrics (Between Drones & To Ground) */}
                <div className="glass-card" style={{ border: '1px solid #e2e8f0', margin: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <Navigation size={16} color="#059669" />
                    <strong style={{ fontSize: '0.85rem', color: '#047857' }}>
                      Spacing & Ground Clearance
                    </strong>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.78rem' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Distance Between Drones:</span>
                      <div style={{ fontWeight: 700, color: '#059669' }}>
                        {spacingMeters} m ({(spacingMeters * 3.28084).toFixed(1)} ft)
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Distance to Ground:</span>
                      <div style={{ fontWeight: 700, color: '#c2410c' }}>
                        {droneAltitude} m AGL ({(droneAltitude * 3.28084).toFixed(1)} ft)
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. Ground Station Setup */}
                <div className="glass-card" style={{ border: '1px solid #e2e8f0', margin: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '15px' }}>🪑</span>
                    <strong style={{ fontSize: '0.85rem', color: '#b45309' }}>
                      Ground Control Station (GCS) Specifications
                    </strong>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.78rem' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Pilot Chair Station:</span>
                      <div style={{ fontWeight: 700, color: '#b45309' }}>
                        Positioned on {operatorSide.toUpperCase()} side
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Distance from Swarm:</span>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>
                        {operatorDistance} Meters ({(operatorDistance * 3.28084).toFixed(1)} ft)
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Antenna 1 (RTK Base):</span>
                      <div style={{ fontWeight: 600, color: '#64748b' }}>
                        868 MHz Differential GPS
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Antenna 2 (C2 Link):</span>
                      <div style={{ fontWeight: 600, color: '#64748b' }}>
                        2.4 GHz Swarm Command Link
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Antenna 3 (Telemetry):</span>
                      <div style={{ fontWeight: 600, color: '#64748b' }}>
                        5.8 GHz Video/Telemetry
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Pilot Seat Clearance:</span>
                      <div style={{ fontWeight: 600, color: '#059669' }}>
                        1.5m Dedicated Safety Footprint
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="report-modal-footer">
              <button
                className="chip-btn"
                onClick={() => setShowReportModal(false)}
                style={{ padding: '8px 14px' }}
              >
                Close
              </button>

              <button
                className="chip-btn"
                onClick={handleDownloadPNG}
                style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Download size={14} />
                <span>Save PNG Image</span>
              </button>

              <button
                className="btn-primary"
                onClick={handleDownloadPDF}
                title="Download and print official PDF report (or press Ctrl+P)"
                style={{
                  padding: '8px 18px',
                  background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                  color: '#ffffff',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer'
                }}
              >
                <FileText size={15} color="#ffffff" />
                <span>Download & Print PDF [Ctrl+P]</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
