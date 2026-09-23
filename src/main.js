import "./style.css";

import { initializeApp } from "firebase/app";

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
  Geolocation
} from "@capacitor/geolocation";

/* =========================
   FIREBASE
========================= */

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(cfg);
const auth = getAuth(app);
const db = getFirestore(app);

/* =========================
   VARIABLES
========================= */

let confirmationResult = null;
let recaptcha = null;

let map = null;
let selectionMap = null;

let routeLayer = null;
let fromMarker = null;
let toMarker = null;

let fromPlace = null;
let toPlace = null;

let currentRole = "customer";

let unsubscribeOffers = null;
let unsubscribeRide = null;
let unsubscribeCaptain = null;

let selectingDestination = false;
let destinationSearchTimer = null;

/* =========================
   HELPERS
========================= */

const $ = (selector) => document.querySelector(selector);

const money = (n) =>
  `${Number(n || 0).toLocaleString("ar-EG")} جنيه`;

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   HTML
========================= */

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
      حدد مكان الالتقاء ومكان الوصول وسيب الكباتن يقدموا عروضهم.
    </p>
  </div>

  <div class="card">

    <label>📍 مكان الالتقاء</label>

    <div class="location-box">
      <input
        id="from"
        placeholder="اضغط تحديد موقعي الحالي"
        readonly
      />

      <button
        class="btn primary"
        id="locateBtn"
        type="button"
      >
        📍 تحديد موقعي
      </button>
    </div>

    <div id="fromStatus" class="muted"></div>


    <label>📍 مكان الوصول</label>

    <div class="location-box">
      <input
        id="to"
        placeholder="حدد مكان النزول من الخريطة"
        readonly
      />

      <button
        class="btn outline"
        id="destinationBtn"
        type="button"
      >
        🗺️ تحديد النزول
      </button>
    </div>

    <div id="toStatus" class="muted"></div>


    <div
      id="routeInfo"
      class="card"
      style="display:none;margin-top:15px"
    >
      <b>🚕 تفاصيل الرحلة</b>
      <div id="distanceText"></div>
      <div id="durationText"></div>
    </div>


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
          max="7"
          value="1"
        />
      </div>

    </div>


    <label>📝 ملاحظات للسائق</label>

    <input
      id="notes"
      placeholder="مثال: شنطة كبيرة أو طفل..."
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


<!-- =========================
     DESTINATION MAP
========================= -->

<section id="destinationMap" class="screen hidden">

  <div class="card">

    <h2>📍 حدد مكان النزول</h2>

    <div class="destination-search">

      <input
        id="destinationSearch"
        type="text"
        placeholder="اكتب اسم البلد أو الشارع..."
      />

      <button
        class="btn primary"
        id="destinationSearchBtn"
        type="button"
      >
        🔎 بحث
      </button>

    </div>


    <div
      id="destinationResults"
      class="search-results"
    ></div>


    <div
      id="selectionMap"
      style="
        width:100%;
        height:55vh;
        min-height:350px;
        border-radius:15px;
        overflow:hidden;
        margin-top:12px;
      "
    ></div>


    <div
      class="card"
      style="margin-top:12px"
    >
      <b>📍 النقطة المحددة</b>
      <div
        id="selectedDestinationText"
        class="muted"
      >
        حرك الخريطة وحدد النقطة المطلوبة
      </div>
    </div>


    <button
      class="btn green"
      id="confirmDestinationBtn"
      type="button"
      style="margin-top:10px"
    >
      ✅ تأكيد مكان النزول
    </button>


    <button
      class="btn outline"
      id="cancelDestinationBtn"
      type="button"
      style="margin-top:8px"
    >
      رجوع
    </button>

  </div>

</section>


<!-- =========================
     OFFERS
========================= -->

<section id="offers" class="screen hidden">

  <h2>عروض الكباتن</h2>

  <div id="offersList"></div>

</section>


<!-- =========================
     CAPTAIN
========================= -->

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


<!-- =========================
     TRIP
========================= -->

<section id="trip" class="screen hidden">

  <h2>الرحلة الحالية 🚕</h2>

  <div id="tripBox"></div>

</section>


<!-- =========================
     PROFILE
========================= -->

<section id="profile" class="screen hidden">

  <h2>حسابي</h2>

  <div
    class="card"
    style="text-align:center"
  >

    <div class="avatar">👤</div>

    <h3 id="profileName">زائر</h3>

    <div
      id="profilePhone"
      class="muted"
    >
      غير مسجل
    </div>

  </div>


  <div class="card">

    <label>الاسم</label>

    <input id="profileNameInput">


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
      placeholder="تويوتا كورولا"
    >


    <label>
      رقم اللوحة للكابتن
    </label>

    <input
      id="plate"
      placeholder="مثال: م ن 1234"
    >


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


<!-- =========================
     AUTH
========================= -->

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
    >


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

      <label>كود التحقق</label>

      <input
        id="otp"
        inputmode="numeric"
      >

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


<!-- =========================
     NAV
========================= -->

<nav class="nav">

  <button
    class="active"
    data-screen="home"
  >
    🏠<br>الرئيسية
  </button>

  <button
    data-screen="offers"
  >
    🚕<br>العروض
  </button>

  <button
    data-screen="captain"
  >
    👨‍✈️<br>الكابتن
  </button>

  <button
    data-screen="profile"
  >
    👤<br>حسابي
  </button>

</nav>
`;


/* =========================
   SCREEN NAVIGATION
========================= */

function show(id) {

  document
    .querySelectorAll("section.screen")
    .forEach((x) => x.classList.add("hidden"));

  const target = $("#" + id);

  if (target) {
    target.classList.remove("hidden");
  }

  document
    .querySelectorAll(".nav button")
    .forEach((b) => {
      b.classList.toggle(
        "active",
        b.dataset.screen === id
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

  if (id === "destinationMap") {

    setTimeout(() => {

      if (selectionMap) {
        selectionMap.invalidateSize();
      }

    }, 300);

  }

}


document
  .querySelectorAll(".nav button")
  .forEach((b) => {

    b.onclick = () => {
      show(b.dataset.screen);
    };

  });


$("#loginBtn").onclick = () => show("auth");

$("#myRidesBtn").onclick = () => show("offers");


/* =========================
   REVERSE GEOCODING
========================= */

async function reverseGeocode(lat, lng) {

  const url =
    `https://nominatim.openstreetmap.org/reverse` +
    `?format=jsonv2` +
    `&lat=${encodeURIComponent(lat)}` +
    `&lon=${encodeURIComponent(lng)}` +
    `&zoom=18` +
    `&addressdetails=1` +
    `&accept-language=ar`;

  const res = await fetch(url, {
    headers: {
      "Accept": "application/json"
    }
  });

  if (!res.ok) {
    throw new Error("فشل تحديد عنوان المكان");
  }

  return await res.json();
}


/* =========================
   SEARCH PLACES
========================= */

async function searchPlaces(text) {

  const q = encodeURIComponent(
    `${text}, Egypt`
  );

  const url =
    `https://nominatim.openstreetmap.org/search` +
    `?format=jsonv2` +
    `&q=${q}` +
    `&limit=8` +
    `&countrycodes=eg` +
    `&addressdetails=1` +
    `&accept-language=ar`;

  const res = await fetch(url, {
    headers: {
      "Accept": "application/json"
    }
  });

  if (!res.ok) {
    throw new Error("تعذر البحث");
  }

  return await res.json();
}


/* =========================
   CURRENT LOCATION
========================= */

async function getCurrentLocation() {

  $("#fromStatus").textContent =
    "⏳ جاري تحديد موقعك الحالي...";

  try {

    let permission;

    try {

      permission =
        await Geolocation.checkPermissions();

    } catch (e) {
      permission = null;
    }


    if (
      permission &&
      permission.location !== "granted"
    ) {

      const requested =
        await Geolocation.requestPermissions();

      if (
        requested.location !== "granted"
      ) {

        throw new Error(
          "لم يتم السماح للتطبيق باستخدام الموقع."
        );

      }

    }


    let position;

    try {

      position =
        await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0
        });

    } catch (nativeError) {

      position =
        await getBrowserLocation();

    }


    const lat =
      Number(position.coords.latitude);

    const lng =
      Number(position.coords.longitude);


    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {

      throw new Error(
        "إحداثيات الموقع غير صحيحة."
      );

    }


    fromPlace = {
      lat,
      lng
    };


    if (fromMarker && map) {
      map.removeLayer(fromMarker);
    }


    if (map) {

      fromMarker =
        L.marker([lat, lng])
          .addTo(map)
          .bindPopup("📍 موقعك الحالي")
          .openPopup();

      map.setView(
        [lat, lng],
        16
      );

    }


    $("#fromStatus").textContent =
      "⏳ جاري معرفة عنوان موقعك...";


    try {

      const data =
        await reverseGeocode(lat, lng);

      const address =
        data.display_name ||
        "موقعك الحالي";

      $("#from").value = address;

      $("#fromStatus").textContent =
        `📍 دقة GPS تقريبًا: ${
          Math.round(
            Number(position.coords.accuracy || 0)
          )
        } متر`;

    } catch (e) {

      $("#from").value =
        `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

      $("#fromStatus").textContent =
        "📍 تم تحديد موقعك الحالي";

    }


    await drawRoute();


  } catch (error) {

    console.error(error);

    $("#fromStatus").innerHTML =
      `<span style="color:red">
        ❌ ${escapeHtml(
          error.message ||
          "تعذر تحديد موقعك"
        )}
      </span>`;

    alert(
      "مش قادر أحدد موقعك.\n\n" +
      "اتأكد إنك وافقت على إذن الموقع من نافذة Android."
    );

  }

}


/* =========================
   BROWSER LOCATION FALLBACK
========================= */

function getBrowserLocation() {

  return new Promise(
    (resolve, reject) => {

      if (!navigator.geolocation) {

        reject(
          new Error(
            "الجهاز لا يدعم تحديد الموقع."
          )
        );

        return;
      }


      navigator.geolocation.getCurrentPosition(
        resolve,
        reject,
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0
        }
      );

    }
  );

}


/* =========================
   MAIN MAP
========================= */

function initMainMap() {

  if (!window.L) {

    console.error(
      "Leaflet غير موجود."
    );

    return;

  }


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

}


/* =========================
   DESTINATION MAP
========================= */

function openDestinationMap() {

  selectingDestination = true;

  show("destinationMap");


  setTimeout(() => {

    if (!selectionMap) {

      selectionMap =
        L.map("selectionMap", {
          zoomControl: true
        }).setView(
          toPlace
            ? [toPlace.lat, toPlace.lng]
            : [30.5877, 30.5950],
          toPlace ? 16 : 10
        );


      L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 19,
          attribution:
            "© OpenStreetMap contributors"
        }
      ).addTo(selectionMap);


      selectionMap.on(
        "moveend",
        destinationMapMoved
      );

    }


    selectionMap.invalidateSize();


    if (toPlace) {

      selectionMap.setView(
        [toPlace.lat, toPlace.lng],
        16
      );

    }


    updateSelectedDestination();


  }, 350);

}


/* =========================
   DESTINATION MAP CENTER
========================= */

function getSelectionCenter() {

  if (!selectionMap) {
    return null;
  }

  const center =
    selectionMap.getCenter();

  return {
    lat: center.lat,
    lng: center.lng
  };

}


/* =========================
   DESTINATION MOVED
========================= */

async function destinationMapMoved() {

  if (!selectingDestination) {
    return;
  }

  const center =
    getSelectionCenter();

  if (!center) {
    return;
  }


  toPlace = {
    lat: center.lat,
    lng: center.lng
  };


  updateSelectedDestination();


  clearTimeout(
    destinationSearchTimer
  );


  destinationSearchTimer =
    setTimeout(
      async () => {

        try {

          const data =
            await reverseGeocode(
              center.lat,
              center.lng
            );


          const address =
            data.display_name ||
            `${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`;


          $("#selectedDestinationText").textContent =
            address;


        } catch (e) {

          $("#selectedDestinationText").textContent =
            `${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`;

        }

      },
      700
    );

}


/* =========================
   UPDATE DESTINATION TEXT
========================= */

function updateSelectedDestination() {

  if (!toPlace) {
    return;
  }


  $("#selectedDestinationText").textContent =
    `📍 ${toPlace.lat.toFixed(6)}, ${toPlace.lng.toFixed(6)}`;

}


/* =========================
   SEARCH DESTINATION
========================= */

async function searchDestination() {

  const input =
    $("#destinationSearch");

  const resultsBox =
    $("#destinationResults");

  const text =
    input.value.trim();


  if (!text) {

    resultsBox.innerHTML =
      `<div class="card muted">
        اكتب اسم البلد أو الشارع أولًا.
      </div>`;

    return;

  }


  resultsBox.innerHTML =
    `<div class="card muted">
      ⏳ جاري البحث...
    </div>`;


  try {

    const results =
      await searchPlaces(text);


    if (!results.length) {

      resultsBox.innerHTML =
        `<div class="card">
          ❌ ملقتش المكان.
          جرب تكتب اسم أوضح للشارع أو البلد.
        </div>`;

      return;

    }


    resultsBox.innerHTML =
      results.map(
        (item, index) => `

          <button
            type="button"
            class="card search-result"
            data-result-index="${index}"
            style="
              width:100%;
              text-align:right;
              border:0;
              margin-bottom:8px;
              cursor:pointer;
            "
          >

            <b>
              📍 ${escapeHtml(item.display_name)}
            </b>

          </button>

        `
      ).join("");


    document
      .querySelectorAll(
        "[data-result-index]"
      )
      .forEach((button) => {

        button.onclick = () => {

          const index =
            Number(
              button.dataset.resultIndex
            );

          const item =
            results[index];

          selectSearchResult(item);

        };

      });


  } catch (error) {

    console.error(error);

    resultsBox.innerHTML =
      `<div class="card">
        ❌ حصلت مشكلة أثناء البحث.
      </div>`;

  }

}


/* =========================
   SELECT SEARCH RESULT
========================= */

async function selectSearchResult(item) {

  const lat =
    Number(item.lat);

  const lng =
    Number(item.lon);


  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {

    return;

  }


  toPlace = {
    lat,
    lng
  };


  if (selectionMap) {

    selectionMap.setView(
      [lat, lng],
      17,
      {
        animate: true
      }
    );

  }


  $("#destinationResults").innerHTML =
    `<div class="card">
      📍 تم تحديد:
      <b>${escapeHtml(item.display_name)}</b>
      <br>
      حرّك الخريطة لو عايز تحدد الشارع أو النقطة بالظبط.
    </div>`;


  $("#selectedDestinationText").textContent =
    item.display_name;

}


/* =========================
   CONFIRM DESTINATION
========================= */

async function confirmDestination() {

  if (!selectionMap) {

    alert(
      "افتح الخريطة وحدد مكان النزول."
    );

    return;

  }


  const center =
    getSelectionCenter();


  if (!center) {

    alert(
      "حدد مكان النزول أولًا."
    );

    return;

  }


  toPlace = {
    lat: center.lat,
    lng: center.lng
  };


  $("#to").value =
    "⏳ جاري تحديد العنوان...";


  try {

    const data =
      await reverseGeocode(
        center.lat,
        center.lng
      );


    $("#to").value =
      data.display_name ||
      `${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`;

  } catch (e) {

    $("#to").value =
      `${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`;

  }


  selectingDestination = false;

  $("#toStatus").textContent =
    "✅ تم تحديد مكان النزول";


  show("home");


  setTimeout(() => {

    if (map) {

      map.invalidateSize();

      map.setView(
        [center.lat, center.lng],
        14
      );

    }

  }, 250);


  await drawRoute();

}


/* =========================
   ROUTE
========================= */

async function drawRoute() {

  if (
    !fromPlace ||
    !toPlace
  ) {

    $("#routeInfo").style.display =
      "none";

    return;

  }


  try {

    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${fromPlace.lng},${fromPlace.lat};` +
      `${toPlace.lng},${toPlace.lat}` +
      `?overview=full&geometries=geojson`;


    const res =
      await fetch(url);


    if (!res.ok) {
      throw new Error(
        "فشل حساب الطريق"
      );
    }


    const data =
      await res.json();


    if (
      data.code !== "Ok" ||
      !data.routes ||
      !data.routes.length
    ) {

      throw new Error(
        "لم يتم العثور على طريق"
      );

    }


    const route =
      data.routes[0];


    if (routeLayer && map) {
      map.removeLayer(routeLayer);
    }


    routeLayer =
      L.geoJSON(
        route.geometry,
        {
          style: {
            weight: 6
          }
        }
      );


    if (map) {

      routeLayer.addTo(map);

      map.fitBounds(
        routeLayer.getBounds(),
        {
          padding: [30, 30]
        }
      );

    }


    const distanceKm =
      route.distance / 1000;


    const durationMin =
      Math.max(
        1,
        Math.round(
          route.duration / 60
        )
      );


    $("#routeInfo").style.display =
      "block";


    $("#distanceText").innerHTML =
      `📏 المسافة: <b>${distanceKm.toFixed(1)} كم</b>`;


    $("#durationText").innerHTML =
      `⏱️ الوقت التقريبي: <b>${durationMin} دقيقة</b>`;


  } catch (error) {

    console.error(error);

    $("#routeInfo").style.display =
      "block";


    $("#distanceText").innerHTML =
      "📏 تم تحديد النقطتين";


    $("#durationText").innerHTML =
      "⏱️ سيتم حساب وقت الرحلة لاحقًا";

  }

}


/* =========================
   BUTTONS
========================= */

$("#locateBtn").onclick =
  getCurrentLocation;


$("#destinationBtn").onclick =
  openDestinationMap;


$("#destinationSearchBtn").onclick =
  searchDestination;


$("#destinationSearch").addEventListener(
  "keydown",
  (event) => {

    if (event.key === "Enter") {

      event.preventDefault();

      searchDestination();

    }

  }
);


$("#confirmDestinationBtn").onclick =
  confirmDestination;


$("#cancelDestinationBtn").onclick =
  () => {

    selectingDestination = false;

    show("home");

  };


/* =========================
   MAIN MAP INIT
========================= */

initMainMap();


/* =========================
   REQUIRE USER
========================= */

function requireUser() {

  if (!auth.currentUser) {

    show("auth");

    return false;

  }

  return true;

}


/* =========================
   REQUEST RIDE
========================= */

$("#requestBtn").onclick =
  async () => {

    try {

      if (!requireUser()) {
        return;
      }


      if (!fromPlace) {

        alert(
          "حدد مكان الالتقاء الأول."
        );

        return;

      }


      if (!toPlace) {

        alert(
          "حدد مكان النزول."
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
        passengers < 1 ||
        passengers > 7
      ) {

        alert(
          "عدد الركاب لازم يكون من 1 إلى 7."
        );

        return;

      }


      const u =
        auth.currentUser;


      const profileSnap =
        await getDoc(
          doc(db, "users", u.uid)
        );


      const profile =
        profileSnap.exists()
          ? profileSnap.data()
          : {};


      const ride =
        await addDoc(
          collection(db, "rides"),
          {

            customerId: u.uid,

            customerName:
              profile.name ||
              u.displayName ||
              "عميل",

            customerPhone:
              u.phoneNumber || "",


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


            status: "open",

            createdAt:
              serverTimestamp()

          }
        );


      localStorage.setItem(
        "lastRide",
        ride.id
      );


      show("offers");


    } catch (error) {

      console.error(error);

      alert(
        "حصل خطأ أثناء إرسال الرحلة.\n" +
        (error.message || "")
      );

    }

  };


/* =========================
   CUSTOMER OFFERS
========================= */

async function loadCustomerOffers() {

  if (!auth.currentUser) {

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


  if (unsubscribeOffers) {
    unsubscribeOffers();
  }


  const rideRef =
    doc(
      db,
      "rides",
      rideId
    );


  const snap =
    await getDoc(rideRef);


  if (!snap.exists()) {

    $("#offersList").innerHTML =
      `<div class="card">
        الرحلة غير موجودة.
      </div>`;

    return;

  }


  const ride =
    snap.data();


  $("#offersList").innerHTML = `

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
        ${ride.passengers} راكب
      </p>

      <span class="pill">
        ${escapeHtml(ride.status)}
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
      (ss) => {

        const cards =
          ss.docs.map(
            (d) => ({
              id: d.id,
              ...d.data()
            })
          );


        $("#offerCards").innerHTML =
          cards.length

            ? cards.map(
                (o) => `

                  <div class="card offer">

                    <div>

                      <b>
                        ${escapeHtml(
                          o.captainName ||
                          "كابتن"
                        )}
                      </b>

                      <div class="muted">
                        ⭐ ${escapeHtml(
                          o.rating ||
                          "جديد"
                        )}

                        •
                        ${escapeHtml(
                          o.carModel ||
                          "سيارة"
                        )}
                      </div>

                    </div>

                    <div class="price">
                      ${money(o.price)}
                    </div>

                  </div>


                  <button
                    class="btn green"
                    data-accept="${o.id}"
                    data-ride="${rideId}"
                  >
                    قبول العرض
                  </button>

                `
              ).join("")

            : `
              <div class="card muted">
                في انتظار عروض الكباتن...
              </div>
            `;


        document
          .querySelectorAll(
            "[data-accept]"
          )
          .forEach((button) => {

            button.onclick =
              () =>
                acceptOffer(
                  button.dataset.ride,
                  button.dataset.accept
                );

          });

      }
    );

}


/* =========================
   ACCEPT OFFER
========================= */

async function acceptOffer(
  rideId,
  offerId
) {

  const offerSnap =
    await getDoc(
      doc(
        db,
        "rides",
        rideId,
        "offers",
        offerId
      )
    );


  if (!offerSnap.exists()) {
    return;
  }


  const offer =
    offerSnap.data();


  await updateDoc(
    doc(
      db,
      "rides",
      rideId
    ),
    {

      status: "accepted",

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

  listenTrip(rideId);

}


/* =========================
   CAPTAIN RIDES
========================= */

function loadCaptainRides() {

  if (!auth.currentUser) {

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
        غيّر الدور إلى «كابتن» من حسابي.
      </div>`;

    return;

  }


  if (unsubscribeCaptain) {
    unsubscribeCaptain();
  }


  const q =
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
      orderBy(
        "createdAt",
        "desc"
      ),
      limit(20)
    );


  unsubscribeCaptain =
    onSnapshot(
      q,
      (ss) => {

        $("#captainRides").innerHTML =
          ss.docs.length

            ? ss.docs.map(
                (d) => {

                  const r =
                    d.data();

                  return `

                    <div class="card">

                      <b>
                        ${escapeHtml(r.from)}
                        →
                        ${escapeHtml(r.to)}
                      </b>

                      <p class="muted">
                        ${r.passengers}
                        راكب
                        •
                        السعر المقترح:
                        ${money(r.price)}
                      </p>

                      ${
                        r.notes
                          ? `
                            <p class="muted">
                              📝
                              ${escapeHtml(r.notes)}
                            </p>
                          `
                          : ""
                      }

                      <div class="row">

                        <input
                          id="offer-${d.id}"
                          type="number"
                          placeholder="سعرك"
                        >

                        <button
                          class="btn green"
                          data-offer="${d.id}"
                        >
                          إرسال العرض
                        </button>

                      </div>

                    </div>

                  `;

                }
              ).join("")

            : `
              <div class="card muted">
                لا توجد رحلات مفتوحة الآن.
              </div>
            `;


        document
          .querySelectorAll(
            "[data-offer]"
          )
          .forEach((button) => {

            button.onclick =
              () =>
                sendOffer(
                  button.dataset.offer
                );

          });

      }
    );

}


/* =========================
   SEND CAPTAIN OFFER
========================= */

async function sendOffer(
  rideId
) {

  const input =
    $("#offer-" + rideId);


  const price =
    Number(input.value);


  if (!price || price <= 0) {

    alert(
      "اكتب سعرك."
    );

    return;

  }


  const u =
    auth.currentUser;


  const profileSnap =
    await getDoc(
      doc(
        db,
        "users",
        u.uid
      )
    );


  const d =
    profileSnap.exists()
      ? profileSnap.data()
      : {};


  await setDoc(
    doc(
      db,
      "rides",
      rideId,
      "offers",
      u.uid
    ),
    {

      captainId:
        u.uid,

      captainName:
        d.name ||
        u.displayName ||
        "كابتن",

      captainPhone:
        u.phoneNumber ||
        "",

      carModel:
        d.carModel ||
        "سيارة",

      plate:
        d.plate ||
        "",

      rating:
        d.rating ||
        "جديد",

      price,

      createdAt:
        serverTimestamp()

    }
  );


  alert(
    "تم إرسال عرضك للعميل."
  );

}


/* =========================
   CURRENT TRIP
========================= */

function listenTrip(id) {

  if (unsubscribeRide) {
    unsubscribeRide();
  }


  unsubscribeRide =
    onSnapshot(
      doc(
        db,
        "rides",
        id
      ),
      (s) => {

        if (!s.exists()) {
          return;
        }


        const r =
          s.data();


        $("#tripBox").innerHTML = `

          <div class="card">

            <span class="pill">
              ${escapeHtml(
                r.status
              )}
            </span>

            <h3>
              ${escapeHtml(r.from)}
              →
              ${escapeHtml(r.to)}
            </h3>

            <p>
              السعر النهائي:
              <b>
                ${money(
                  r.finalPrice ||
                  r.price
                )}
              </b>
            </p>

            <p>
              الكابتن:
              <b>
                ${escapeHtml(
                  r.captainName ||
                  "—"
                )}
              </b>
            </p>

            <button
              class="btn primary"
              id="callCaptainBtn"
              type="button"
            >
              📞 اتصال بالكابتن
            </button>

            <button
              class="btn outline"
              id="backHomeBtn"
              type="button"
            >
              العودة للرئيسية
            </button>

          </div>

        `;


        $("#callCaptainBtn").onclick =
          () => {

            if (r.captainPhone) {

              window.location.href =
                `tel:${r.captainPhone}`;

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


/* =========================
   PROFILE
========================= */

async function saveUserProfile() {

  if (!auth.currentUser) {
    return;
  }


  const u =
    auth.currentUser;


  const data = {

    name:
      $("#profileNameInput")
        .value
        .trim() ||
      "مستخدم",

    role:
      $("#profileRole")
        .value,

    carModel:
      $("#carModel")
        .value
        .trim(),

    plate:
      $("#plate")
        .value
        .trim(),

    rating:
      "جديد",

    updatedAt:
      serverTimestamp()

  };


  await setDoc(
    doc(
      db,
      "users",
      u.uid
    ),
    data,
    {
      merge: true
    }
  );


  await updateProfile(
    u,
    {
      displayName:
        data.name
    }
  );


  currentRole =
    data.role;


  $("#profileName")
    .textContent =
    data.name;


  $("#profilePhone")
    .textContent =
    u.phoneNumber || "";


  alert(
    "تم حفظ البيانات."
  );

}


$("#saveProfile").onclick =
  saveUserProfile;


/* =========================
   PHONE AUTH
========================= */

$("#sendOtp").onclick =
  async () => {

    try {

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
          تم إرسال الكود على SMS.
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


$("#verifyOtp").onclick =
  async () => {

    try {

      if (!confirmationResult) {

        alert(
          "اطلب كود التحقق أولًا."
        );

        return;

      }


      const code =
        $("#otp")
          .value
          .trim();


      if (!code) {

        alert(
          "اكتب كود التحقق."
        );

        return;

      }


      await confirmationResult.confirm(
        code
      );


      show("home");


    } catch (error) {

      console.error(error);

      $("#authMsg").innerHTML =
        `<div class="notice error">
          الكود غير صحيح أو انتهت صلاحيته.
        </div>`;

    }

  };


/* =========================
   LOGOUT
========================= */

$("#logoutBtn").onclick =
  () => signOut(auth);


/* =========================
   AUTH STATE
========================= */

onAuthStateChanged(
  auth,
  async (u) => {

    if (!u) {

      $("#authMini")
        .textContent = "👤";

      return;

    }


    $("#authMini")
      .textContent = "🟢";


    const snap =
      await getDoc(
        doc(
          db,
          "users",
          u.uid
        )
      );


    if (snap.exists()) {

      const d =
        snap.data();


      currentRole =
        d.role ||
        "customer";


      $("#profileName")
        .textContent =
        d.name ||
        u.displayName ||
        "مستخدم";


      $("#profilePhone")
        .textContent =
        u.phoneNumber ||
        "";


      $("#profileNameInput")
        .value =
        d.name ||
        "";


      $("#profileRole")
        .value =
        currentRole;


      $("#carModel")
        .value =
        d.carModel ||
        "";


      $("#plate")
        .value =
        d.plate ||
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

  }
);
