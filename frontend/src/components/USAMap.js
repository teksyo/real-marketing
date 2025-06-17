"use client";

import { useState, useEffect, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import Map, { Source, Layer } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// This is needed for Next.js CSP
if (typeof window !== "undefined") {
  // @ts-ignore
  mapboxgl.workerClass = require("mapbox-gl/dist/mapbox-gl-csp-worker").default;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const stateAbbreviations = {
  Alabama: "AL",
  Alaska: "AK",
  Arizona: "AZ",
  Arkansas: "AR",
  California: "CA",
  Colorado: "CO",
  Connecticut: "CT",
  Delaware: "DE",
  Florida: "FL",
  Georgia: "GA",
  Hawaii: "HI",
  Idaho: "ID",
  Illinois: "IL",
  Indiana: "IN",
  Iowa: "IA",
  Kansas: "KS",
  Kentucky: "KY",
  Louisiana: "LA",
  Maine: "ME",
  Maryland: "MD",
  Massachusetts: "MA",
  Michigan: "MI",
  Minnesota: "MN",
  Mississippi: "MS",
  Missouri: "MO",
  Montana: "MT",
  Nebraska: "NE",
  Nevada: "NV",
  "New Hampshire": "NH",
  "New Jersey": "NJ",
  "New Mexico": "NM",
  "New York": "NY",
  "North Carolina": "NC",
  "North Dakota": "ND",
  Ohio: "OH",
  Oklahoma: "OK",
  Oregon: "OR",
  Pennsylvania: "PA",
  "Rhode Island": "RI",
  "South Carolina": "SC",
  "South Dakota": "SD",
  Tennessee: "TN",
  Texas: "TX",
  Utah: "UT",
  Vermont: "VT",
  Virginia: "VA",
  Washington: "WA",
  "West Virginia": "WV",
  Wisconsin: "WI",
  Wyoming: "WY",
};

const stateZipCodes = {
  AL: "35201",
  AK: "99501",
  AZ: "85001",
  AR: "72201",
  CA: "90001",
  CO: "80201",
  CT: "06101",
  DE: "19901",
  FL: "32099",
  GA: "30301",
  HI: "96801",
  ID: "83701",
  IL: "60601",
  IN: "46201",
  IA: "50301",
  KS: "66601",
  KY: "40201",
  LA: "70112",
  ME: "04101",
  MD: "21201",
  MA: "02101",
  MI: "48201",
  MN: "55101",
  MS: "39201",
  MO: "63101",
  MT: "59601",
  NE: "68501",
  NV: "89501",
  NH: "03217",
  NJ: "07101",
  NM: "87500",
  NY: "10001",
  NC: "27601",
  ND: "58501",
  OH: "43201",
  OK: "73101",
  OR: "97201",
  PA: "17101",
  RI: "02901",
  SC: "29201",
  SD: "57501",
  TN: "37201",
  TX: "73301",
  UT: "84101",
  VT: "05601",
  VA: "23218",
  WA: "98501",
  WV: "25301",
  WI: "53701",
  WY: "82001",
};

const USAMap = ({ onRegionSelect, region }) => {
  const [viewState, setViewState] = useState({
    longitude: -98.5795,
    latitude: 39.8283,
    zoom: 3,
    minZoom: 2,
    maxZoom: 9,
  });

  const [hoveredStateId, setHoveredStateId] = useState(null);
  const [filteredGeojson, setFilteredGeojson] = useState(null);

  // Fetch and filter GeoJSON
  useEffect(() => {
    const fetchAndFilterGeoJSON = async () => {
      try {
        const res = await fetch(
          "https://docs.mapbox.com/mapbox-gl-js/assets/us_states.geojson"
        );
        const data = await res.json();

        if (!region || region === "NO") {
          return;
        }
        const regionArray = region
          .split(",")
          .map((r) => r.trim().toUpperCase());

        const filteredFeatures = data.features.filter((feature) => {
          const stateName = feature.properties?.STATE_NAME;
          const abbr = stateAbbreviations[stateName];
          return regionArray.includes(abbr);
        });

        setFilteredGeojson({
          type: "FeatureCollection",
          features: filteredFeatures,
        });
      } catch (error) {
        console.error("Failed to fetch or filter GeoJSON:", error);
      }
    };

    fetchAndFilterGeoJSON();
  }, [region]);

  const stateLayer = {
    id: "states-fill",
    type: "fill",
    paint: {
      "fill-color": hoveredStateId ? "#4a90e2" : "#93c5fd",
      "fill-opacity": 0.5,
    },
  };

  const stateOutlineLayer = {
    id: "states-outline",
    type: "line",
    paint: {
      "line-color": "#2563eb",
      "line-width": 1,
    },
  };

  const onClick = useCallback(
    (event) => {
      if (event.features && event.features.length > 0) {
        const clickedFeature = event.features[0];
        const fullStateName = clickedFeature.properties?.STATE_NAME;
        const stateAbbr = stateAbbreviations[fullStateName];

        if (stateAbbr && stateZipCodes[stateAbbr]) {
          onRegionSelect?.({
            name: stateAbbr,
            zip: stateZipCodes[stateAbbr],
            state: stateAbbr,
          });
        } else if (typeof window !== "undefined") {
          console.warn(
            "Invalid state or no ZIP code mapping found:",
            fullStateName
          );
        }
      }
    },
    [onRegionSelect]
  );

  const onHover = useCallback((event) => {
    const hoveredFeature = event.features && event.features[0];
    const fullStateName = hoveredFeature?.properties?.STATE_NAME;
    setHoveredStateId(fullStateName);
  }, []);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="w-full h-[600px] rounded-lg overflow-hidden flex items-center justify-center bg-gray-100">
        <p className="text-gray-500">
          Please add your Mapbox token to .env.local
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-[600px] rounded-lg overflow-hidden">
      <Map
        {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        mapStyle="mapbox://styles/mapbox/light-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
        interactiveLayerIds={["states-fill"]}
        onMouseMove={onHover}
        onClick={onClick}
        reuseMaps
      >
        {filteredGeojson && (
          <Source id="states" type="geojson" data={filteredGeojson}>
            <Layer {...stateLayer} />
            <Layer {...stateOutlineLayer} />
          </Source>
        )}
      </Map>
    </div>
  );
};

export default USAMap;
