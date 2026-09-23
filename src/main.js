import "./style.css";

import L from "leaflet";

import {
  initializeApp
} from "firebase/app";

import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  onAuthStateChanged,
  signOut,
  updateProfile
} from "firebase/auth";

import {
  getFirestore,
  collection,
  addDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  limit
} from "firebase/firestore";

import {
  getCurrentPosition,
  requestPermissions,
  checkPermissions
} from "@capacitor/geolocation";


/* =====================================================
   FIREBASE
===================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyAZVXuhTTiGKfDflIZUm_8IgzhRjjWsfIc",
  authDomain: "wasselni-monufia-13f28.firebaseapp.com",
  projectId: "wasselni-monufia-13f28",
  storageBucket: "wasselni-monufia-13f28.firebasestorage.app",
  messagingSenderId: "1007737426615",
  appId: "1:1007737426615:web:3a9d2638b8cb9616cef332",
  measurementId: "G-7K0MVY6F73"
};

const firebaseApp = initializeApp(firebaseConfig);

const auth = getAuth(firebaseApp);

const db = getFirestore(firebaseApp);


/* =====================================================
   VARIABLES
===================================================== */

let map = null;

let fromMarker = null;

let toMarker = null;

let routeLayer = null;

let fromPlace = null;

let toPlace = null;

let confirmationResult = null;

let recaptcha = null;

let currentRole = "customer";

let unsubscribeOffers = null;

let unsubscribeCaptainRides = null;

let unsubscribeTrip = null;


/* =====================================================
   HELPERS
===================================================== */

const $ = (selector) => document.querySelector(selector);

function money(value) {
  return `${Number(value || 0).toLocaleString("ar-EG")} جنيه`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function show(id) {

  document
    .querySelectorAll("section.screen")
    .forEach(section => {
      section.classList.add("hidden");
    });

  const screen = document.getElementById(id);

  if (screen) {
    screen.classList.remove("hidden");
  }

  document
    .querySelectorAll(".nav button")
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.screen === id
      );

    });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  if (id === "offers") {
    loadCustomerOffers();
  }

  if (id === "captain") {
    loadCaptainRides();
  }

}


/* =====================================================
   HTML
===================================================== */

document.querySelector("#app").innerHTML = `

<header>

  <div class="logo">
    وصلني <span>المنوفية</span>
  </div>

  <button id="authMini" class="header-user">
    👤
  </button>

</header>


<section id="home" class="screen">

  <div class="hero">

    <h2>مشوارك يبدأ من هنا 🚕</h2>

    <p>
      حدد مكان الركوب والوصول،
      واكتب السعر المناسب ليك.
    </p>

  </div>


  <div class="card">

    <div class="map-container">

      <div id="map"></div>

      <button
        id="locationBtn"
        class="map-location-btn"
        type="button"
      >
        📍 موقعي الحالي
      </button>

    </div>


    <label>
      📍 مكان الركوب
    </label>

    <input
      id="from"
      placeholder="اكتب مكان الركوب"
      autocomplete="off"
    />


    <label>
      📍 مكان الوصول
    </label>

    <input
      id="to"
      placeholder="اكتب مكان الوصول"
      autocomplete="off"
    />


    <div id="searchMessage" class="muted"></div>


    <div class="row">

      <div>

        <label>
          💰 السعر المقترح
        </label>

        <input
          id="price"
          type="number"
          min="1"
          placeholder="مثال: 500"
        />

      </div>


      <div>

        <label>
          👥 عدد الركاب
        </label>

        <input
          id="passengers"
          type="number"
          min="1"
          max="8"
          value="1"
        />

      </div>

    </div>


    <label>
      📝 ملاحظات
    </label>

    <textarea
      id="notes"
      placeholder="مثال: معايا شنطة كبيرة"
      rows="3"
    ></textarea>


    <button
      class="btn primary"
      id="requestBtn"
    >
      🚕 اطلب الرحلة
    </button>

  </div>


  <div class="row">

    <button
      class="btn outline"
      id="myRidesBtn"
    >
      رحلاتي
    </button>


    <button
      class="btn outline"
      id="loginBtn"
    >
      تسجيل / دخول
    </button>

  </div>

</section>


<section
  id="offers"
  class="screen hidden"
>

  <h2>
    عروض الكباتن
  </h2>

  <div id="offersList"></div>

</section>


<section
  id="captain"
  class="screen hidden"
>

  <h2>
    لوحة الكابتن 👨‍✈️
  </h2>


  <div class="card switch">

    <b>
      متاح للرحلات
    </b>

    <input
      id="captainAvailable"
      type="checkbox"
      checked
    />

  </div>


  <div id="captainRides"></div>

</section>


<section
  id="trip"
  class="screen hidden"
>

  <h2>
    الرحلة الحالية 🚕
  </h2>

  <div id="tripBox"></div>

</section>


<section
  id="profile"
  class="screen hidden"
>

  <h2>
    حسابي
  </h2>


  <div class="card profile-card">

    <div class="avatar">
      👤
    </div>

    <h3 id="profileName">
      زائر
    </h3>

    <div
      id="profilePhone"
      class="muted"
    >
      غير مسجل
    </div>

  </div>


  <div class="card">

    <label>
      الاسم
    </label>

    <input
      id="profileNameInput"
      placeholder="اكتب اسمك"
    />


    <label>
      الدور
    </label>

    <select id="profileRole">

      <option value="customer">
        عميل
      </option>

      <option value="captain">
        كابتن
      </option>

    </select>


    <label>
      نوع السيارة
    </label>

    <input
      id="carModel"
      placeholder="مثال: تويوتا كورولا"
    />


    <label>
      رقم اللوحة
    </label>

    <input
      id="plate"
      placeholder="مثال: م ن 1234"
    />


    <button
      class="btn primary"
      id="saveProfile"
    >
      حفظ البيانات
    </button>


    <button
      class="btn danger"
      id="logoutBtn"
    >
      تسجيل الخروج
    </button>

  </div>

</section>


<section
  id="auth"
  class="screen hidden"
>

  <h2>
    تسجيل الدخول
  </h2>

  <p class="muted">
    سنرسل كود تحقق SMS على رقم هاتفك.
  </p>


  <div class="card">

    <label>
      رقم الهاتف
    </label>

    <input
      id="phone"
      placeholder="+2010xxxxxxxx"
      inputmode="tel"
    />


    <div id="recaptcha"></div>


    <button
      class="btn primary"
      id="sendOtp"
    >
      إرسال الكود
    </button>


    <div
      id="otpBox"
      class="hidden"
    >

      <label>
        كود التحقق
      </label>

      <input
        id="otp"
        inputmode="numeric"
        maxlength="6"
      />

      <button
        class="btn green"
        id="verifyOtp"
      >
        تأكيد
      </button>

    </div>


    <div id="authMsg"></div>

  </div>

</section>


<nav class="nav">

  <button
    class="active"
    data-screen="home"
  >
    🏠
    <br>
    الرئيسية
  </button>


  <button
    data-screen="offers"
  >
    🚕
    <br>
    الرحلات
  </button>


  <button
    data-screen="captain"
  >
    👨‍✈️
    <br>
    الكابتن
  </button>


  <button
    data-screen="profile"
  >
    👤
    <br>
    حسابي
  </button>

</nav>
`;


/* =====================================================
   MAP
===================================================== */

function initializeMap() {

  if (map) {

    setTimeout(() => {
      map.invalidateSize();
    }, 100);

    return;
  }


  map = L.map("map", {
    zoomControl: true
  }).setView(
    [30.5877, 30.5950],
    10
  );


  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors"
    }
  ).addTo(map);


  map.on("click", async (event) => {

    const lat = event.latlng.lat;

    const lng = event.latlng.lng;

    await setFromLocation(
      lat,
      lng,
      true
    );

  });


  setTimeout(() => {
    map.invalidateSize();
  }, 300);

}


/* =====================================================
   REVERSE GEOCODING
===================================================== */

async function reverseGeocode(
  lat,
  lng
) {

  const url =
    `https://nominatim.openstreetmap.org/reverse` +
    `?format=jsonv2` +
    `&lat=${encodeURIComponent(lat)}` +
    `&lon=${encodeURIComponent(lng)}` +
    `&accept-language=ar`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error("تعذر تحديد المكان");
  }

  return await response.json();
}


/* =====================================================
   SEARCH
===================================================== */

async function searchPlace(text) {

  const value = text.trim();

  if (!value) {
    return [];
  }


  const queryText =
    `${value}, Egypt`;


  const url =
    `https://nominatim.openstreetmap.org/search` +
    `?format=jsonv2` +
    `&q=${encodeURIComponent(queryText)}` +
    `&countrycodes=eg` +
    `&limit=5` +
    `&accept-language=ar`;


  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });


  if (!response.ok) {
    throw new Error("فشل البحث");
  }


  return await response.json();

}


/* =====================================================
   MARKERS
===================================================== */

function removeMarker(
  marker
) {

  if (
    marker &&
    map
  ) {

    map.removeLayer(marker);

  }

}


function addMarker(
  lat,
  lng,
  text,
  type
) {

  const marker =
    L.marker(
      [lat, lng],
      {
        draggable: true
      }
    )
    .addTo(map)
    .bindPopup(text)
    .openPopup();


  marker.on(
    "dragend",
    async () => {

      const position =
        marker.getLatLng();


      try {

        const data =
          await reverseGeocode(
            position.lat,
            position.lng
          );


        const address =
          data.display_name ||
          "مكان محدد";


        if (type === "from") {

          fromPlace = {
            lat: position.lat,
            lng: position.lng,
            address
          };

          $("#from").value =
            address;

        } else {

          toPlace = {
            lat: position.lat,
            lng: position.lng,
            address
          };

          $("#to").value =
            address;

        }


        await drawRoute();

      } catch (error) {

        console.error(error);

      }

    }
  );


  return marker;

}


/* =====================================================
   SET FROM
===================================================== */

async function setFromLocation(
  lat,
  lng,
  reverse = false
) {

  try {

    let address =
      "موقع الركوب";


    if (reverse) {

      const data =
        await reverseGeocode(
          lat,
          lng
        );

      address =
        data.display_name ||
        address;

    }


    fromPlace = {
      lat,
      lng,
      address
    };


    $("#from").value =
      address;


    removeMarker(
      fromMarker
    );


    fromMarker =
      addMarker(
        lat,
        lng,
        "مكان الركوب",
        "from"
      );


    map.setView(
      [lat, lng],
      15
    );


    await drawRoute();


  } catch (error) {

    console.error(error);

    alert(
      "مش قادر أحدد المكان دلوقتي."
    );

  }

}


/* =====================================================
   SET DESTINATION
===================================================== */

async function setDestination(
  lat,
  lng,
  address
) {

  toPlace = {
    lat,
    lng,
    address
  };


  $("#to").value =
    address;


  removeMarker(
    toMarker
  );


  toMarker =
    addMarker(
      lat,
      lng,
      "مكان الوصول",
      "to"
    );


  map.setView(
    [lat, lng],
    15
  );


  await drawRoute();

}


/* =====================================================
   CHOOSE PLACE
===================================================== */

async function choosePlace(
  inputId,
  type
) {

  const input =
    $(inputId);


  const value =
    input.value.trim();


  if (!value) {
    return;
  }


  $("#searchMessage").textContent =
    "جاري البحث...";


  try {

    const results =
      await searchPlace(
        value
      );


    if (!results.length) {

      $("#searchMessage").textContent =
        "المكان مش موجود. جرّب اسم شارع أو منطقة أو قرية بشكل أوضح.";

      return;

    }


    const result =
      results[0];


    const lat =
      Number(result.lat);


    const lng =
      Number(result.lon);


    const address =
      result.display_name ||
      value;


    if (type === "from") {

      await setFromLocation(
        lat,
        lng,
        false
      );

      fromPlace.address =
        address;

      $("#from").value =
        address;

    } else {

      await setDestination(
        lat,
        lng,
        address
      );

    }


    $("#searchMessage").textContent =
      "تم تحديد المكان ✅";


  } catch (error) {

    console.error(error);

    $("#searchMessage").textContent =
      "حصل خطأ أثناء البحث.";

  }

}


/* =====================================================
   ROUTE
===================================================== */

async function drawRoute() {

  if (
    !fromPlace ||
    !toPlace ||
    !map
  ) {

    return;

  }


  try {

    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${fromPlace.lng},${fromPlace.lat};` +
      `${toPlace.lng},${toPlace.lat}` +
      `?overview=full&geometries=geojson`;


    const response =
      await fetch(url);


    const data =
      await response.json();


    if (
      data.code !== "Ok" ||
      !data.routes ||
      !data.routes.length
    ) {

      alert(
        "مش لاقي طريق بين المكانين."
      );

      return;

    }


    if (routeLayer) {

      map.removeLayer(
        routeLayer
      );

    }


    routeLayer =
      L.geoJSON(
        data.routes[0].geometry,
        {
          style: {
            weight: 6
          }
        }
      ).addTo(map);


    map.fitBounds(
      routeLayer.getBounds(),
      {
        padding: [30, 30]
      }
    );


  } catch (error) {

    console.error(
      "Route error:",
      error
    );

  }

}


/* =====================================================
   CURRENT LOCATION
===================================================== */

async function getDeviceLocation() {

  try {

    let permissions =
      await checkPermissions();


    if (
      permissions.location !== "granted"
    ) {

      permissions =
        await requestPermissions();

    }


    if (
      permissions.location !== "granted"
    ) {

      throw new Error(
        "لم يتم السماح بالموقع"
      );

    }


    const position =
      await getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000
      });


    return {
      lat:
        position.coords.latitude,

      lng:
        position.coords.longitude
    };


  } catch (error) {

    console.error(
      "Location error:",
      error
    );


    if (
      navigator.geolocation
    ) {

      return await new Promise(
        (resolve, reject) => {

          navigator.geolocation.getCurrentPosition(
            position => {

              resolve({
                lat:
                  position.coords.latitude,

                lng:
                  position.coords.longitude
              });

            },

            reject,

            {
              enableHighAccuracy: true,
              timeout: 15000
            }
          );

        }
      );

    }


    throw error;

  }

}


/* =====================================================
   LOCATION BUTTON
===================================================== */

$("#locationBtn").onclick =
  async () => {

    const button =
      $("#locationBtn");


    button.disabled =
      true;


    button.textContent =
      "📍 جاري تحديد موقعك...";


    try {

      const position =
        await getDeviceLocation();


      await setFromLocation(
        position.lat,
        position.lng,
        true
      );


    } catch (error) {

      alert(
        "اسمح للتطبيق باستخدام الموقع من إعدادات الموبايل، وبعدها جرّب تاني."
      );

    } finally {

      button.disabled =
        false;

      button.textContent =
        "📍 موقعي الحالي";

    }

  };


/* =====================================================
   SEARCH EVENTS
===================================================== */

$("#from").addEventListener(
  "keydown",
  event => {

    if (
      event.key === "Enter"
    ) {

      event.preventDefault();

      choosePlace(
        "#from",
        "from"
      );

    }

  }
);


$("#to").addEventListener(
  "keydown",
  event => {

    if (
      event.key === "Enter"
    ) {

      event.preventDefault();

      choosePlace(
        "#to",
        "to"
      );

    }

  }
);


$("#from").addEventListener(
  "change",
  () => {

    choosePlace(
      "#from",
      "from"
    );

  }
);


$("#to").addEventListener(
  "change",
  () => {

    choosePlace(
      "#to",
      "to"
    );

  }
);


/* =====================================================
   AUTH
===================================================== */

function requireUser() {

  if (
    !auth.currentUser
  ) {

    show("auth");

    return false;

  }

  return true;

}


/* =====================================================
   SEND OTP
===================================================== */

$("#sendOtp").onclick =
  async () => {

    const phone =
      $("#phone").value.trim();


    if (!phone) {

      $("#authMsg").innerHTML =
        `<div class="notice error">
          اكتب رقم الهاتف الأول.
        </div>`;

      return;

    }


    try {

      if (!recaptcha) {

        recaptcha =
          new RecaptchaVerifier(
            auth,
            "recaptcha",
            {
              size: "normal"
            }
          );

      }


      confirmationResult =
        await signInWithPhoneNumber(
          auth,
          phone,
          recaptcha
        );


      $("#otpBox")
        .classList
        .remove("hidden");


      $("#authMsg").innerHTML =
        `<div class="notice">
          تم إرسال كود التحقق على الموبايل.
        </div>`;


    } catch (error) {

      console.error(error);


      $("#authMsg").innerHTML =
        `<div class="notice error">
          ${escapeHtml(
            error.message ||
            "حصل خطأ أثناء إرسال الكود."
          )}
        </div>`;

    }

  };


/* =====================================================
   VERIFY OTP
===================================================== */

$("#verifyOtp").onclick =
  async () => {

    if (!confirmationResult) {

      return;

    }


    const code =
      $("#otp").value.trim();


    if (!code) {

      return;

    }


    try {

      await confirmationResult.confirm(
        code
      );


      $("#authMsg").innerHTML =
        `<div class="notice">
          تم تسجيل الدخول ✅
        </div>`;


      show("home");


    } catch (error) {

      console.error(error);


      $("#authMsg").innerHTML =
        `<div class="notice error">
          كود التحقق غير صحيح.
        </div>`;

    }

  };


/* =====================================================
   CREATE RIDE
===================================================== */

$("#requestBtn").onclick =
  async () => {

    if (!requireUser()) {
      return;
    }


    if (
      !fromPlace ||
      !toPlace
    ) {

      alert(
        "حدد مكان الركوب ومكان الوصول الأول."
      );

      return;

    }


    const price =
      Number(
        $("#price").value
      );


    const passengers =
      Number(
        $("#passengers").value || 1
      );


    const notes =
      $("#notes").value.trim();


    if (!price || price <= 0) {

      alert(
        "اكتب السعر المقترح."
      );

      return;

    }


    if (
      passengers < 1 ||
      passengers > 8
    ) {

      alert(
        "عدد الركاب من 1 إلى 8."
      );

      return;

    }


    const user =
      auth.currentUser;


    try {

      const ride =
        await addDoc(
          collection(
            db,
            "rides"
          ),
          {

            customerId:
              user.uid,

            customerName:
              user.displayName ||
              "عميل",

            customerPhone:
              user.phoneNumber ||
              "",


            from:
              fromPlace.address ||
              $("#from").value,

            to:
              toPlace.address ||
              $("#to").value,


            fromLat:
              fromPlace.lat,

            fromLng:
              fromPlace.lng,


            toLat:
              toPlace.lat,

            toLng:
              toPlace.lng,


            price,

            passengers,

            notes,


            status:
              "open",


            createdAt:
              serverTimestamp()

          }
        );


      localStorage.setItem(
        "lastRide",
        ride.id
      );


      alert(
        "تم نشر الرحلة للكباتن ✅"
      );


      show("offers");


    } catch (error) {

      console.error(error);


      alert(
        "حصل خطأ أثناء إنشاء الرحلة."
      );

    }

  };


/* =====================================================
   CUSTOMER OFFERS
===================================================== */

async function loadCustomerOffers() {

  if (
    !auth.currentUser
  ) {

    $("#offersList").innerHTML =
      `<div class="card">
        سجل دخولك أولاً لمتابعة الرحلات.
      </div>`;

    return;

  }


  const rideId =
    localStorage.getItem(
      "lastRide"
    );


  if (!rideId) {

    $("#offersList").innerHTML =
      `<div class="card">
        لا توجد رحلة حالية.
      </div>`;

    return;

  }


  if (
    unsubscribeOffers
  ) {

    unsubscribeOffers();

    unsubscribeOffers =
      null;

  }


  try {

    const rideSnapshot =
      await getDoc(
        doc(
          db,
          "rides",
          rideId
        )
      );


    if (
      !rideSnapshot.exists()
    ) {

      $("#offersList").innerHTML =
        `<div class="card">
          الرحلة غير موجودة.
        </div>`;

      return;

    }


    const ride =
      rideSnapshot.data();


    $("#offersList").innerHTML = `

      <div class="card">

        <b>
          ${escapeHtml(
            ride.from
          )}
        </b>

        <div class="route-arrow">
          ↓
        </div>

        <b>
          ${escapeHtml(
            ride.to
          )}
        </b>


        <p class="muted">

          السعر المطلوب:
          ${money(ride.price)}

          •
          ${ride.passengers || 1}
          راكب

        </p>


        ${
          ride.notes
            ? `<p class="muted">
                📝 ${escapeHtml(
                  ride.notes
                )}
              </p>`
            : ""
        }


        <span class="pill">
          ${escapeHtml(
            ride.status ||
            "open"
          )}
        </span>

      </div>


      <div id="offerCards"></div>

    `;


    unsubscribeOffers =
      onSnapshot(
        query(
          collection(
            db,
            "rides",
            rideId,
            "offers"
          ),
          orderBy(
            "createdAt",
            "asc"
          )
        ),
        snapshot => {

          const offers =
            snapshot.docs.map(
              item => ({
                id:
                  item.id,

                ...item.data()
              })
            );


          if (!offers.length) {

            $("#offerCards").innerHTML =
              `<div class="card muted">
                في انتظار عروض الكباتن...
              </div>`;

            return;

          }


          $("#offerCards").innerHTML =
            offers.map(
              offer => `

                <div class="card">

                  <div class="offer">

                    <div>

                      <b>
                        ${escapeHtml(
                          offer.captainName ||
                          "كابتن"
                        )}
                      </b>

                      <div class="muted">
                        🚗 ${escapeHtml(
                          offer.carModel ||
                          "سيارة"
                        )}
                      </div>

                      <div class="muted">
                        ⭐ ${escapeHtml(
                          offer.rating ||
                          "جديد"
                        )}
                      </div>

                    </div>


                    <div class="price">
                      ${money(
                        offer.price
                      )}
                    </div>

                  </div>


                  <button
                    class="btn green"
                    data-accept="${offer.id}"
                    data-ride="${rideId}"
                  >
                    قبول العرض
                  </button>

                </div>

              `
            )
            .join("");


          document
            .querySelectorAll(
              "[data-accept]"
            )
            .forEach(button => {

              button.onclick =
                () =>
                  acceptOffer(
                    button.dataset.ride,
                    button.dataset.accept
                  );

            });

        }
      );

  } catch (error) {

    console.error(error);

  }

}


/* =====================================================
   ACCEPT OFFER
===================================================== */

async function acceptOffer(
  rideId,
  offerId
) {

  try {

    const offerSnapshot =
      await getDoc(
        doc(
          db,
          "rides",
          rideId,
          "offers",
          offerId
        )
      );


    if (
      !offerSnapshot.exists()
    ) {

      return;

    }


    const offer =
      offerSnapshot.data();


    await updateDoc(
      doc(
        db,
        "rides",
        rideId
      ),
      {

        status:
          "accepted",

        acceptedOfferId:
          offerId,

        captainId:
          offer.captainId,

        captainName:
          offer.captainName,

        finalPrice:
          offer.price

      }
    );


    localStorage.setItem(
      "activeRide",
      rideId
    );


    show("trip");


    listenTrip(
      rideId
    );


  } catch (error) {

    console.error(error);

    alert(
      "حصل خطأ أثناء قبول العرض."
    );

  }

}


/* =====================================================
   CAPTAIN RIDES
===================================================== */

function loadCaptainRides() {

  if (
    !auth.currentUser
  ) {

    $("#captainRides").innerHTML =
      `<div class="card">
        سجل دخولك أولاً.
      </div>`;

    return;

  }


  if (
    currentRole !== "captain"
  ) {

    $("#captainRides").innerHTML =
      `<div class="card">
        ادخل على حسابي واختر الدور «كابتن».
      </div>`;

    return;

  }


  if (
    unsubscribeCaptainRides
  ) {

    unsubscribeCaptainRides();

    unsubscribeCaptainRides =
      null;

  }


  const ridesQuery =
    query(
      collection(
        db,
        "rides"
      ),
      where(
        "status",
        "==",
        "open"
      ),
      limit(20)
    );


  unsubscribeCaptainRides =
    onSnapshot(
      ridesQuery,
      snapshot => {

        const rides =
          snapshot.docs.map(
            item => ({
              id:
                item.id,

              ...item.data()
            })
          );


        rides.sort(
          (a, b) => {

            const aTime =
              a.createdAt?.seconds ||
              0;

            const bTime =
              b.createdAt?.seconds ||
              0;

            return bTime - aTime;

          }
        );


        if (!rides.length) {

          $("#captainRides").innerHTML =
            `<div class="card muted">
              لا توجد رحلات مفتوحة الآن.
            </div>`;

          return;

        }


        $("#captainRides").innerHTML =
          rides.map(
            ride => `

              <div class="card">

                <b>
                  ${escapeHtml(
                    ride.from
                  )}
                </b>

                <div class="route-arrow">
                  ↓
                </div>

                <b>
                  ${escapeHtml(
                    ride.to
                  )}
                </b>


                <p class="muted">

                  👥
                  ${ride.passengers || 1}
                  راكب

                  •
                  السعر المقترح:
                  ${money(
                    ride.price
                  )}

                </p>


                ${
                  ride.notes
                    ? `<p class="muted">
                        📝 ${escapeHtml(
                          ride.notes
                        )}
                      </p>`
                    : ""
                }


                <div class="row">

                  <input
                    id="offer-${ride.id}"
                    type="number"
                    min="1"
                    placeholder="اكتب سعرك"
                  />

                  <button
                    class="btn green"
                    data-offer="${ride.id}"
                  >
                    إرسال العرض
                  </button>

                </div>

              </div>

            `
          )
          .join("");


        document
          .querySelectorAll(
            "[data-offer]"
          )
          .forEach(button => {

            button.onclick =
              () =>
                sendOffer(
                  button.dataset.offer
                );

          });

      },
      error => {

        console.error(error);

        $("#captainRides").innerHTML =
          `<div class="card error">
            حصل خطأ في تحميل الرحلات.
          </div>`;

      }
    );

}


/* =====================================================
   SEND OFFER
===================================================== */

async function sendOffer(
  rideId
) {

  const input =
    $(
      `#offer-${rideId}`
    );


  const price =
    Number(
      input?.value
    );


  if (!price) {

    alert(
      "اكتب سعرك."
    );

    return;

  }


  const user =
    auth.currentUser;


  if (!user) {

    show("auth");

    return;

  }


  try {

    const profile =
      await getDoc(
        doc(
          db,
          "users",
          user.uid
        )
      );


    const data =
      profile.exists()
        ? profile.data()
        : {};


    await setDoc(
      doc(
        db,
        "rides",
        rideId,
        "offers",
        user.uid
      ),
      {

        captainId:
          user.uid,

        captainName:
          data.name ||
          user.displayName ||
          "كابتن",

        captainPhone:
          user.phoneNumber ||
          "",

        carModel:
          data.carModel ||
          "سيارة",

        plate:
          data.plate ||
          "",

        rating:
          data.rating ||
          "جديد",

        price,

        createdAt:
          serverTimestamp()

      }
    );


    alert(
      "تم إرسال عرضك للعميل ✅"
    );


    input.value = "";


  } catch (error) {

    console.error(error);

    alert(
      "حصل خطأ أثناء إرسال العرض."
    );

  }

}


/* =====================================================
   CURRENT TRIP
===================================================== */

function listenTrip(
  rideId
) {

  if (
    unsubscribeTrip
  ) {

    unsubscribeTrip();

  }


  unsubscribeTrip =
    onSnapshot(
      doc(
        db,
        "rides",
        rideId
      ),
      snapshot => {

        if (
          !snapshot.exists()
        ) {

          return;

        }


        const ride =
          snapshot.data();


        $("#tripBox").innerHTML = `

          <div class="card">

            <span class="pill">
              ${escapeHtml(
                ride.status ||
                "accepted"
              )}
            </span>


            <h3>
              الرحلة
            </h3>


            <p>
              📍
              ${escapeHtml(
                ride.from
              )}
            </p>


            <p>
              🏁
              ${escapeHtml(
                ride.to
              )}
            </p>


            <p>
              👥
              عدد الركاب:
              <b>
                ${ride.passengers || 1}
              </b>
            </p>


            <p>
              💰 السعر النهائي:
              <b>
                ${money(
                  ride.finalPrice ||
                  ride.price
                )}
              </b>
            </p>


            <p>
              👨‍✈️ الكابتن:
              <b>
                ${escapeHtml(
                  ride.captainName ||
                  "—"
                )}
              </b>
            </p>


            <button
              class="btn primary"
              id="callCaptainBtn"
            >
              📞 اتصال بالكابتن
            </button>


            <button
              class="btn outline"
              id="backHomeBtn"
            >
              العودة للرئيسية
            </button>

          </div>

        `;


        $("#callCaptainBtn").onclick =
          () => {

            if (
              ride.captainPhone
            ) {

              window.location.href =
                `tel:${ride.captainPhone}`;

            } else {

              alert(
                "رقم الكابتن غير متاح."
              );

            }

          };


        $("#backHomeBtn").onclick =
          () => show("home");

      }
    );

}


/* =====================================================
   PROFILE
===================================================== */

async function saveUserProfile() {

  const user =
    auth.currentUser;


  if (!user) {

    show("auth");

    return;

  }


  const name =
    $("#profileNameInput")
      .value
      .trim() ||
    "مستخدم";


  const role =
    $("#profileRole")
      .value;


  const carModel =
    $("#carModel")
      .value
      .trim();


  const plate =
    $("#plate")
      .value
      .trim();


  try {

    await setDoc(
      doc(
        db,
        "users",
        user.uid
      ),
      {

        name,

        role,

        carModel,

        plate,

        phone:
          user.phoneNumber ||
          "",

        rating:
          "جديد",

        updatedAt:
          serverTimestamp()

      },
      {
        merge: true
      }
    );


    await updateProfile(
      user,
      {
        displayName:
          name
      }
    );


    currentRole =
      role;


    $("#profileName")
      .textContent =
      name;


    $("#profilePhone")
      .textContent =
      user.phoneNumber ||
      "";


    alert(
      "تم حفظ البيانات ✅"
    );


  } catch (error) {

    console.error(error);

    alert(
      "حصل خطأ أثناء حفظ البيانات."
    );

  }

}


/* =====================================================
   LOAD USER PROFILE
===================================================== */

async function loadUserProfile(
  user
) {

  const snapshot =
    await getDoc(
      doc(
        db,
        "users",
        user.uid
      )
    );


  if (
    !snapshot.exists()
  ) {

    currentRole =
      "customer";

    return;

  }


  const data =
    snapshot.data();


  currentRole =
    data.role ||
    "customer";


  $("#profileName")
    .textContent =
    data.name ||
    user.displayName ||
    "مستخدم";


  $("#profilePhone")
    .textContent =
    user.phoneNumber ||
    "";


  $("#profileNameInput")
    .value =
    data.name ||
    "";


  $("#profileRole")
    .value =
    currentRole;


  $("#carModel")
    .value =
    data.carModel ||
    "";


  $("#plate")
    .value =
    data.plate ||
    "";

}


/* =====================================================
   NAVIGATION
===================================================== */

document
  .querySelectorAll(
    ".nav button"
  )
  .forEach(button => {

    button.onclick =
      () => {

        show(
          button.dataset.screen
        );

      };

  });


$("#loginBtn").onclick =
  () => show("auth");


$("#myRidesBtn").onclick =
  () => show("offers");


$("#authMini").onclick =
  () => {

    if (
      auth.currentUser
    ) {

      show("profile");

    } else {

      show("auth");

    }

  };


$("#saveProfile").onclick =
  saveUserProfile;


$("#logoutBtn").onclick =
  async () => {

    try {

      await signOut(auth);

      localStorage.removeItem(
        "activeRide"
      );

      alert(
        "تم تسجيل الخروج."
      );

      show("home");

    } catch (error) {

      console.error(error);

    }

  };


/* =====================================================
   AUTH STATE
===================================================== */

onAuthStateChanged(
  auth,
  async user => {

    if (!user) {

      $("#authMini")
        .textContent =
        "👤";

      return;

    }


    $("#authMini")
      .textContent =
      "🟢";


    try {

      await loadUserProfile(
        user
      );

    } catch (error) {

      console.error(error);

    }


    const activeRide =
      localStorage.getItem(
        "activeRide"
      );


    if (activeRide) {

      show("trip");

      listenTrip(
        activeRide
      );

    }

  }
);


/* =====================================================
   START
===================================================== */

initializeMap();

show("home");
