import { LOCATION_ID, STAFF_DATA } from "../staff-config.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const { staffKey, serviceType, date } = req.body || {};

    if (!staffKey || !serviceType || !date) {
      return res.status(400).json({ error: "Missing staffKey, serviceType, or date." });
    }

    const staff = STAFF_DATA[staffKey];
    if (!staff) return res.status(400).json({ error: "Invalid staffKey." });

    const service = staff.services?.[serviceType];
    if (!service) return res.status(400).json({ error: "Invalid serviceType." });

    const squareHeaders = {
      "Square-Version": "2026-01-22",
      "Authorization": `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    };

    /*
      修复 Jacob 9:00 / 9:45 不显示：
      之前从 10:00 AM Pasadena time 开始查，所以 9:00 / 9:45 会被漏掉。
      现在从 9:00 AM Pasadena time 开始查。
      May / summer Pasadena = PDT = UTC-7
      9:00 AM PDT = 16:00Z
    */
    const startAt = `${date}T16:00:00Z`;

    const nextDay = new Date(`${date}T00:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const nextDateIso = nextDay.toISOString().slice(0, 10);

    // 查到晚上 8:00 PM Pasadena time，避免漏掉晚一点的空位
    const endAt = `${nextDateIso}T03:00:00Z`;

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

    return res.status(200).json({
      availabilities: data.availabilities || [],
      errors: data.errors || []
    });

  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      detail: error.message
    });
  }
}
