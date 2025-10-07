import express from "express";
import { z } from "zod";
import fs from "fs";

const NWS_API_BASE = "https://api.weather.gov";
const USER_AGENT = "weather-app/1.0";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "MCP Weather Server" });
});

// Get weather alerts endpoint
app.get("/api/alerts/:state", async (req, res) => {
  try {
    const state = req.params.state.toUpperCase();

    if (state.length !== 2) {
      return res.status(400).json({
        error: "State code must be 2 letters (e.g., CA, NY)",
      });
    }

    const alertsUrl = `${NWS_API_BASE}/alerts?area=${state}`;
    const alertsData = await makeNWSRequest<AlertsResponse>(alertsUrl);

    if (!alertsData) {
      return res.status(500).json({
        error: "Failed to retrieve alerts data",
      });
    }

    const features = alertsData.features || [];
    if (features.length === 0) {
      return res.json({
        state,
        alerts: [],
        message: `No active alerts for ${state}`,
      });
    }

    const formattedAlerts = features.map(formatAlert);

    res.json({
      state,
      alertCount: features.length,
      alerts: formattedAlerts,
    });
  } catch (error) {
    console.error("Error fetching alerts:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Get weather forecast endpoint
app.get("/api/forecast", async (req, res) => {
  try {
    const latitude = parseFloat(req.query.latitude as string);
    const longitude = parseFloat(req.query.longitude as string);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        error: "Valid latitude and longitude are required",
      });
    }

    if (latitude < -90 || latitude > 90) {
      return res.status(400).json({
        error: "Latitude must be between -90 and 90",
      });
    }

    if (longitude < -180 || longitude > 180) {
      return res.status(400).json({
        error: "Longitude must be between -180 and 180",
      });
    }

    // Get grid point data
    const pointsUrl = `${NWS_API_BASE}/points/${latitude.toFixed(
      4
    )},${longitude.toFixed(4)}`;
    const pointsData = await makeNWSRequest<PointsResponse>(pointsUrl);

    if (!pointsData) {
      return res.status(404).json({
        error: `Failed to retrieve grid point data for coordinates: ${latitude}, ${longitude}. This location may not be supported by the NWS API (only US locations are supported).`,
      });
    }

    const forecastUrl = pointsData.properties?.forecast;
    if (!forecastUrl) {
      return res.status(500).json({
        error: "Failed to get forecast URL from grid point data",
      });
    }

    // Get forecast data
    const forecastData = await makeNWSRequest<ForecastResponse>(forecastUrl);
    if (!forecastData) {
      return res.status(500).json({
        error: "Failed to retrieve forecast data",
      });
    }

    const periods = forecastData.properties?.periods || [];
    if (periods.length === 0) {
      return res.json({
        latitude,
        longitude,
        periods: [],
        message: "No forecast periods available",
      });
    }

    res.json({
      latitude,
      longitude,
      periods: periods.map((period: ForecastPeriod) => ({
        name: period.name || "Unknown",
        temperature: period.temperature,
        temperatureUnit: period.temperatureUnit || "F",
        windSpeed: period.windSpeed || "Unknown",
        windDirection: period.windDirection || "",
        shortForecast: period.shortForecast || "No forecast available",
      })),
    });
  } catch (error) {
    console.error("Error fetching forecast:", error);
    res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Helper function for making NWS API requests
async function makeNWSRequest<T>(url: string): Promise<T | null> {
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "application/geo+json",
  };

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error("Error making NWS request:", error);
    return null;
  }
}

// Format alert data
function formatAlert(feature: AlertFeature) {
  const props = feature.properties;
  return {
    event: props.event || "Unknown",
    area: props.areaDesc || "Unknown",
    severity: props.severity || "Unknown",
    status: props.status || "Unknown",
    headline: props.headline || "No headline",
  };
}

// Type definitions
interface AlertFeature {
  properties: {
    event?: string;
    areaDesc?: string;
    severity?: string;
    status?: string;
    headline?: string;
  };
}

interface ForecastPeriod {
  name?: string;
  temperature?: number;
  temperatureUnit?: string;
  windSpeed?: string;
  windDirection?: string;
  shortForecast?: string;
}

interface AlertsResponse {
  features: AlertFeature[];
}

interface PointsResponse {
  properties: {
    forecast?: string;
  };
}

interface ForecastResponse {
  properties: {
    periods: ForecastPeriod[];
  };
}

app.listen(PORT, () => {
  console.log(`Weather API Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Alerts: http://localhost:${PORT}/api/alerts/:state`);
  console.log(
    `Forecast: http://localhost:${PORT}/api/forecast?latitude=X&longitude=Y`
  );
});
