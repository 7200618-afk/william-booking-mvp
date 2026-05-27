import { createHash } from "crypto";
import { LOCATION_ID, STAFF_DATA } from "../staff-config.js";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ||
  "https://pasadena.bsideuhair.com,https://william-booking-mvp.vercel.app")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 8;
const rateLimitBuckets = globalThis.__BSU_BOOKING_RATE_LIMITS__ || new Map();
globalThis.__BSU_BOOKING_RATE_LIMITS__ = rateLimitBuckets;

const BOOKING_LOCK_TTL_MS = 15 * 1000;
const bookingLocks = globalThis.__BSU_BOOKING_LOCKS__ || new Map();
globalThis.__BSU_BOOKING_LOCKS__ = bookingLocks;

const DO_NOT_BOOK_MESSAGE =
  "We’re sorry, but we’re unable to accept this booking online. Please contact the shop directly.";

const DO_NOT_BOOK_GROUP_ID = String(
  process.env.SQUARE_DO_NOT_BOOK_GROUP_ID || ""
).trim();

const DO_NOT_BOOK_GROUP_NAME = String(
  process.env.SQUARE_DO_NOT_BOOK_GROUP_NAME || "B SIDE U - Do Not Book"
).trim();

let cachedDoNotBookGroupId = DO_NOT_BOOK_GROUP_ID || null;
let cachedDoNotBookGroupFetchedAt = 0;
const DO_NOT_BOOK_GROUP_CACHE_MS = 10 * 60 * 1000;

function getClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  const firstForwarded = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : String(forwardedFor || "").split(",")[0];

  return (
    firstForwarded.trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function isAllowedOrigin(req) {
  const origin = req.headers.origin;

  if (!origin) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

function isRateLimited(req) {
  const ip = getClientIp(req);
  const now = Date.now();
  const bucket = rateLimitBuckets.get(ip) || {
    count: 0,
    resetAt: now + RATE_LIMIT_WINDOW_MS
  };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }

  bucket.count += 1;
  rateLimitBuckets.set(ip, bucket);

  return bucket.count > RATE_LIMIT_MAX_REQUESTS;
}

function stableIdempotencyKey(parts) {
  return createHash("sha256")
    .update(parts.map(part => String(part || "").trim()).join("|"))
    .digest("hex")
    .slice(0, 45);
}

function cleanupExpiredBookingLocks() {
  const now = Date.now();

  for (const [key, expiresAt] of bookingLocks.entries()) {
    if (expiresAt <= now) {
      bookingLocks.delete(key);
    }
  }
}

function acquireBookingLock(key) {
  cleanupExpiredBookingLocks();

  if (bookingLocks.has(key)) {
    return false;
  }

  bookingLocks.set(key, Date.now() + BOOKING_LOCK_TTL_MS);
  return true;
}

function releaseBookingLock(key) {
  if (key) {
    bookingLocks.delete(key);
  }
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizePhone(phone) {
  return String(phone || "").trim();
}

function normalizePhoneDigits(phone) {
  const digits = String(phone || "").replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }

  return digits;
}

function buildPhoneCandidates(phone) {
  const raw = normalizePhone(phone);
  const digits10 = normalizePhoneDigits(phone);
  const candidates = new Set();

  if (raw) {
    candidates.add(raw);
  }

  if (digits10 && digits10.length === 10) {
    candidates.add(digits10);
    candidates.add(`+1${digits10}`);
    candidates.add(`1${digits10}`);
    candidates.add(
      `(${digits10.slice(0, 3)}) ${digits10.slice(3, 6)}-${digits10.slice(6)}`
    );
    candidates.add(
      `${digits10.slice(0, 3)}-${digits10.slice(3, 6)}-${digits10.slice(6)}`
    );
    candidates.add(
      `${digits10.slice(0, 3)} ${digits10.slice(3, 6)} ${digits10.slice(6)}`
    );
  }

  return Array.from(candidates).filter(Boolean);
}

function normalizeGroupName(name) {
  return String(name || "").trim().toLowerCase();
}

function getSquareErrorMessage(data, fallback) {
  const detail =
    data?.errors?.[0]?.detail ||
    data?.errors?.[0]?.field ||
    data?.errors?.[0]?.code;

  return detail || fallback;
}

async function squareFetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  return { response, data };
}

async function updateCustomerContact(squareHeaders, customerId, customerInfo) {
  if (!customerId) return;

  const { givenName, familyName, cleanEmail, cleanPhone } = customerInfo;

  try {
    const { response, data } = await squareFetchJson(
      `https://connect.squareup.com/v2/customers/${encodeURIComponent(customerId)}`,
      {
        method: "PUT",
        headers: squareHeaders,
        body: JSON.stringify({
          given_name: givenName,
          family_name: familyName,
          email_address: cleanEmail,
          phone_number: cleanPhone
        })
      }
    );

    if (!response.ok) {
      console.warn("Square customer contact update failed.", data);
    }
  } catch (error) {
    console.warn("Square customer contact update failed.", error);
  }
}

async function getDoNotBookGroupId(squareHeaders) {
  if (DO_NOT_BOOK_GROUP_ID) {
    return DO_NOT_BOOK_GROUP_ID;
  }

  const now = Date.now();

  if (
    cachedDoNotBookGroupId &&
    now - cachedDoNotBookGroupFetchedAt < DO_NOT_BOOK_GROUP_CACHE_MS
  ) {
    return cachedDoNotBookGroupId;
  }

  if (!DO_NOT_BOOK_GROUP_NAME) {
    return null;
  }

  const { response, data } = await squareFetchJson(
    "https://connect.squareup.com/v2/customers/groups",
    {
      method: "GET",
      headers: squareHeaders
    }
  );

  if (!response.ok) {
    console.warn("Unable to list Square customer groups.", data);
    return null;
  }

  const targetName = normalizeGroupName(DO_NOT_BOOK_GROUP_NAME);
  const group = (data.groups || []).find(
    item => normalizeGroupName(item.name) === targetName
  );

  if (group?.id) {
    cachedDoNotBookGroupId = group.id;
    cachedDoNotBookGroupFetchedAt = now;
    return group.id;
  }

  return null;
}

function customerBelongsToGroup(customer, groupId) {
  if (!customer || !groupId) {
    return false;
  }

  const groupIds = Array.isArray(customer.group_ids) ? customer.group_ids : [];
  return groupIds.includes(groupId);
}

async function searchCustomersByEmail(squareHeaders, email) {
  const cleanEmail = normalizeEmail(email);

  if (!cleanEmail) {
    return [];
  }

  const { response, data } = await squareFetchJson(
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
        limit: 10
      })
    }
  );

  if (!response.ok) {
    console.warn("Square customer email search failed.", data);
    return [];
  }

  return data.customers || [];
}

async function searchCustomersByPhone(squareHeaders, phone) {
  const phoneCandidates = buildPhoneCandidates(phone);
  const foundCustomers = new Map();

  for (const candidate of phoneCandidates) {
    const { response, data } = await squareFetchJson(
      "https://connect.squareup.com/v2/customers/search",
      {
        method: "POST",
        headers: squareHeaders,
        body: JSON.stringify({
          query: {
            filter: {
              phone_number: {
                exact: candidate
              }
            }
          },
          limit: 10
        })
      }
    );

    if (!response.ok) {
      console.warn("Square customer phone search failed.", data);
      continue;
    }

    for (const customer of data.customers || []) {
      if (customer?.id) {
        foundCustomers.set(customer.id, customer);
      }
    }
  }

  return Array.from(foundCustomers.values());
}

async function findMatchingCustomers(squareHeaders, customerEmail, customerPhone) {
  const foundCustomers = new Map();

  const emailMatches = await searchCustomersByEmail(squareHeaders, customerEmail);
  const phoneMatches = await searchCustomersByPhone(squareHeaders, customerPhone);

  for (const customer of [...emailMatches, ...phoneMatches]) {
    if (customer?.id) {
      foundCustomers.set(customer.id, customer);
    }
  }

  return Array.from(foundCustomers.values());
}

async function isDoNotBookCustomer(squareHeaders, customers) {
  const doNotBookGroupId = await getDoNotBookGroupId(squareHeaders);

  if (!doNotBookGroupId) {
    return false;
  }

  return customers.some(customer =>
    customerBelongsToGroup(customer, doNotBookGroupId)
  );
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

function addDaysToIsoDate(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  let bookingLockKey = null;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  if (!isAllowedOrigin(req)) {
    return res.status(403).json({ error: "Request origin is not allowed." });
  }

  if (isRateLimited(req)) {
    return res.status(429).json({
      error: "Too many booking attempts. Please wait a minute and try again."
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

    const selectedTimeMs = new Date(start_at).getTime();

    if (!Number.isFinite(selectedTimeMs)) {
      return res.status(400).json({
        error: "Invalid appointment time."
      });
    }

    const normalizedStartAt = new Date(selectedTimeMs).toISOString();

    if (selectedTimeMs <= Date.now() + 60 * 1000) {
      return res.status(409).json({
        error:
          "Sorry, this time has already passed. Please choose another available time."
      });
    }

    bookingLockKey = [
      LOCATION_ID,
      staff.team_member_id,
      service.service_variation_id,
      normalizedStartAt
    ].join("|");

    if (!acquireBookingLock(bookingLockKey)) {
      return res.status(409).json({
        error:
          "This time is being booked by another customer right now. Please wait a moment and choose another available time."
      });
    }

    if (!customerName || !customerPhone || !customerEmail) {
      return res.status(400).json({
        error: "Please enter your name, phone number, and email."
      });
    }

    if (!process.env.SQUARE_ACCESS_TOKEN) {
      return res.status(500).json({
        error: "Booking service is not configured."
      });
    }

    const squareHeaders = {
      "Square-Version": "2026-01-22",
      Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    };

    const cleanEmail = normalizeEmail(customerEmail);
    const cleanPhone = normalizePhone(customerPhone);
    const cleanName = String(customerName || "").trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: "Please enter a valid email." });
    }

    if (cleanPhone.replace(/\D/g, "").length < 7) {
      return res.status(400).json({ error: "Please enter a valid phone number." });
    }

    const matchingCustomers = await findMatchingCustomers(
      squareHeaders,
      cleanEmail,
      cleanPhone
    );

    const blockedCustomer = await isDoNotBookCustomer(
      squareHeaders,
      matchingCustomers
    );

    if (blockedCustomer) {
      return res.status(403).json({
        error: DO_NOT_BOOK_MESSAGE,
        code: "CUSTOMER_DO_NOT_BOOK"
      });
    }

    const selectedLocalDate = getLosAngelesDateFromUtc(normalizedStartAt);
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
        )
      });
    }

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

    if (matchingCustomers.length > 0) {
      customerId = matchingCustomers[0].id;
    }

    const nameParts = cleanName.split(/\s+/).filter(Boolean);
    const givenName = nameParts[0] || "Guest";
    const familyName = nameParts.slice(1).join(" ") || "Customer";

    /*
      找不到客户就创建新客户。
      注意：如果客户换了 phone/email，就会被当成新客户，Square group 也无法识别。
    */
    if (!customerId) {
      const createCustomerResponse = await fetch(
        "https://connect.squareup.com/v2/customers",
        {
          method: "POST",
          headers: squareHeaders,
          body: JSON.stringify({
            idempotency_key: stableIdempotencyKey([
              "customer",
              cleanEmail,
              cleanPhone,
              givenName,
              familyName
            ]),
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
          )
        });
      }

      customerId = createCustomerData.customer?.id;
    }

    if (!customerId) {
      return res.status(500).json({
        error: "Unable to create or find customer."
      });
    }

    await updateCustomerContact(squareHeaders, customerId, {
      givenName,
      familyName,
      cleanEmail,
      cleanPhone
    });

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

    bookingNoteParts.push(`Customer: ${cleanName}`);
    bookingNoteParts.push(`Phone: ${cleanPhone}`);
    bookingNoteParts.push(`Email: ${cleanEmail}`);

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
          idempotency_key: stableIdempotencyKey([
            "booking",
            LOCATION_ID,
            staffKey,
            serviceType,
            exactAvailability.start_at,
            cleanEmail,
            cleanPhone
          ]),
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
        )
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
  } finally {
    releaseBookingLock(bookingLockKey);
  }
}
