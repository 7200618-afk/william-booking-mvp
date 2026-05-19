import { randomUUID } from "crypto";
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

    if (!staffKey || !serviceType || !start_at) {
      return res.status(400).json({
        error: "Missing required booking information."
      });
    }

    const staff = STAFF_DATA[staffKey];

    if (!staff) {
      return res.status(400).json({
        error: "Invalid staff."
      });
    }

    const service = staff.services?.[serviceType];

    if (!service) {
      return res.status(400).json({
        error: "Invalid service."
      });
    }

    if (!customerName || !customerPhone || !customerEmail) {
      return res.status(400).json({
        error: "Please enter your name, phone number, and email."
      });
    }

    const squareHeaders = {
      "Square-Version": "2026-01-22",
      Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    };

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

    function addDaysToIsoDate(isoDate, days) {
      const d = new Date(`${isoDate}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    }

    function normalizeEmail(email) {
      return String(email || "").trim().toLowerCase();
    }

    function normalizePhone(phone) {
      return String(phone || "").trim();
    }

    function getSquareErrorMessage(data, fallback) {
      const detail =
        data?.errors?.[0]?.detail ||
        data?.errors?.[0]?.field ||
        data?.errors?.[0]?.code;

      return detail || fallback;
    }

    const selectedLocalDate = getLosAngelesDateFromUtc(start_at);
    const previousDate = addDaysToIsoDate(selectedLocalDate, -1);
    const nextDate = addDaysToIsoDate(selectedLocalDate, 1);

    /*
      DST-safe availability check:
      不写死 10AM = 17:00Z / 18:00Z。
      查宽一点的 UTC 范围，再只保留 LA 日期等于预约日期的结果。
    */
    const searchStartAt = `${previousDate}T20:00:00Z`;
    const searchEndAt = `${nextDate}T12:00:00Z`;

    const availabilityResponse = await fetch(
      "https://connect.squareup.com/v2/bookings/availability/search",
      {
        method: "POST",
        headers: squareHeaders,
        body: JSON.stringify({
          query: {
            filter: {
              start_at_range: {
                start_at: searchStartAt,
                end_at: searchEndAt
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

    const availabilityData = await availabilityResponse.json();

    if (!availabilityResponse.ok) {
      return res.status(availabilityResponse.status).json({
        error: getSquareErrorMessage(
          availabilityData,
          "Unable to confirm availability. Please try again."
        ),
        square: availabilityData
      });
    }

    const selectedTimeMs = new Date(start_at).getTime();

    const exactAvailability = (availabilityData.availabilities || []).find(
      availability => {
        const sameLocalDate =
          getLosAngelesDateFromUtc(availability.start_at) === selectedLocalDate;

        const sameTime =
          new Date(availability.start_at).getTime() === selectedTimeMs;

        return sameLocalDate && sameTime;
      }
    );

    if (!exactAvailability) {
      return res.status(409).json({
        error:
          "Sorry, this time is no longer available. Please choose another time."
      });
    }

    let customerId = null;

    const cleanEmail = normalizeEmail(customerEmail);
    const cleanPhone = normalizePhone(customerPhone);
    const cleanName = String(customerName || "").trim();

    const nameParts = cleanName.split(/\s+/).filter(Boolean);
    const givenName = nameParts[0] || "Guest";
    const familyName = nameParts.slice(1).join(" ") || "Customer";

    /*
      先按 email 搜索客户，避免每次预约都创建重复 customer。
    */
    const customerSearchResponse = await fetch(
      "https://connect.squareup.com/v2/customers/search",
      {
        method: "POST",
        headers: squareHeaders,
        body: JSON.stringify({
          query: {
            filter: {
              email_address: {
                exact: cleanEmail
              }
            }
          },
          limit: 1
        })
      }
    );

    const customerSearchData = await customerSearchResponse.json();

    if (
      customerSearchResponse.ok &&
      customerSearchData.customers &&
      customerSearchData.customers.length > 0
    ) {
      customerId = customerSearchData.customers[0].id;
    }

    /*
      找不到客户就创建新客户。
    */
    if (!customerId) {
      const createCustomerResponse = await fetch(
        "https://connect.squareup.com/v2/customers",
        {
          method: "POST",
          headers: squareHeaders,
          body: JSON.stringify({
            idempotency_key: randomUUID(),
            given_name: givenName,
            family_name: familyName,
            email_address: cleanEmail,
            phone_number: cleanPhone
          })
        }
      );

      const createCustomerData = await createCustomerResponse.json();

      if (!createCustomerResponse.ok) {
        return res.status(createCustomerResponse.status).json({
          error: getSquareErrorMessage(
            createCustomerData,
            "Unable to create customer. Please try again."
          ),
          square: createCustomerData
        });
      }

      customerId = createCustomerData.customer?.id;
    }

    if (!customerId) {
      return res.status(500).json({
        error: "Unable to create or find customer."
      });
    }

    const selectedSegment =
      exactAvailability.appointment_segments &&
      exactAvailability.appointment_segments.length > 0
        ? exactAvailability.appointment_segments[0]
        : null;

    const appointmentSegment = selectedSegment
      ? {
          duration_minutes:
            selectedSegment.duration_minutes || service.duration_minutes,
          service_variation_id:
            selectedSegment.service_variation_id ||
            service.service_variation_id,
          team_member_id:
            selectedSegment.team_member_id || staff.team_member_id,
          service_variation_version:
            selectedSegment.service_variation_version
        }
      : {
          duration_minutes: service.duration_minutes,
          service_variation_id: service.service_variation_id,
          team_member_id: staff.team_member_id
        };

    Object.keys(appointmentSegment).forEach(key => {
      if (
        appointmentSegment[key] === undefined ||
        appointmentSegment[key] === null ||
        appointmentSegment[key] === ""
      ) {
        delete appointmentSegment[key];
      }
    });

    const bookingNoteParts = [];

    if (customerNote) {
      bookingNoteParts.push(`Note from customer: ${customerNote}`);
    }

    bookingNoteParts.push(
      `Booked online. Service: ${staff.name} - ${service.label}`
    );

    const createBookingResponse = await fetch(
      "https://connect.squareup.com/v2/bookings",
      {
        method: "POST",
        headers: squareHeaders,
        body: JSON.stringify({
          idempotency_key: randomUUID(),
          booking: {
            customer_id: customerId,
            location_id: LOCATION_ID,
            start_at: exactAvailability.start_at,
            appointment_segments: [appointmentSegment],
            customer_note: bookingNoteParts.join("\n")
          }
        })
      }
    );

    const createBookingData = await createBookingResponse.json();

    if (!createBookingResponse.ok) {
      return res.status(createBookingResponse.status).json({
        error: getSquareErrorMessage(
          createBookingData,
          "Booking failed. Please choose another time."
        ),
        square: createBookingData
      });
    }

    return res.status(200).json({
      success: true,
      booking: createBookingData.booking
    });
  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      detail: error.message
    });
  }
}
