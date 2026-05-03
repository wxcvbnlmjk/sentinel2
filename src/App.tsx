import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Card, CardContent, CircularProgress, Collapse, IconButton, MenuItem, Slider, Stack, TextField, Typography } from "@mui/material";
import { useMediaQuery } from "@mui/material";
import { ImageOverlay, MapContainer, Rectangle, TileLayer, useMapEvents } from "react-leaflet";
import type { LatLng, LatLngBoundsExpression } from "leaflet";
import { getAvailableDates, getSatelliteImage } from "./api/sentinelHub";
import { ThemeModeContext } from "./main";

type Bbox = [number, number, number, number];

type DrawSelectorProps = {
  onBboxSelected: (nextBbox: Bbox) => void;
  onSelectingChange: (isSelecting: boolean) => void;
};

function DrawBboxSelector({ onBboxSelected, onSelectingChange }: DrawSelectorProps) {
  const [dragStart, setDragStart] = useState<LatLng | null>(null);
  const [dragCurrent, setDragCurrent] = useState<LatLng | null>(null);
  const [selectedBounds, setSelectedBounds] = useState<LatLngBoundsExpression | null>(null);
  const selectedBoundsBackupRef = useRef<LatLngBoundsExpression | null>(null);
  const map = useMapEvents({
    mousedown(event) {
      if (event.originalEvent.button !== 2) return;
      event.originalEvent.preventDefault();
      map.dragging.disable();
      setSelectedBounds(null);
      onSelectingChange(true);
      setDragStart(event.latlng);
      setDragCurrent(event.latlng);
    },
    mousemove(event) {
      if (!dragStart) return;
      setDragCurrent(event.latlng);
    },
    mouseup(event) {
      if (!dragStart) return;
      if (event.originalEvent.button !== 2) {
        map.dragging.enable();
        onSelectingChange(false);
        setDragStart(null);
        setDragCurrent(null);
        return;
      }
      event.originalEvent.preventDefault();
      finalizeSelection(event.latlng);
    },
    contextmenu(event) {
      event.originalEvent.preventDefault();
    },
  });

  const finalizeSelection = (end: LatLng) => {
    if (!dragStart) return;
    const minLon = Math.min(dragStart.lng, end.lng);
    const minLat = Math.min(dragStart.lat, end.lat);
    const maxLon = Math.max(dragStart.lng, end.lng);
    const maxLat = Math.max(dragStart.lat, end.lat);
    onBboxSelected([minLon, minLat, maxLon, maxLat]);

    setSelectedBounds([
      [minLat, minLon],
      [maxLat, maxLon],
    ]);

    map.dragging.enable();
    onSelectingChange(false);
    setDragStart(null);
    setDragCurrent(null);
  };

  useEffect(() => {
    const container = map.getContainer();

    const touchToLatLng = (touch: Touch): LatLng => {
      const point = map.mouseEventToContainerPoint({
        clientX: touch.clientX,
        clientY: touch.clientY,
      } as MouseEvent);
      return map.containerPointToLatLng(point);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      event.preventDefault();
      const latlng = touchToLatLng(event.touches[0]!);
      map.dragging.disable();
      selectedBoundsBackupRef.current = selectedBounds;
      setSelectedBounds(null);
      onSelectingChange(true);
      setDragStart(latlng);
      setDragCurrent(latlng);
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        if (dragStart) {
          map.dragging.enable();
          onSelectingChange(false);
          setDragStart(null);
          setDragCurrent(null);
          if (selectedBoundsBackupRef.current) {
            setSelectedBounds(selectedBoundsBackupRef.current);
          }
        }
        return;
      }
      if (!dragStart) return;
      event.preventDefault();
      setDragCurrent(touchToLatLng(event.touches[0]!));
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (!dragStart) return;
      event.preventDefault();
      if (event.touches.length !== 0) {
        map.dragging.enable();
        onSelectingChange(false);
        setDragStart(null);
        setDragCurrent(null);
        if (selectedBoundsBackupRef.current) {
          setSelectedBounds(selectedBoundsBackupRef.current);
        }
        return;
      }
      const touch = event.changedTouches[0];
      if (!touch) {
        map.dragging.enable();
        onSelectingChange(false);
        setDragStart(null);
        setDragCurrent(null);
        if (selectedBoundsBackupRef.current) {
          setSelectedBounds(selectedBoundsBackupRef.current);
        }
        return;
      }
      finalizeSelection(touchToLatLng(touch));
    };

    const handleTouchCancel = () => {
      map.dragging.enable();
      onSelectingChange(false);
      setDragStart(null);
      setDragCurrent(null);
      if (selectedBoundsBackupRef.current) {
        setSelectedBounds(selectedBoundsBackupRef.current);
      }
    };

    container.addEventListener("touchstart", handleTouchStart, { passive: false });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd, { passive: false });
    container.addEventListener("touchcancel", handleTouchCancel, { passive: false });

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
      container.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [dragStart, map, onSelectingChange, selectedBounds]);

  const previewBounds: LatLngBoundsExpression | null = dragStart && dragCurrent
    ? [
        [Math.min(dragStart.lat, dragCurrent.lat), Math.min(dragStart.lng, dragCurrent.lng)],
        [Math.max(dragStart.lat, dragCurrent.lat), Math.max(dragStart.lng, dragCurrent.lng)],
      ]
    : null;

  return (
    <>
      {selectedBounds ? (
        <Rectangle bounds={selectedBounds} pathOptions={{ color: "#1976d2", weight: 2, dashArray: "6 6", fill: false }} />
      ) : null}
      {previewBounds ? (
        <Rectangle bounds={previewBounds} pathOptions={{ color: "#1976d2", weight: 2, fill: false }} />
      ) : null}
    </>
  );
}

function formatBboxText(nextBbox: Bbox): string {
  return nextBbox.map((value) => value.toFixed(6)).join(",");
}

function App() {
  const { mode, toggleMode } = useContext(ThemeModeContext);
  const isMobile = useMediaQuery("(max-width:600px)");
  const [zoneDefined, setZoneDefined] = useState(false);
  const [datesFetchKey, setDatesFetchKey] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [bboxText, setBboxText] = useState("1.3,43.5,1.6,43.7");
  const [fromDate, setFromDate] = useState("2026-03-01");
  const [toDate, setToDate] = useState("2026-03-31");
  const [selectedRecentDate, setSelectedRecentDate] = useState("");
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [datesLoading, setDatesLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageDatetime, setImageDatetime] = useState<string | null>(null);
  const [imageBounds, setImageBounds] = useState<LatLngBoundsExpression | null>(null);
  const [isSelectingZone, setIsSelectingZone] = useState(false);
  const [brightness, setBrightness] = useState(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  console.log(datesLoading);
  console.log(loading);
  const bbox = useMemo<Bbox | null>(() => {
    const values = bboxText.split(",").map((part) => Number(part.trim()));
    if (values.length !== 4 || values.some(Number.isNaN)) {
      return null;
    }
    return values as Bbox;
  }, [bboxText]);

  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    if (!bbox) return null;
    return [
      [bbox[1], bbox[0]],
      [bbox[3], bbox[2]],
    ];
  }, [bbox]);

  const latestFiveDates = useMemo(
    () => [...availableDates].sort((a, b) => b.localeCompare(a)).slice(0, 5),
    [availableDates],
  );

  useEffect(() => {
    if (!isMobile) {
      setZoneDefined(true);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) return;
    setDatesFetchKey(0);
  }, [bbox, isMobile]);

  useEffect(() => {
    if (!bbox) {
      setAvailableDates([]);
      return;
    }

    if (isMobile && (!zoneDefined || datesFetchKey === 0)) {
      return;
    }

    const fetchAvailableDates = async () => {
      setDatesLoading(true);
      try {
        const dates = await getAvailableDates(bbox);
        setAvailableDates(dates);
      } catch {
        setAvailableDates([]);
      } finally {
        setDatesLoading(false);
      }
    };

    void fetchAvailableDates();
  }, [bbox, isMobile, zoneDefined, datesFetchKey]);

  useEffect(() => {
    if (availableDates.length === 0) return;

    const minDate = availableDates[0]!;
    const maxDate = availableDates[availableDates.length - 1]!;

    if (fromDate < minDate || fromDate > maxDate) {
      setFromDate(minDate);
    }
    if (toDate < minDate || toDate > maxDate) {
      setToDate(maxDate);
    }
  }, [availableDates, fromDate, toDate]);

  useEffect(() => {
    if (latestFiveDates.length === 0) {
      setSelectedRecentDate("");
      return;
    }
    setSelectedRecentDate((current) => (latestFiveDates.includes(current) ? current : latestFiveDates[0]!));
  }, [latestFiveDates]);

  const loadImage = async () => {
    if (!bbox || !bounds) {
      setError("BBox invalide. Format attendu: minLon,minLat,maxLon,maxLat");
      return;
    }
    if (!fromDate || !toDate) {
      setError("Selectionne une date de debut et une date de fin.");
      return;
    }
    if (fromDate > toDate) {
      setError("La date de debut doit etre <= a la date de fin.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { blob, acquisitionDatetime } = await getSatelliteImage({
        bbox,
        fromDate,
        toDate,
        width: 900,
        height: 900,
      });
      setImageDatetime(acquisitionDatetime);

      const nextUrl = URL.createObjectURL(blob);
      setImageUrl((currentUrl) => {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        return nextUrl;
      });
      setImageBounds(bounds);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const mapCenter: [number, number] = bbox
    ? [(bbox[1] + bbox[3]) / 2, (bbox[0] + bbox[2]) / 2]
    : [43.6, 1.45];

  // const compactMobileFieldSx = {
  //   "& .MuiInputLabel-root": {
  //     fontSize: { xs: "0.62rem", sm: "0.875rem" },
  //   },
  //   "& .MuiInputBase-input": {
  //     fontSize: { xs: "0.62rem", sm: "0.875rem" },
  //     paddingTop: { xs: "6px", sm: undefined },
  //     paddingBottom: { xs: "6px", sm: undefined },
  //   },
  //   "& .MuiSelect-select": {
  //     fontSize: { xs: "0.62rem", sm: "0.875rem" },
  //     paddingTop: { xs: "6px", sm: undefined },
  //     paddingBottom: { xs: "6px", sm: undefined },
  //   },
  // } as const;

  //   const compactMobileFieldListSx = {
  //   "& .MuiInputLabel-root": {
  //     fontSize: { xs: "0.62rem", sm: "0.875rem" },
  //   },
  //   "& .MuiInputBase-input": {
  //     fontSize: { xs: "0.62rem", sm: "0.875rem" },
  //     paddingTop: { xs: "6px", sm: undefined },
  //     paddingBottom: { xs: "6px", sm: undefined },
  //   },
  //   "& .MuiSelect-select": {
  //     fontSize: { xs: "0.62rem", sm: "0.875rem" },
  //     paddingTop: { xs: "6px", sm: undefined },
  //     paddingBottom: { xs: "6px", sm: undefined },
  //   },
  // } as const;

  return (
    <Box className="min-h-screen bg-slate-50 p-4 md:p-6 dark:bg-slate-950">
      <div className="relative flex w-full items-center justify-end !mb-1">
        <Typography variant="h6" className="!font-semibold absolute -translate-x-1/2">
          Sentinel-2 Copernicus
        </Typography>
        <IconButton onClick={toggleMode} aria-label={mode === "light" ? "Mode sombre" : "Mode clair"}>
          {mode === "light" ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          )}
        </IconButton>
      </div>

      <Card className="!mb-2">
        <CardContent className="!py-2">
          <div className="flex items-center justify-between gap-2">
            <Typography variant="subtitle2" className="!font-semibold">
              Aide
            </Typography>
            <Button size="small" onClick={() => setHelpOpen((open) => !open)}>
              {helpOpen ? "Masquer" : "Afficher"}
            </Button>
          </div>
          <Collapse in={helpOpen}>
            <Typography variant="body2" color="text.secondary" className="!mt-1">
              Desktop: clic droit + glisser.  
            </Typography>
            <Typography variant="body2" color="text.secondary" className="!mt-1">
              Mobile: glisser avec le doigt.
            </Typography>
          </Collapse>
        </CardContent>
      </Card>

      <div className="grid gap-2 md:grid-cols-[360px_1fr]">
        <Card>
          <CardContent>
            <Stack spacing={2}>
              {/* <Typography variant="h6">Parametres</Typography>
              <Typography variant="body2" color="text.secondary">
                Desktop: clic droit + glisse. Mobile: glisse avec le doigt.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Dates disponibles pour la BBox: {datesLoading ? "chargement..." : availableDates.length}
              </Typography> */}

              {/* <TextField
                label="BBox (minLon,minLat,maxLon,maxLon)"
                value={bboxText}
                onChange={(event) => setBboxText(event.target.value)}
                size="small"
                fullWidth
              /> */}
              <div className="flex items-center justify-between gap-2">
                <Typography variant="subtitle2" className="!font-semibold">
                  Dates
                </Typography>
                <Button size="small" onClick={() => setDateRangeOpen((open) => !open)}>
                  {dateRangeOpen ? "Masquer" : "Afficher"}
                </Button>
              </div>
              {datesLoading ? (
                <div className="flex items-center gap-2">
                  <CircularProgress size={16} />
                  <Typography variant="body2" color="text.secondary">
                    Recherche des dates...
                  </Typography>
                </div>
              ) : null}
              <div className="flex items-stretch gap-2">
                <TextField
                  select
                  label="dates disponibles"
                  value={selectedRecentDate}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSelectedRecentDate(value);
                    setFromDate(value);
                    setToDate(value);
                  }}
                  size="small"
                  fullWidth
                  // sx={compactMobileFieldListSx}
                  disabled={datesLoading || latestFiveDates.length === 0}
                >
                  {latestFiveDates.map((date) => (
                    <MenuItem key={date} value={date}>
                      {date}
                    </MenuItem>
                  ))}
                </TextField>
                {isMobile ? (
                  <Button
                    size="small"
                    variant="contained"
                    disabled={!zoneDefined || !bbox || datesLoading}
                    onClick={() => {
                      setAvailableDates([]);
                      setSelectedRecentDate("");
                      setDatesFetchKey((k) => k + 1);
                    }}
                    startIcon={datesLoading ? <CircularProgress size={16} color="inherit" /> : undefined}
                    sx={{ height: 40, whiteSpace: "nowrap" }}
                  >
                    {/* {datesLoading ? "Chargement..." : "Charger"} */}
                  </Button>
                ) : null}
              </div>

              <Collapse in={dateRangeOpen} unmountOnExit>
                <div className="grid grid-cols-2 gap-2 !mt-2">
                  <TextField
                    label="Date debut"
                    type="date"
                    value={fromDate}
                    onChange={(event) => setFromDate(event.target.value)}
                    size="small"
                    fullWidth
                    // sx={compactMobileFieldSx}
                    // slotProps={{
                    //   inputLabel: { shrink: false },
                    //   htmlInput: {
                    //     min: availableDates[0] ?? undefined,
                    //     max: availableDates[availableDates.length - 1] ?? undefined,
                    //   },
                    // }}
                  />
                  <TextField
                    label="Date fin"
                    type="date"
                    value={toDate}
                    onChange={(event) => setToDate(event.target.value)}
                    size="small"
                    fullWidth
                    // sx={compactMobileFieldSx}
                    // slotProps={{
                    //   inputLabel: { shrink: false },
                    //   htmlInput: {
                    //     min: availableDates[0] ?? undefined,
                    //     max: availableDates[availableDates.length - 1] ?? undefined,
                    // },
                    // }}
                  />
                </div>
              </Collapse>

              <Button
                variant="contained"
                onClick={loadImage}
                disabled={loading}
                startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
              >
                {loading ? "Chargement..." : "Charger image Sentinel-2"}
              </Button>

              <div className="left-2 right-2 z-[1000]">
                {/* <div className="pointer-events-auto rounded-lg border border-slate-200 bg-white/90 px-3 py-2 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/80"> */}
                  {/* <Typography variant="caption" color="text.secondary">
                    Luminosite
                  </Typography> */}
                  <Slider
                    value={brightness}
                    onChange={(_, value) => setBrightness(Array.isArray(value) ? value[0]! : value)}
                    min={2.0}
                    max={6.0}
                    step={0.05}
                    size="small"
                  />
                {/* </div> */}
              </div>

              {imageDatetime ? (
                <Typography variant="body2" color="text.secondary">
                  Date/heure image affichee: {new Date(imageDatetime).toLocaleString("fr-FR", { timeZone: "UTC" })} UTC
                </Typography>
              ) : null}

              {error ? (
                <Typography variant="body2" color="error">
                  {error}
                </Typography>
              ) : null}
            </Stack>
          </CardContent>
        </Card>

        <div 
          className="absolute bottom-4 left-4 right-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
          style={{ "--satellite-brightness": brightness } as React.CSSProperties}
        >
          <MapContainer center={mapCenter} zoom={10} style={{ height: "50vh", width: "100%" }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png"
              attribution='&copy; OpenStreetMap contributors, tiles by OSM France'
            />
            <DrawBboxSelector
              onBboxSelected={(nextBbox) => {
                setBboxText(formatBboxText(nextBbox));
                setZoneDefined(true);
                if (isMobile) {
                  setDatesFetchKey(0);
                }
              }}
              onSelectingChange={setIsSelectingZone}
            />
            {imageUrl && imageBounds && !isSelectingZone ? (
              <ImageOverlay url={imageUrl} bounds={imageBounds} opacity={0.9} className="satellite-image-overlay" />
            ) : null}
          </MapContainer>
        </div>
      </div>
    </Box>
  );
}

export default App;
