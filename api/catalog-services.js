import { STAFF_DATA } from "../staff-config.js";

let cachedResult = null;
let cachedAt = 0;

const CACHE_MS = 5 * 60 * 1000; // 5 minutes

function moneyToPrice(amount) {
  if (typeof amount !== "number") return null;
  return amount / 100;
}

function durationMsToMinutes(ms) {
  if (typeof ms !== "number") return null;
  return Math.round(ms / 60000);
}

function collectServiceVariationIds() {
  const ids = [];

  Object.values(STAFF_DATA).forEach(staff => {
    Object.values(staff.services || {}).forEach(service => {
      if (service.service_variation_id) {
        ids.push(service.service_variation_id);
      }
    });
  });

  return [...new Set(ids)];
}

function findCatalogObject(objects, id) {
  return (objects || []).find(obj => obj.id === id);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed. Use GET." });
  }

  try {
    const now = Date.now();

    if (cachedResult && now - cachedAt < CACHE_MS) {
      return res.status(200).json({
        ...cachedResult,
        cached: true
      });
    }

    const objectIds = collectServiceVariationIds();

    if (!objectIds.length) {
      return res.status(200).json({
        services: {},
        staffData: STAFF_DATA,
        cached: false
      });
    }

    const squareResponse = await fetch(
      "https://connect.squareup.com/v2/catalog/batch-retrieve",
      {
        method: "POST",
        headers: {
          "Square-Version": "2026-01-22",
          "Authorization": `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          object_ids: objectIds,
          include_related_objects: true
        })
      }
    );

    const squareData = await squareResponse.json();

    if (!squareResponse.ok) {
      return res.status(squareResponse.status).json({
        error:
          squareData?.errors?.[0]?.detail ||
          squareData?.errors?.[0]?.code ||
          "Unable to load Square catalog services.",
        square: squareData
      });
    }

    const objects = squareData.objects || [];
    const services = {};
    const staffData = structuredClone(STAFF_DATA);

    Object.entries(staffData).forEach(([staffKey, staff]) => {
      Object.entries(staff.services || {}).forEach(([serviceKey, service]) => {
        const variationId = service.service_variation_id;
        const catalogObject = findCatalogObject(objects, variationId);

        if (!catalogObject || catalogObject.type !== "ITEM_VARIATION") {
          return;
        }

        const variation = catalogObject.item_variation_data || {};
        const priceAmount = variation.price_money?.amount;
        const durationMs = variation.service_duration;

        const liveService = {
          ...service,
          price: moneyToPrice(priceAmount) ?? service.price,
          duration_minutes:
            durationMsToMinutes(durationMs) ?? service.duration_minutes,
          service_variation_version:
            catalogObject.version ?? service.service_variation_version,
          available_for_booking:
            variation.available_for_booking ?? service.available_for_booking,
          square_updated_at: catalogObject.updated_at || null
        };

        staff.services[serviceKey] = liveService;

        services[variationId] = {
          staffKey,
          serviceKey,
          label: liveService.label,
          price: liveService.price,
          duration_minutes: liveService.duration_minutes,
          service_variation_id: liveService.service_variation_id,
          service_variation_version: liveService.service_variation_version,
          available_for_booking: liveService.available_for_booking,
          square_updated_at: liveService.square_updated_at
        };
      });
    });

    cachedResult = {
      services,
      staffData,
      synced_at: new Date().toISOString(),
      cached: false
    };

    cachedAt = now;

    return res.status(200).json(cachedResult);
  } catch (error) {
    return res.status(500).json({
      error: "Server error while loading Square catalog services.",
      detail: error.message
    });
  }
}
