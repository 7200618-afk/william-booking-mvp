export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed. Use POST."
    });
  }

  try {
    const { staffKey, serviceType, date } = req.body || {};

    const LOCATION_ID = "L3QJNBCTPSYW7";

    const STAFF_API = {
      Nami: {
        team_member_id: "TMm4INT2vtpvuQRo",
        services: {
          haircut: {
            label: "Men’s Haircut",
            price: 55,
            duration_minutes: 50,
            service_variation_id: "FQODRAN4TNKURP3RNW7GO4FL",
            service_variation_version: 1774408248385
          },
          scissors: {
            label: "Scissors Cut",
            price: 70,
            duration_minutes: 50,
            service_variation_id: "7RZHSI75HOC3CULO37IDRN3G",
            service_variation_version: 1774412538238
          }
        }
      },

      Fiona: {
        team_member_id: "TMZ4Soxe_hDKg3Ht",
        services: {
          haircut: {
            label: "Men’s Haircut",
            price: 55,
            duration_minutes: 40,
            service_variation_id: "37ARLNEQ32HMPB2VSAWOHQ7A",
            service_variation_version: 1774408226366
          },
          scissors: {
            label: "Scissors Cut",
            price: 70,
            duration_minutes: 40,
            service_variation_id: "NNVHTCNXKGR2WA2CKPOJRNIG",
            service_variation_version: 1774407851988
          },
          perm: {
            label: "Perm",
            price: "220+",
            duration_minutes: 120,
            service_variation_id: "BFHUUTJC6KPXE3NSCHF5YIWS",
            service_variation_version: 1779001952576
          },
          color_gray: {
            label: "Cover Gray",
            price: 65,
            duration_minutes: 40,
            service_variation_id: "5VLGRSZYIO5AL3SU6AGZU6KP",
            service_variation_version: 1777094072086
          },
          color_full: {
            label: "Full Color",
            price: 120,
            duration_minutes: 120,
            service_variation_id: "FPADYBGJBAVOXMTJHXFQ43H4",
            service_variation_version: 1769964790194
          }
        }
      },

      Ryan: {
        team_member_id: "TMm7W1ZmprhAbD-Q",
        services: {
          haircut: {
            label: "Men’s Haircut",
            price: 45,
            duration_minutes: 45,
            service_variation_id: "3O36RYDUKSXRIYJRSCVMUR7W",
            service_variation_version: 1774408255432
          },
          scissors: {
            label: "Scissors Cut",
            price: 60,
            duration_minutes: 45,
            service_variation_id: "273LNJSEBG5NXUJZI5HYC7RI",
            service_variation_version: 1774412546058
          }
        }
      },

      Ken: {
        team_member_id: "TMbO57WbplZRl2vp",
        services: {
          haircut: {
            label: "Men’s Haircut",
            price: 50,
            duration_minutes: 40,
            service_variation_id: "2GP3AHZEVUISBXNJJC7XFVE2",
            service_variation_version: 1778926266305
          },
          scissors: {
            label: "Scissors Cut",
            price: 70,
            duration_minutes: 40,
            service_variation_id: "ADGMMV6KLH3TECLX6ZOB62T4",
            service_variation_version: 1778926278241
          }
        }
      },

      Jacob: {
        team_member_id: "TMGkdiUy-xaRP5_W",
        services: {
          haircut: {
            label: "Men’s Haircut",
            price: 60,
            duration_minutes: 45,
            service_variation_id: "NSHYZU2NHY4VFXOBYESKGZGW",
            service_variation_version: 1774408235308
          },
          scissors: {
            label: "Scissors Cut",
            price: 75,
            duration_minutes: 45,
            service_variation_id: "P6OZF4GTRF5JMBB6VQDU6ZLK",
            service_variation_version: 1774407860059
          }
        }
      },

      William: {
        team_member_id: "TMWIhbRkPFn61SpR",
        services: {
          haircut: {
            label: "Men’s Haircut",
            price: 60,
            duration_minutes: 50,
            service_variation_id: "U5TNWU6VYAJNRGIMBFGA2545",
            service_variation_version: 1778829893873
          },
          scissors: {
            label: "Scissors Cut",
            price: 75,
            duration_minutes: 50,
            service_variation_id: "22YZ5VMOQO4K2IKYY6R2OIPM",
            service_variation_version: 1778926320167
          }
        }
      }
    };

    const staff = STAFF_API[staffKey];

    if (!staff) {
      return res.status(400).json({
        error: "Invalid staffKey.",
        availableStaff: Object.keys(STAFF_API)
      });
    }

    const service = staff.services[serviceType];

    if (!service) {
      return res.status(400).json({
        error: "Invalid serviceType for this staff.",
        availableServices: Object.keys(staff.services)
      });
    }

    if (!date) {
      return res.status(400).json({
        error: "Missing date. Example: 2026-05-27"
      });
    }

    // Pasadena summer time version:
    // 10:00 AM Pasadena = 17:00 UTC
    // 7:00 PM Pasadena = next day 02:00 UTC
    // Later we can improve this for winter daylight saving changes.
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

    const data = await squareResponse.json();

    return res.status(squareResponse.status).json({
      staffKey,
      serviceType,
      service,
      ...data
    });
  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      detail: error.message
    });
  }
}
