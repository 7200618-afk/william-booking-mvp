import { LOCATION_ID, STAFF_DATA } from "../staff-config.js";

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

    /*
      重要：
      不再手动写死 10:00 = 17:00Z / 7:00 = 02:00Z。
      这里查一个更宽的 UTC 范围，然后只保留洛杉矶本地日期等于用户选择日期的空位。
      这样 Square 里关 6/3、6/4、6/5，我们页面会自动跟 Square 走。
    */
    const previousDate = addDaysToIsoDate(date, -1);
    const nextDate = addDaysToIsoDate(date, 1);

    const startAt = `${previousDate}T20:00:00Z`;
    const endAt = `${nextDate}T12:00:00Z`;

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

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.errors?.[0]?.detail || "Failed to search availability.",
        square: data
      });
    }

    const filtered = (data.availabilities || []).filter(availability => {
      return getLosAngelesDateFromUtc(availability.start_at) === date;
    });

    return res.status(200).json({
      availabilities: filtered,
      errors: data.errors || []
    });

  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      detail: error.message
    });
  }
}
