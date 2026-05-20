import { LOCATION_ID, STAFF_DATA } from "../staff-config.js";

const TIME_ZONE = "America/Los_Angeles";
const SQUARE_API_VERSION = "2026-01-22";

function addDaysToIsoDate(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function getLosAngelesDateFromUtc(utcString) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(utcString));

  const year = parts.find(part => part.type === "year")?.value;
  const month = parts.find(part => part.type === "month")?.value;
  const day = parts.find(part => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function getLosAngelesTodayDate() {
  return getLosAngelesDateFromUtc(new Date().toISOString());
}

function getSearchRangeForDate(date) {
  const todayLosAngeles = getLosAngelesTodayDate();
  const nextDate = addDaysToIsoDate(date, 1);

  /*
    Same-day fix:
    For today's date, do NOT start the Square search from yesterday.
    When start_at is already far in the past, Square can return an empty same-day result
    even when future same-day slots still exist in Square Appointments.

    Start from slightly before "now" instead, then filter out truly past slots below.
  */
  if (date === todayLosAngeles) {
    const nowMinusTwoMinutes = new Date(Date.now() - 2 * 60 * 1000).toISOString();

    return {
      startAt: nowMinusTwoMinutes,
      endAt: `${nextDate}T12:00:00Z`,
      isToday: true,
      todayLosAngeles
    };
  }

  /*
    Future / past date fix:
    Keep a wide UTC window and then filter by Los Angeles local date.
    This avoids DST / timezone mistakes around midnight.
  */
  const previousDate = addDaysToIsoDate(date, -1);

  return {
    startAt: `${previousDate}T20:00:00Z`,
    endAt: `${nextDate}T12:00:00Z`,
    isToday: false,
    todayLosAngeles
  };
}

function normalizeAvailabilities(availabilities, date, isToday) {
  const now = Date.now();

  return (availabilities || [])
    .filter(availability => {
      if (!availability?.start_at) return false;

      const availabilityDate = getLosAngelesDateFromUtc(availability.start_at);
      if (availabilityDate !== date) return false;

      if (isToday) {
        const startMs = new Date(availability.start_at).getTime();
        if (!Number.isFinite(startMs)) return false;

        // Only remove slots that are actually already in the past.
        return startMs >= now - 60 * 1000;
      }

      return true;
    })
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const { staffKey, serviceType, date } = req.body || {};

    if (!staffKey || !serviceType || !date) {
      return res.status(400).json({
        error: "Missing staffKey, serviceType, or date."
      });
    }

    const staff = STAFF_DATA[staffKey];

    if (!staff) {
      return res.status(400).json({ error: "Invalid staffKey." });
    }

    const service = staff.services?.[serviceType];

    if (!service) {
      return res.status(400).json({ error: "Invalid serviceType." });
    }

    if (!process.env.SQUARE_ACCESS_TOKEN) {
      return res.status(500).json({
        error: "Missing SQUARE_ACCESS_TOKEN environment variable."
      });
    }

    const { startAt, endAt, isToday, todayLosAngeles } = getSearchRangeForDate(date);

    const squareHeaders = {
      "Square-Version": SQUARE_API_VERSION,
      "Authorization": `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    };

    const squareBody = {
      query: {
        filter: {
          start_at_range: {
            start_at: startAt,
            end_at: endAt
          },
          location_id: LOCATION_ID,
          segment_filters: [
            {
              service_variation_id: service.service_variation_id,
              team_member_id_filter: {
                any: [staff.team_member_id]
              }
            }
          ]
        }
      }
    };

    const response = await fetch(
      "https://connect.squareup.com/v2/bookings/availability/search",
      {
        method: "POST",
        headers: squareHeaders,
        body: JSON.stringify(squareBody)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.errors?.[0]?.detail || "Failed to search availability.",
        square: data,
        debug: {
          staffKey,
          serviceType,
          date,
          todayLosAngeles,
          isToday,
          startAt,
          endAt,
          locationId: LOCATION_ID,
          teamMemberId: staff.team_member_id,
          serviceVariationId: service.service_variation_id
        }
      });
    }

    const rawAvailabilities = data.availabilities || [];
    const filtered = normalizeAvailabilities(rawAvailabilities, date, isToday);

    return res.status(200).json({
      availabilities: filtered,
      errors: data.errors || [],
      debug: {
        staffKey,
        serviceType,
        date,
        todayLosAngeles,
        isToday,
        startAt,
        endAt,
        squareReturnedCount: rawAvailabilities.length,
        filteredCount: filtered.length,
        firstRawStartAt: rawAvailabilities[0]?.start_at || null,
        firstFilteredStartAt: filtered[0]?.start_at || null,
        locationId: LOCATION_ID,
        teamMemberId: staff.team_member_id,
        serviceVariationId: service.service_variation_id
      }
    });
  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      detail: error.message
    });
  }
}
