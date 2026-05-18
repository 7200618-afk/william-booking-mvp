export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed. Use POST."
    });
  }

  try {
    const {
      staffKey,
      serviceType,
      start_at,
      customerName,
      customerPhone,
      customerEmail,
      customerNote
    } = req.body || {};

    const LOCATION_ID = "L3QJNBCTPSYW7";

    const STAFF_API = {
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
      }
    };

    function makeId() {
      if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
      }

      return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function cleanEmail(email) {
      return String(email || "").trim().toLowerCase();
    }

    function normalizePhone(phone) {
      let value = String(phone || "").trim();

      if (!value) return "";

      let digits = value.replace(/\D/g, "");

      if (!digits) return "";

      // 修复 +1 被重复加的问题，例如 +112132735462
      if (digits.length === 12 && digits.startsWith("11")) {
        digits = digits.slice(1);
      }

      // 美国号码：2132735462 -> +12132735462
      if (digits.length === 10) {
        return `+1${digits}`;
      }

      // 美国号码：12132735462 -> +12132735462
      if (digits.length === 11 && digits.startsWith("1")) {
        return `+${digits}`;
      }

      // 国际号码：如果原本有 +，保留国际格式
      if (value.startsWith("+")) {
        return `+${digits}`;
      }

      // 其他国际号码兜底
      return `+${digits}`;
    }

    function getSquareErrorMessage(data, fallback) {
      const firstError = data?.errors?.[0];

      if (!firstError) return fallback;

      const detail = firstError.detail || firstError.code || fallback;

      if (detail === "The string did not match the expected pattern.") {
        return "Phone number or email format is not valid. Please check and try again.";
      }

      return detail;
    }

    const cleanedEmail = cleanEmail(customerEmail);
    const normalizedPhone = normalizePhone(customerPhone);

    if (!staffKey || !serviceType || !start_at) {
      return res.status(400).json({
        error: "Missing required booking information."
      });
    }

    if (!customerName || !normalizedPhone || !cleanedEmail) {
      return res.status(400).json({
        error: "Name, phone, and email are required."
      });
    }

    if (!cleanedEmail.includes("@") || !cleanedEmail.includes(".")) {
      return res.status(400).json({
        error: "Please enter a valid email address."
      });
    }

    const staff = STAFF_API[staffKey];

    if (!staff) {
      return res.status(400).json({
        error: "Invalid staffKey."
      });
    }

    const service = staff.services[serviceType];

    if (!service) {
      return res.status(400).json({
        error: "Invalid serviceType."
      });
    }

    const squareHeaders = {
      "Square-Version": "2026-01-22",
      "Authorization": `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    };

    const nameParts = String(customerName).trim().split(/\s+/);
    const givenName = nameParts[0] || customerName;
    const familyName = nameParts.slice(1).join(" ");

    async function checkExactAvailability() {
      const startDate = new Date(start_at);

      if (Number.isNaN(startDate.getTime())) {
        return {
          ok: false,
          available: false,
          data: {
            errors: [
              {
                detail: "Invalid appointment time."
              }
            ]
          }
        };
      }

      const endDate = new Date(
        startDate.getTime() + service.duration_minutes * 60 * 1000
      );

      const response = await fetch(
        "https://connect.squareup.com/v2/bookings/availability/search",
        {
          method: "POST",
          headers: squareHeaders,
          body: JSON.stringify({
            query: {
              filter: {
                start_at_range: {
                  start_at: startDate.toISOString(),
                  end_at: endDate.toISOString()
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
        return {
          ok: false,
          available: false,
          data
        };
      }

      const exactAvailable = (data.availabilities || []).some(availability => {
        return availability.start_at === start_at;
      });

      return {
        ok: true,
        available: exactAvailable,
        data
      };
    }

    const availabilityCheck = await checkExactAvailability();

    if (!availabilityCheck.ok) {
      return res.status(409).json({
        error: getSquareErrorMessage(
          availabilityCheck.data,
          "Could not verify availability. Please refresh and try again."
        ),
        square: availabilityCheck.data
      });
    }

    if (!availabilityCheck.available) {
      return res.status(409).json({
        error: "Sorry, this time is no longer available. Please choose another time."
      });
    }

    async function searchCustomerByEmail(email) {
      const response = await fetch("https://connect.squareup.com/v2/customers/search", {
        method: "POST",
        headers: squareHeaders,
        body: JSON.stringify({
          limit: 1,
          query: {
            filter: {
              email_address: {
                exact: email
              }
            }
          }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        return null;
      }

      return data.customers?.[0] || null;
    }

    async function searchCustomerByPhone(phone) {
      const response = await fetch("https://connect.squareup.com/v2/customers/search", {
        method: "POST",
        headers: squareHeaders,
        body: JSON.stringify({
          limit: 1,
          query: {
            filter: {
              phone_number: {
                exact: phone
              }
            }
          }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        return null;
      }

      return data.customers?.[0] || null;
    }

    let customer = await searchCustomerByEmail(cleanedEmail);

    if (!customer) {
      customer = await searchCustomerByPhone(normalizedPhone);
    }

    if (!customer) {
      const createCustomerResponse = await fetch(
        "https://connect.squareup.com/v2/customers",
        {
          method: "POST",
          headers: squareHeaders,
          body: JSON.stringify({
            idempotency_key: makeId(),
            given_name: givenName,
            family_name: familyName || undefined,
            phone_number: normalizedPhone,
            email_address: cleanedEmail
          })
        }
      );

      const customerData = await createCustomerResponse.json();

      if (!createCustomerResponse.ok) {
        return res.status(createCustomerResponse.status).json({
          error: getSquareErrorMessage(customerData, "Failed to create customer."),
          square: customerData
        });
      }

      customer = customerData.customer;
    }

    const customerId = customer?.id;

    if (!customerId) {
      return res.status(500).json({
        error: "Could not find or create customer."
      });
    }

    const cleanCustomerNote = String(customerNote || "").trim();

    const createBookingBody = {
      idempotency_key: makeId(),
      booking: {
        location_id: LOCATION_ID,
        location_type: "BUSINESS_LOCATION",
        customer_id: customerId,
        start_at,
        appointment_segments: [
          {
            team_member_id: staff.team_member_id,
            duration_minutes: service.duration_minutes,
            service_variation_id: service.service_variation_id,
            service_variation_version: service.service_variation_version
          }
        ]
      }
    };

    if (cleanCustomerNote) {
      createBookingBody.booking.customer_note = cleanCustomerNote;
    }

    const createBookingResponse = await fetch(
      "https://connect.squareup.com/v2/bookings",
      {
        method: "POST",
        headers: squareHeaders,
        body: JSON.stringify(createBookingBody)
      }
    );

    const bookingData = await createBookingResponse.json();

    if (!createBookingResponse.ok) {
      return res.status(createBookingResponse.status).json({
        error: getSquareErrorMessage(bookingData, "Failed to create booking."),
        square: bookingData
      });
    }

    return res.status(200).json({
      success: true,
      customer,
      booking: bookingData.booking
    });

  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      detail: error.message
    });
  }
}
