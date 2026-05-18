export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed. Use POST."
    });
  }

  try {
    const { serviceType, date } = req.body || {};

    const WILLIAM = {
      location_id: "L3QJNBCTPSYW7",
      team_member_id: "TMWIhbRkPFn61SpR",

      haircut: {
        name: "Men’s Haircut",
        duration_minutes: 50,
        service_variation_id: "U5TNWU6VYAJNRGIMBFGA2545",
        service_variation_version: 1778829893873
      },

      scissors: {
        name: "Scissors Cut",
        duration_minutes: 50,
        service_variation_id: "22YZ5VMOQO4K2IKYY6R2OIPM",
        service_variation_version: 1778926320167
      }
    };

    const service = WILLIAM[serviceType];

    if (!service) {
      return res.status(400).json({
        error: "Invalid serviceType. Use haircut or scissors."
      });
    }

    if (!date) {
      return res.status(400).json({
        error: "Missing date. Example: 2026-05-27"
      });
    }

    // Simple version for Pasadena during daylight saving time.
    // Pasadena 10:00 AM = UTC 17:00
    // Pasadena 7:00 PM = next day UTC 02:00
    const startAt = `${date}T17:00:00Z`;

    const nextDay = new Date(`${date}T00:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const nextDayString = nextDay.toISOString().slice(0, 10);
    const endAt = `${nextDayString}T02:00:00Z`;

    const squareResponse = await fetch(
      "https://connect.squareup.com/v2/bookings/availability/search",
      {
        method: "POST",
        headers: {
          "Square-Version": "2026-01-22",
          "Authorization": `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: {
            filter: {
              start_at_range: {
                start_at: startAt,
                end_at: endAt
              },
              location_id: WILLIAM.location_id,
              segment_filters: [
                {
                  service_variation_id: service.service_variation_id,
                  team_member_id_filter: {
                    any: [WILLIAM.team_member_id]
                  }
                }
              ]
            }
          }
        })
      }
    );

    const data = await squareResponse.json();

    return res.status(squareResponse.status).json(data);
  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      detail: error.message
    });
  }
}
