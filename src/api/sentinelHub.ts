export type Bbox = [number, number, number, number];

const CATALOG_SEARCH_URL = "/__cdse_sh/catalog/v1/search";
const PROCESS_URL = "/__cdse_sh/process/v1";
const COLLECTION = "sentinel-2-l2a";

async function catalogSearch(
  body: Record<string, unknown>,
): Promise<Array<{ properties?: { datetime?: string } }>> {
  const response = await fetch(CATALOG_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Erreur Catalog API: ${response.status} ${await response.text()}`);
  }
  const payload = (await response.json()) as {
    features?: Array<{ properties?: { datetime?: string } }>;
  };
  return payload.features ?? [];
}

export async function getAvailableDates(bbox: Bbox): Promise<string[]> {
  const features = await catalogSearch({
    bbox,
    collections: [COLLECTION],
    datetime: "2015-01-01T00:00:00Z/2100-01-01T00:00:00Z",
    limit: 100,
  });

  const dates = new Set<string>();
  for (const feature of features) {
    const datetime = feature.properties?.datetime;
    if (!datetime) continue;
    dates.add(datetime.slice(0, 10));
  }
  return Array.from(dates).sort((a, b) => a.localeCompare(b));
}

export async function getSatelliteImage(args: {
  bbox: Bbox;
  fromDate: string;
  toDate: string;
  width?: number;
  height?: number;
}): Promise<{ blob: Blob; acquisitionDatetime: string | null }> {
  const { bbox, fromDate, toDate, width = 900, height = 900 } = args;
  const from = `${fromDate}T00:00:00Z`;
  const to = `${toDate}T23:59:59Z`;

  const features = await catalogSearch({
    bbox,
    collections: [COLLECTION],
    datetime: `${from}/${to}`,
    limit: 1,
  });
  const acquisitionDatetime = features[0]?.properties?.datetime ?? null;

  const processPayload = {
    input: {
      bounds: {
        bbox,
        properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" },
      },
      data: [
        {
          type: COLLECTION,
          dataFilter: {
            timeRange: { from, to },
            mosaickingOrder: "leastCC",
          },
        },
      ],
    },
    output: {
      width,
      height,
      responses: [{ identifier: "default", format: { type: "image/png" } }],
    },
    evalscript: `//VERSION=3
function setup() {
  return {
    input: ["B04", "B03", "B02"],
    output: { bands: 3, sampleType: "AUTO" }
  };
}
function evaluatePixel(sample) {
  return [sample.B04, sample.B03, sample.B02];
}`,
  };

  const processResponse = await fetch(PROCESS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(processPayload),
  });
  if (!processResponse.ok) {
    throw new Error(`Erreur Process API: ${processResponse.status} ${await processResponse.text()}`);
  }

  return { blob: await processResponse.blob(), acquisitionDatetime };
}
