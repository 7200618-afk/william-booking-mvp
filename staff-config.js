export const LOCATION_ID = "L3QJNBCTPSYW7";

export const BUSINESS = {
  name: "B SIDE U - Pasadena",
  phone: "(213) 273-5462",
  tel: "2132735462",
  address: "350 S Lake Ave Ste 115, Pasadena, CA 91101",
  mapUrl: "https://www.google.com/maps/search/?api=1&query=350%20S%20Lake%20Ave%20Ste%20115%2C%20Pasadena%2C%20CA%2091101",

  // 如果 Square 官方 waitlist 已经开启，这里可以放 Square 官方预约页面
  waitlistUrl: "https://book.squareup.com/appointments/yf77xpa7nsi6y2/location/L3QJNBCTPSYW7"
};

export const STAFF_DATA = {
  William: {
    name: "William",
    order: 1,
    startDate: "2026-05-27",
    specialWorkDates: ["2026-05-27"],
    days: ["mon", "thu", "fri", "sat", "sun"],
    image: "https://images.editor.website/uploads/b/559d7de91ca0c03e99beec1fe8bb19300c68147e7c0e8b214d463495239f943c/IMG_2177_1779099876.jpeg?width=400&optimize=medium",
    team_member_id: "TMWIhbRkPFn61SpR",
    defaultService: "haircut",
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
    name: "Ryan",
    order: 2,
    days: ["mon", "tue", "wed", "thu", "fri"],
    image: "https://images.editor.website/uploads/b/559d7de91ca0c03e99beec1fe8bb19300c68147e7c0e8b214d463495239f943c/123121212_1764920283.JPG?width=400&optimize=medium",
    team_member_id: "TMm7W1ZmprhAbD-Q",
    defaultService: "haircut",
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
    name: "Ken",
    order: 3,
    days: ["tue", "wed", "fri", "sat", "sun"],
    image: "https://appointments-production-f.squarecdn.com/files/8ab010be3ad4f51892e1c75509dc0572/original.jpeg",
    team_member_id: "TMbO57WbplZRl2vp",
    defaultService: "haircut",
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
    name: "Fiona",
    order: 4,
    days: ["mon", "tue", "wed", "fri", "sat"],
    image: "https://images.editor.website/uploads/b/559d7de91ca0c03e99beec1fe8bb19300c68147e7c0e8b214d463495239f943c/fiona_1744180262.jpeg",
    team_member_id: "TMZ4Soxe_hDKg3Ht",
    defaultService: "haircut",
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
      }
    }
  },

  Nami: {
    name: "Nami",
    order: 5,
    days: ["tue", "wed", "thu", "sun"],
    image: "https://images.editor.website/uploads/b/559d7de91ca0c03e99beec1fe8bb19300c68147e7c0e8b214d463495239f943c/nami_1744180260.jpeg",
    team_member_id: "TMm4INT2vtpvuQRo",
    defaultService: "haircut",
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
    name: "Jacob",
    order: 999,
    days: ["wed", "thu", "fri", "sat"],
    image: "https://appointments-production-f.squarecdn.com/files/fa093c26c9f36366886b8ed1a776878a/original.jpeg",
    team_member_id: "TMGkdiUy-xaRP5_W",
    defaultService: "haircut",
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