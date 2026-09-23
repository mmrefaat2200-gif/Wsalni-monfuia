import "./style.css";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

import { initializeApp } from "firebase/app";

import {
  getAuth,
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber,
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

import { Geolocation } from "@capacitor/geolocation";

/* ======================================================
   FIREBASE
   ====================================================== */

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

/* ======================================================
   VARIABLES
   ====================================================== */

let confirmationResult = null;
let recaptcha = null;

let map = null;
let routeLayer = null;
let fromMarker = null;
let toMarker = null;

let fromPlace = null;
let toPlace = null;

let currentRole = "customer";

let unsubscribeOffers = null;
let unsubscribeRide = null;
let unsubscribeCaptainRides = null;

/* ======================================================
   HELPERS
   ====================================================== */

const $ = (selector) => document.querySelector(selector);

const money = (value) =>
  `${Number(value || 0).toLocaleString("ar-EG")} جنيه`;

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ======================================================
   APP UI
   ====================================================== */

document.querySelector("#app").innerHTML = `

<header>
  <div class="logo">
    وصلني <span>المنوفية</span>
  </div>

  <div id="authMini">👤</div>
</header>

<section id="home" class="screen">

  <div class="hero">
    <h2>مشوارك يبدأ من هنا 🚕</h2>
    <p>
      اطلب رحلة، حدد السعر، وسيب الكباتن يقدموا عروضهم.
    </p>
  </div>

  <div class="card">

    <div class="map">
      <div id="map"></div>

      <button
        id="locationBtn"
        class="location-button"
        type="button"
      >
        📍 موقعي الحالي
      </button>
    </div>

    <label>📍 مكان الركوب</label>

    <div class="input-with-button">
      <input
        id="from"
        placeholder="اكتب مكان الركوب"
        autocomplete="off"
      />

      <button
        id="fromSearchBtn"
        type="button"
      >
        🔍
      </button>
    </div>

    <div id="fromResults" class="search-results"></div>

    <label>📍 مكان الوصول</label>

    <div class="input-with-button">
      <input
        id="to"
        placeholder="اكتب مكان الوصول"
        autocomplete="off"
      />

      <button
        id="toSearchBtn"
        type="button"
      >
        🔍
      </button>
    </div>

    <div id="toResults" class="search-results"></div>

    <div class="row">

      <div>
        <label>💰 السعر المقترح</label>

        <input
          id="price"
          type="number"
          min="1"
          placeholder="مثال 500"
        />
      </div>

      <div>
        <label>👥 عدد الركاب</label>

        <input
          id="passengers"
          type="number"
          min="1"
          max="20"
          value="1"
        />
      </div>

    </div>

    <label>📝 ملاحظات للسائق</label>

    <input
      id="notes"
      placeholder="مثال: شنطة كبيرة أو طفل أو أي ملاحظة"
    />

    <button
      class="btn primary"
      id="requestBtn"
      type="button"
    >
      🚕 اطلب الرحلة
    </button>

  </div>

  <div class="row">

    <button
      class="btn outline"
      id="myRidesBtn"
      type="button"
    >
      رحلاتي
    </button>

    <button
      class="btn outline"
      id="loginBtn"
      type="button"
    >
      تسجيل / دخول
    </button>

  </div>

</section>


<section id="offers" class="screen hidden">

  <h2>عروض الكباتن</h2>

  <div id="offersList"></div>

</section>


<section id="captain" class="screen hidden">

  <h2>لوحة الكابتن 👨‍✈️</h2>

  <div class="card switch">

    <b>متاح للرحلات</b>

    <input
      id="captainAvailable"
      type="checkbox"
      checked
      style="width:auto"
    />

  </div>

  <div id="captainRides"></div>

</section>


<section id="trip" class="screen hidden">

  <h2>الرحلة الحالية 🚕</h2>

  <div id="tripBox"></div>

</section>


<section id="profile" class="screen hidden">

  <h2>حسابي</h2>

  <div
    class="card"
    style="text-align:center"
  >

    <div class="avatar">👤</div>

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

    <label>الاسم</label>

    <input
      id="profileNameInput"
      placeholder="اكتب اسمك"
    />


    <label>الدور</label>

    <select id="profileRole">

      <option value="customer">
        عميل
      </option>

      <option value="captain">
        كابتن
      </option>

    </select>


    <label>
      نوع السيارة للكابتن
    </label>

    <input
      id="carModel"
      placeholder="مثال: تويوتا كورولا"
    />


    <label>
      رقم اللوحة للكابتن
    </label>

    <input
      id="plate"
      placeholder="مثال: م ن 1234"
    />


    <button
      class="btn primary"
      id="saveProfile"
      type="button"
    >
      حفظ البيانات
    </button>


    <button
      class="btn danger"
      id="logoutBtn"
      type="button"
    >
      تسجيل الخروج
    </button>

  </div>

</section>


<section id="auth" class="screen hidden">

  <h2>تسجيل الدخول</h2>

  <p class="muted">
    سنرسل كود تحقق SMS على رقم هاتفك.
  </p>

  <div class="card">

    <label>رقم الهاتف</label>

    <input
      id="phone"
      placeholder="+2010xxxxxxxx"
      inputmode="tel"
    />

    <div id="recaptcha"></div>

    <button
      class="btn primary"
      id="sendOtp"
      type="button"
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
      />

      <button
        class="btn green"
        id="verifyOtp"
        type="button"
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
    🏠<br>
    الرئيسية
  </button>

  <button
    data-screen="offers"
  >
    🚕<br>
    العروض
  </button>

  <button
    data-screen="captain"
  >
    👨‍✈️<br>
    الكابتن
  </button>

  <button
    data-screen="profile"
  >
    👤<br>
    حسابي
  </button>

</nav>
`;


/* ======================================================
   SCREENS
   ====================================================== */

function show(id) {

  document
    .querySelectorAll("section.screen")
    .forEach(section => {
      section.classList.add("hidden");
    });

  const screen = $("#" + id);

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


document
  .querySelectorAll(".nav button")
  .forEach(button => {

    button.onclick = () => {
      show(button.dataset.screen);
    };

  });


$("#loginBtn").onclick = () => {
  show("auth");
};


$("#myRidesBtn").onclick = () => {
  show("offers");
};


/* ======================================================
   OPENSTREETMAP SEARCH
   ====================================================== */

async function geocode(searchText) {

  const queryText =
    encodeURIComponent(
      `${searchText}, Egypt`
    );

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=ar&q=${queryText}`,
    {
      headers: {
        Accept: "application/json"
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      "تعذر البحث عن المكان"
    );
  }

  return await response.json();
}


/* ======================================================
   SEARCH RESULTS
   ====================================================== */

function renderSearchResults(
  results,
  containerId,
  which
) {

  const container = $(containerId);

  if (!container) return;

  if (!results.length) {

    container.innerHTML =
      `<div class="search-empty">
        المكان غير موجود
      </div>`;

    return;
  }

  container.innerHTML =
    results
      .map((item, index) => {

        return `
          <button
            type="button"
            class="search-result"
            data-index="${index}"
          >
            📍
            ${escapeHtml(item.display_name)}
          </button>
        `;

      })
      .join("");

  container
    .querySelectorAll(".search-result")
    .forEach((button, index) => {

      button.onclick = () => {

        const item = results[index];

        selectPlace(
          item,
          which
        );

        container.innerHTML = "";
      };

    });
}


/* ======================================================
   SELECT PLACE
   ====================================================== */

function selectPlace(
  result,
  which
) {

  const lat = Number(result.lat);
  const lng = Number(result.lon);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return;
  }

  const place = {
    lat,
    lng
  };

  if (which === "from") {

    fromPlace = place;

    $("#from").value =
      result.display_name;

    if (fromMarker) {
      map.removeLayer(fromMarker);
    }

    fromMarker =
      setMarker(
        "from",
        lat,
        lng,
        "مكان الركوب"
      );

  } else {

    toPlace = place;

    $("#to").value =
      result.display_name;

    if (toMarker) {
      map.removeLayer(toMarker);
    }

    toMarker =
      setMarker(
        "to",
        lat,
        lng,
        "مكان الوصول"
      );
  }

  map.setView(
    [lat, lng],
    15
  );

  drawRoute();
}


/* ======================================================
   SEARCH PLACE
   ====================================================== */

async function searchPlace(
  inputId,
  resultsId,
  which
) {

  const input = $(inputId);

  if (!input) return;

  const value =
    input.value.trim();

  if (!value) {

    alert(
      "اكتب اسم المكان الأول."
    );

    return;
  }

  try {

    const results =
      await geocode(value);

    renderSearchResults(
      results,
      resultsId,
      which
    );

  } catch (error) {

    console.error(error);

    alert(
      "حصلت مشكلة أثناء البحث عن المكان."
    );

  }
}


/* ======================================================
   MARKER
   ====================================================== */

function setMarker(
  which,
  lat,
  lng,
  label
) {

  const marker =
    L.marker(
      [lat, lng],
      {
        draggable: true
      }
    )
      .addTo(map)
      .bindPopup(label)
      .openPopup();

  marker.on(
    "dragend",
    async () => {

      const position =
        marker.getLatLng();

      try {

        const response =
          await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${position.lat}&lon=${position.lng}&accept-language=ar`,
            {
              headers: {
                Accept:
                  "application/json"
              }
            }
          );

        const data =
          await response.json();

        const name =
          data.display_name ||
          label;

        if (which === "from") {

          $("#from").value = name;

          fromPlace = {
            lat: position.lat,
            lng: position.lng
          };

        } else {

          $("#to").value = name;

          toPlace = {
            lat: position.lat,
            lng: position.lng
          };
        }

        drawRoute();

      } catch (error) {

        console.error(error);

      }

    }
  );

  return marker;
}


/* ======================================================
   ROUTE
   ====================================================== */

async function drawRoute() {

  if (
    !fromPlace ||
    !toPlace
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
      !data.routes?.length
    ) {

      alert(
        "لم أجد طريقًا بين النقطتين."
      );

      return;
    }

    if (routeLayer) {
      map.removeLayer(routeLayer);
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


/* ======================================================
   INITIALIZE MAP
   ====================================================== */

function initMap() {

  map =
    L.map("map", {
      zoomControl: true
    }).setView(
      [30.5877, 30.5950],
      10
    );

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution:
        "© OpenStreetMap contributors"
    }
  ).addTo(map);

  $("#fromSearchBtn").onclick =
    () => {

      searchPlace(
        "#from",
        "#fromResults",
        "from"
      );

    };

  $("#toSearchBtn").onclick =
    () => {

      searchPlace(
        "#to",
        "#toResults",
        "to"
      );

    };


  $("#from").addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Enter"
      ) {

        event.preventDefault();

        searchPlace(
          "#from",
          "#fromResults",
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

        searchPlace(
          "#to",
          "#toResults",
          "to"
        );

      }

    }
  );

}

initMap();


/* ======================================================
   CURRENT LOCATION
   ====================================================== */

async function getCurrentLocation() {

  const button =
    $("#locationBtn");

  if (button) {

    button.disabled = true;

    button.textContent =
      "⏳ جاري تحديد موقعك...";
  }

  try {

    let permission;

    try {

      permission =
        await Geolocation.checkPermissions();

    } catch (error) {

      console.log(
        "Permission check:",
        error
      );

    }

    if (
      permission &&
      permission.location === "denied"
    ) {

      try {

        permission =
          await Geolocation.requestPermissions();

      } catch (error) {

        console.error(error);

      }

    } else if (
      !permission ||
      permission.location !== "granted"
    ) {

      try {

        permission =
          await Geolocation.requestPermissions();

      } catch (error) {

        console.error(error);

      }

    }

    const position =
      await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000
      });

    const lat =
      position.coords.latitude;

    const lng =
      position.coords.longitude;

    fromPlace = {
      lat,
      lng
    };

    if (fromMarker) {
      map.removeLayer(
        fromMarker
      );
    }

    fromMarker =
      setMarker(
        "from",
        lat,
        lng,
        "موقعك الحالي"
      );

    map.setView(
      [lat, lng],
      16
    );


    try {

      const response =
        await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ar`,
          {
            headers: {
              Accept:
                "application/json"
            }
          }
        );

      const data =
        await response.json();

      $("#from").value =
        data.display_name ||
        "موقعك الحالي";

    } catch (error) {

      $("#from").value =
        "موقعك الحالي";
    }

  } catch (error) {

    console.error(
      "Location error:",
      error
    );

    alert(
      "مش قادر أحدد موقعك.\n\n" +
      "اتأكد إنك سامح للتطبيق باستخدام الموقع من إعدادات الهاتف."
    );

  } finally {

    if (button) {

      button.disabled = false;

      button.textContent =
        "📍 موقعي الحالي";
    }

  }
}


$("#locationBtn").onclick =
  getCurrentLocation;


/* ======================================================
   AUTH CHECK
   ====================================================== */

function requireUser() {

  if (!auth.currentUser) {

    show("auth");

    alert(
      "سجل دخولك الأول علشان تقدر تطلب رحلة."
    );

    return false;
  }

  return true;
}


/* ======================================================
   REQUEST RIDE
   ====================================================== */

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

    if (!price || price <= 0) {

      alert(
        "اكتب السعر المقترح."
      );

      return;
    }

    const passengers =
      Number(
        $("#passengers").value || 1
      );

    if (
      passengers < 1
    ) {

      alert(
        "عدد الركاب لازم يكون واحد على الأقل."
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
              $("#from").value,

            to:
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

            notes:
              $("#notes").value.trim(),

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
        "تم نشر الرحلة للكباتن 🚕"
      );

      show("offers");

    } catch (error) {

      console.error(error);

      alert(
        "حصل خطأ أثناء نشر الرحلة."
      );

    }

  };


/* ======================================================
   CUSTOMER OFFERS
   ====================================================== */

async function loadCustomerOffers() {

  if (!auth.currentUser) {

    $("#offersList").innerHTML =
      `
      <div class="card">
        سجل دخولك أولاً لمتابعة الرحلات.
      </div>
      `;

    return;
  }

  const rideId =
    localStorage.getItem(
      "lastRide"
    );

  if (!rideId) {

    $("#offersList").innerHTML =
      `
      <div class="card muted">
        لا توجد رحلة حالية.
      </div>
      `;

    return;
  }

  if (unsubscribeOffers) {
    unsubscribeOffers();
    unsubscribeOffers = null;
  }

  try {

    const rideRef =
      doc(
        db,
        "rides",
        rideId
      );

    const snap =
      await getDoc(
        rideRef
      );

    if (!snap.exists()) {

      $("#offersList").innerHTML =
        `
        <div class="card">
          الرحلة غير موجودة.
        </div>
        `;

      return;
    }

    const ride =
      snap.data();

    $("#offersList").innerHTML =
      `
      <div class="card">

        <b>
          ${escapeHtml(ride.from)}
          →
          ${escapeHtml(ride.to)}
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
            ? `
              <p class="muted">
                📝 ${escapeHtml(ride.notes)}
              </p>
            `
            : ""
        }

        <span class="pill">
          ${escapeHtml(ride.status)}
        </span>

      </div>

      <div id="offerCards"></div>
      `;


    const offersQuery =
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
      );


    unsubscribeOffers =
      onSnapshot(
        offersQuery,
        snapshot => {

          const cards =
            snapshot.docs.map(
              item => ({
                id: item.id,
                ...item.data()
              })
            );

          const container =
            $("#offerCards");

          if (!container) {
            return;
          }

          if (!cards.length) {

            container.innerHTML =
              `
              <div class="card muted">
                في انتظار عروض الكباتن...
              </div>
              `;

            return;
          }

          container.innerHTML =
            cards.map(
              offer => `
                <div class="card offer">

                  <div>
                    <b>
                      ${escapeHtml(
                        offer.captainName ||
                        "كابتن"
                      )}
                    </b>

                    <div class="muted">
                      ⭐
                      ${escapeHtml(
                        offer.rating ||
                        "جديد"
                      )}

                      •
                      ${escapeHtml(
                        offer.carModel ||
                        "سيارة"
                      )}

                      ${
                        offer.plate
                          ? `• ${escapeHtml(
                              offer.plate
                            )}`
                          : ""
                      }
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
              `
            ).join("");


          container
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

        },
        error => {

          console.error(
            "Offers listener:",
            error
          );

        }
      );

  } catch (error) {

    console.error(error);

    $("#offersList").innerHTML =
      `
      <div class="card">
        حصل خطأ في تحميل العروض.
      </div>
      `;

  }

}


/* ======================================================
   ACCEPT OFFER
   ====================================================== */

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

    if (!offerSnapshot.exists()) {

      alert(
        "العرض لم يعد موجودًا."
      );

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

        captainPhone:
          offer.captainPhone || "",

        carModel:
          offer.carModel || "",

        plate:
          offer.plate || "",

        finalPrice:
          offer.price,

        acceptedAt:
          serverTimestamp()

      }
    );

    localStorage.setItem(
      "activeRide",
      rideId
    );

    alert(
      "تم قبول عرض الكابتن 🚕"
    );

    show("trip");

    listenTrip(rideId);

  } catch (error) {

    console.error(error);

    alert(
      "حصل خطأ أثناء قبول العرض."
    );

  }

}


/* ======================================================
   CAPTAIN RIDES
   ====================================================== */

function loadCaptainRides() {

  if (!auth.currentUser) {

    $("#captainRides").innerHTML =
      `
      <div class="card">
        سجل دخولك أولاً.
      </div>
      `;

    return;
  }

  if (
    currentRole !== "captain"
  ) {

    $("#captainRides").innerHTML =
      `
      <div class="card">
        غيّر الدور إلى «كابتن»
        من حسابي.
      </div>
      `;

    return;
  }

  if (unsubscribeCaptainRides) {

    unsubscribeCaptainRides();

    unsubscribeCaptainRides =
      null;
  }


  /*
    هنا لا نستخدم orderBy مع where
    علشان نتجنب مشكلة Firestore Index.
  */

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
      limit(30)
    );


  unsubscribeCaptainRides =
    onSnapshot(
      ridesQuery,
      snapshot => {

        const rides =
          snapshot.docs
            .map(
              item => ({
                id: item.id,
                ...item.data()
              })
            )
            .sort(
              (a, b) => {

                const aTime =
                  a.createdAt?.toMillis?.() ||
                  0;

                const bTime =
                  b.createdAt?.toMillis?.() ||
                  0;

                return bTime - aTime;
              }
            );


        if (!rides.length) {

          $("#captainRides").innerHTML =
            `
            <div class="card muted">
              لا توجد رحلات مفتوحة الآن.
            </div>
            `;

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

                  →

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
                    ? `
                      <p class="muted">
                        📝
                        ${escapeHtml(
                          ride.notes
                        )}
                      </p>
                    `
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
                    type="button"
                  >
                    إرسال العرض
                  </button>

                </div>

              </div>
            `
          ).join("");


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

        console.error(
          "Captain rides:",
          error
        );

        $("#captainRides").innerHTML =
          `
          <div class="card">
            حصل خطأ في تحميل الرحلات.
          </div>
          `;

      }
    );
}


/* ======================================================
   SEND CAPTAIN OFFER
   ====================================================== */

async function sendOffer(
  rideId
) {

  if (!auth.currentUser) {

    show("auth");

    return;
  }

  const input =
    $(
      "#offer-" +
      rideId
    );

  const price =
    Number(
      input?.value
    );

  if (!price || price <= 0) {

    alert(
      "اكتب سعرك الأول."
    );

    return;
  }

  try {

    const user =
      auth.currentUser;

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


/* ======================================================
   CURRENT TRIP
   ====================================================== */

function listenTrip(
  rideId
) {

  if (unsubscribeRide) {

    unsubscribeRide();

    unsubscribeRide =
      null;
  }


  unsubscribeRide =
    onSnapshot(
      doc(
        db,
        "rides",
        rideId
      ),
      snapshot => {

        if (!snapshot.exists()) {

          $("#tripBox").innerHTML =
            `
            <div class="card">
              الرحلة غير موجودة.
            </div>
            `;

          return;
        }

        const ride =
          snapshot.data();


        const phone =
          ride.captainPhone ||
          "";


        $("#tripBox").innerHTML =
          `
          <div class="card">

            <span class="pill">
              ${escapeHtml(
                ride.status
              )}
            </span>


            <h3>
              ${escapeHtml(
                ride.from
              )}

              →

              ${escapeHtml(
                ride.to
              )}
            </h3>


            <p>
              السعر النهائي:
              <b>
                ${money(
                  ride.finalPrice ||
                  ride.price
                )}
              </b>
            </p>


            <p>
              عدد الركاب:
              <b>
                ${ride.passengers || 1}
              </b>
            </p>


            <p>
              الكابتن:
              <b>
                ${escapeHtml(
                  ride.captainName ||
                  "—"
                )}
              </b>
            </p>


            ${
              ride.carModel
                ? `
                  <p>
                    السيارة:
                    <b>
                      ${escapeHtml(
                        ride.carModel
                      )}
                    </b>
                  </p>
                `
                : ""
            }


            ${
              ride.plate
                ? `
                  <p>
                    اللوحة:
                    <b>
                      ${escapeHtml(
                        ride.plate
                      )}
                    </b>
                  </p>
                `
                : ""
            }


            ${
              phone
                ? `
                  <a
                    class="btn primary"
                    href="tel:${phone}"
                  >
                    📞 اتصال بالكابتن
                  </a>
                `
                : ""
            }


            <button
              class="btn outline"
              id="backHomeBtn"
              type="button"
            >
              العودة للرئيسية
            </button>

          </div>
          `;


        const backButton =
          $("#backHomeBtn");

        if (backButton) {

          backButton.onclick =
            () => show("home");

        }

      },
      error => {

        console.error(
          "Trip listener:",
          error
        );

      }
    );
}


/* ======================================================
   PROFILE
   ====================================================== */

async function saveUserProfile() {

  if (!auth.currentUser) {

    show("auth");

    return;
  }

  const user =
    auth.currentUser;


  const name =
    $("#profileNameInput")
      .value
      .trim() ||
    "مستخدم";


  const role =
    $("#profileRole").value;


  const carModel =
    $("#carModel")
      .value
      .trim();


  const plate =
    $("#plate")
      .value
      .trim();


  try {

    const data = {

      name,

      role,

      carModel,

      plate,

      rating:
        "جديد",

      updatedAt:
        serverTimestamp()

    };


    await setDoc(
      doc(
        db,
        "users",
        user.uid
      ),
      data,
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
      "تم حفظ البيانات بنجاح ✅"
    );


  } catch (error) {

    console.error(error);

    alert(
      "حصل خطأ أثناء حفظ البيانات."
    );

  }

}


$("#saveProfile").onclick =
  saveUserProfile;


/* ======================================================
   PHONE AUTH
   ====================================================== */

$("#sendOtp").onclick =
  async () => {

    const phone =
      $("#phone")
        .value
        .trim();


    if (!phone) {

      alert(
        "اكتب رقم الهاتف."
      );

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
        `
        <div class="notice">
          تم إرسال كود التحقق على الهاتف.
        </div>
        `;

    } catch (error) {

      console.error(error);

      $("#authMsg").innerHTML =
        `
        <div class="notice error">
          ${escapeHtml(
            error.message ||
            "حصل خطأ أثناء إرسال الكود."
          )}
        </div>
        `;

    }

  };


/* ======================================================
   VERIFY OTP
   ====================================================== */

$("#verifyOtp").onclick =
  async () => {

    if (!confirmationResult) {

      alert(
        "اطلب كود التحقق الأول."
      );

      return;
    }


    const otp =
      $("#otp")
        .value
        .trim();


    if (!otp) {

      alert(
        "اكتب كود التحقق."
      );

      return;
    }


    try {

      await confirmationResult.confirm(
        otp
      );


      $("#authMsg").innerHTML =
        `
        <div class="notice">
          تم تسجيل الدخول بنجاح ✅
        </div>
        `;


      show("home");

    } catch (error) {

      console.error(error);

      $("#authMsg").innerHTML =
        `
        <div class="notice error">
          كود التحقق غير صحيح.
        </div>
        `;

    }

  };


/* ======================================================
   LOGOUT
   ====================================================== */

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


/* ======================================================
   AUTH STATE
   ====================================================== */

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

      const profile =
        await getDoc(
          doc(
            db,
            "users",
            user.uid
          )
        );


      if (profile.exists()) {

        const data =
          profile.data();


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

      } else {

        currentRole =
          "customer";

        $("#profilePhone")
          .textContent =
          user.phoneNumber ||
          "";

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

    } catch (error) {

      console.error(
        "Auth state error:",
        error
      );

    }

  }
);
