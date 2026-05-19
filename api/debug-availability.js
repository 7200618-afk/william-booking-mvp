import { LOCATION_ID, STAFF_DATA } from "../staff-config.js";

export default async function handler(req, res) {
  try {
    const date = req.query.date;

    if (!date) {
      return res.status(400).json({
        error: "Please add ?date=2026-06-04"
      });
    }

    const squareHeaders = {
      "Square-Version": "2026-01-22",
      "Authorization": `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    };

    function addDaysToIsoDate(isoDate, days) {
      const d = new Date(`${isoDate}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    }

    function getLosAngelesDateFromUtc(utcString) {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Los_Angeles",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(new Date(utcString));

      const year = parts.find(part => part.type === "year")?.value;
      const month = parts.find(part => part.type === "month")?.value;
      const day = parts.find(part => part.type === "day")?.value;

      return `${year}-${month}-${day}`;
    }

    function formatLATime(utcString) {
      return new Date(utcString).toLocaleString("en-US", {
        timeZone: "America/Los_Angeles",
        weekday: "short",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });
    }

    const previousDate = addDaysToIsoDate(date, -1);
    const nextDate = addDaysToIsoDate(date, 1);

    const startAt = `${previousDate}T20:00:00Z`;
    const endAt = `${nextDate}T12:00:00Z`;

    const result = {};

    for (const [staffKey, staff] of Object.entries(STAFF_DATA)) {
      result[staffKey] = {
        team_member_id: staff.team_member_id,
        services: {}
      };

      for (const [serviceKey, service] of Object.entries(staff.services)) {
        const response = await fetch(
          "https://connect.squareup.com/v2/bookings/availability/search",
          {
            method: "POST",
            headers: squareHeaders,
            body: JSON.stringify({
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
            })
          }
        );

        const data = await response.json();

        const filtered = (data.availabilities || []).filter(availability => {
          return getLosAngelesDateFromUtc(availability.start_at) === date;
        });

        result[staffKey].services[serviceKey] = {
          label: service.label,
          service_variation_id: service.service_variation_id,
          count: filtered.length,
          times: filtered.map(item => ({
            utc: item.start_at,
            la_time: formatLATime(item.start_at)
          })),
          square_errors: data.errors || []
        };
      }
    }

    return res.status(200).json({
      date,
      location_id: LOCATION_ID,
      result
    });

  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      detail: error.message
    });
  }
}
