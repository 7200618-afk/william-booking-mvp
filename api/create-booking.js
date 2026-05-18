import { LOCATION_ID, STAFF_DATA } from "../staff-config.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
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

    function makeId() {
      if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
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

      if (digits.length === 12 && digits.startsWith("11")) digits = digits.slice(1);
      if (digits.length === 10) return `+1${digits}`;
      if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
      if (value.startsWith("+")) return `+${digits}`;

      return `+${digits}`;
    }

    function getSquareErrorMessage(data, fallback) {
      const firstError = data?.errors?.[0];
      if (!firstError) return fallback;

      const detail = firstError.detail || firstError.code || fallback;

      if (detail === "The string did not match the expected pattern.") {
        return "Phone number or email format is not valid. Please check and try again.";
      }

      if (detail === "Min query range is 1 hour.") {
        return "Availability check range was too short. Please try again.";
      }

      return detail;
    }

    const cleanedEmail = cleanEmail(customerEmail);
    const normalizedPhone = normalizePhone(customerPhone);

    if (!staffKey || !serviceType || !start_at) {
      return res.status(400).json({ error: "Missing required booking information." });
    }

    if (!customerName || !normalizedPhone || !cleanedEmail) {
      return res.status(400).json({ error: "Name, phone, and email are required." });
    }

    if (!cleanedEmail.includes("@") || !cleanedEmail.includes(".")) {
      return res.status(400).json({ error: "Please enter a valid email address." });
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

    const nameParts = String(customerName).trim().split(/\s+/);
    const givenName = nameParts[0] || customerName;
    const familyName = nameParts.slice(1).join(" ");

    async function checkExactAvailability() {
      const startDate = new Date(start_at);

      if (Number.isNaN(startDate.getTime())) {
        return {
          ok: false,
          available: false,
          data: { errors: [{ detail: "Invalid appointment time." }] }
        };
      }

      const searchMinutes = Math.max(Number(service.duration_minutes || 0), 60);
      const endDate = new Date(startDate.getTime() + searchMinutes * 60 * 1000);

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
        return { ok: false, available: false, data };
      }

      const selectedTimeMs = new Date(start_at).getTime();

      const exactAvailable = (data.availabilities || []).some(availability => {
        return new Date(availability.start_at).getTime() === selectedTimeMs;
      });

      return { ok: true, available: exactAvailable, data };
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
      if (!response.ok) return null;

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
      if (!response.ok) return null;

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
      return res.status(500).json({ error: "Could not find or create customer." });
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
