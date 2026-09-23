import "./style.css";

import { initializeApp } from "firebase/app";

import {
  getAuth,
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut
} from "firebase/auth";

import {
  getFirestore,
  collection,
  addDoc,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp
} from "firebase/firestore";

import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "firebase/storage";

import { Geolocation } from "@capacitor/geolocation";

/* ======================================================
   FIREBASE
====================================================== */

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const firebaseApp = initializeApp(firebaseConfig);

const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);

/* ======================================================
   VARIABLES
====================================================== */

let currentUser = null;
let currentRole = "customer";

let selectedPickup = "";
let selectedDestination = "";

let selectedPickupCoords = null;
let selectedDestinationCoords = null;

let selectedDistanceKm = null;
let selectedDurationText = "";

let recaptcha = null;
let confirmationResult = null;

let unsubscribeCaptainRides = null;

let map = null;
let destinationMarker = null;

let googleMapsPromise = null;
let mapSearchTimer = null;

/* ======================================================
   HELPERS
====================================================== */

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showMessage(message, type = "info") {
  const box = $("#messageBox");

  if (!box) return;

  box.textContent = message;
  box.className = `message-box ${type}`;
  box.style.display = "block";

  clearTimeout(window.__messageTimer);

  window.__messageTimer = setTimeout(() => {
    box.style.display = "none";
  }, 5000);
}

function formatDateTime(value) {
  if (!value) return "غير محدد";

  try {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString("ar-EG", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  } catch {
    return value;
  }
}

/* ======================================================
   GOOGLE MAPS
====================================================== */

function loadGoogleMaps() {
  if (window.google?.maps) {
    return Promise.resolve(window.google);
  }

  if (googleMapsPromise) {
    return googleMapsPromise;
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      reject(
        new Error(
          "VITE_GOOGLE_MAPS_API_KEY غير موجود."
        )
      );
      return;
    }

    const oldScript =
      document.getElementById("google-maps-script");

    if (oldScript) {
      const timer = setInterval(() => {
        if (window.google?.maps) {
          clearInterval(timer);
          resolve(window.google);
        }
      }, 100);

      setTimeout(() => {
        clearInterval(timer);

        if (!window.google?.maps) {
          reject(
            new Error(
              "Google Maps لم يتم تحميلها."
            )
          );
        }
      }, 15000);

      return;
    }

    const script =
      document.createElement("script");

    script.id = "google-maps-script";

    script.src =
      "https://maps.googleapis.com/maps/api/js" +
      "?key=" +
      encodeURIComponent(apiKey) +
      "&libraries=places" +
      "&language=ar" +
      "&region=EG" +
      "&v=weekly";

    script.async = true;
    script.defer = true;

    script.onload = () => {
      if (window.google?.maps) {
        resolve(window.google);
      } else {
        reject(
          new Error(
            "Google Maps API غير متاحة."
          )
        );
      }
    };

    script.onerror = () => {
      reject(
        new Error(
          "فشل تحميل Google Maps."
        )
      );
    };

    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

/* ======================================================
   MAIN HTML
====================================================== */

const appElement = $("#app");

if (!appElement) {
  throw new Error(
    "لم يتم العثور على عنصر #app في index.html"
  );
}

appElement.innerHTML = `
<div class="app">

<header class="header">

  <div class="logo">
    🚕
    <span>وصلني المنوفية</span>
  </div>

  <button
    id="profileBtn"
    class="icon-button"
    type="button">
    👤
  </button>

</header>

<div
  id="messageBox"
  class="message-box"
  style="display:none">
</div>


<!-- HOME -->

<section
  id="homeScreen"
  class="screen active">

  <div class="hero">

    <h1>
      اطلب رحلتك بسعر أرخص 🚕
    </h1>

    <p>
      حدد مكان الالتقاء ومكان النزول،
      واكتب السعر المناسب ليك،
      والكباتن يقدروا يقدموا عروضهم.
    </p>

  </div>


  <!-- PICKUP -->

  <div class="card">

    <label>
      📍 مكان الالتقاء
    </label>

    <button
      id="fromPlace"
      class="btn outline"
      type="button">

      📍 استخدم موقعي الحالي

    </button>

    <div
      id="pickupInfo"
      class="status">

      لم يتم تحديد مكان الالتقاء

    </div>

  </div>


  <!-- PICKUP TIME -->

  <div class="card">

    <label>
      🕐 ميعاد الالتقاء
    </label>

    <input
      id="pickupDateTime"
      type="datetime-local">

    <small>
      حدد اليوم والساعة اللي عايز الكابتن ييجي ياخدك فيها.
    </small>

  </div>


  <!-- DESTINATION -->

  <div class="card">

    <label>
      🏁 مكان النزول
    </label>

    <button
      id="toPlace"
      class="btn outline"
      type="button">

      🗺️ حدد مكان النزول على الخريطة

    </button>

    <div
      id="destinationInfo"
      class="status">

      لم يتم تحديد مكان النزول

    </div>

  </div>


  <!-- DROPOFF TIME -->

  <div class="card">

    <label>
      🕐 ميعاد النزول
    </label>

    <input
      id="dropoffDateTime"
      type="datetime-local">

    <small>
      حدد الميعاد المتوقع للوصول أو الموعد المطلوب للنزول.
    </small>

  </div>


  <!-- ROUTE -->

  <div
    id="routeCard"
    class="card"
    style="display:none">

    <h3>
      🛣️ تفاصيل الرحلة
    </h3>

    <div
      id="routeInfo"
      class="status">

      جاري حساب المسافة والوقت...

    </div>

  </div>


  <!-- PASSENGERS -->

  <div class="card">

    <label>
      👥 عدد الركاب
    </label>

    <select id="passengerCount">

      ${Array.from(
        { length: 8 },
        (_, i) => `
          <option value="${i + 1}">
            ${i + 1}
            ${i === 0 ? "راكب" : "ركاب"}
          </option>
        `
      ).join("")}

    </select>

  </div>


  <!-- NOTES -->

  <div class="card">

    <label>
      📝 ملاحظات الرحلة
    </label>

    <textarea
      id="rideNotes"
      rows="4"
      maxlength="500"
      style="
        width:100%;
        padding:14px;
        border:1px solid #d7e4eb;
        border-radius:14px;
        margin:7px 0 10px;
        background:#fff;
        color:#12304a;
        outline:none;
        resize:vertical;
        font:inherit;
      "
      placeholder="مثال: معايا شنطة كبيرة، محتاج عربية واسعة..."
    ></textarea>

    <small>
      اكتب أي شيء مهم عايز الكابتن يعرفه.
    </small>

  </div>


  <!-- PRICE -->

  <div class="card">

    <label>
      💰 سعر الرحلة المقترح
    </label>

    <input
      id="ridePrice"
      type="number"
      min="1"
      inputmode="decimal"
      placeholder="مثال: 100">

    <small>
      اكتب السعر اللي شايفه مناسب للرحلة.
    </small>

  </div>


  <button
    id="requestBtn"
    class="btn primary"
    type="button">

    🚕 اطلب الرحلة

  </button>


  <button
    id="captainBtn"
    class="btn green"
    type="button">

    🚗 دخول منصة الكباتن

  </button>

</section>


<!-- MAP -->

<section
  id="mapScreen"
  class="screen">

  <div class="card">

    <div class="switch">

      <div>

        <h2>
          🏁 حدد مكان النزول
        </h2>

        <small>
          ابحث عن المكان أو حرّك الخريطة
          وحدد النقطة بالضبط.
        </small>

      </div>

      <button
        id="closeMapBtn"
        class="btn danger"
        type="button"
        style="width:auto">

        إلغاء

      </button>

    </div>

  </div>


  <div
    class="card"
    style="position:relative;z-index:20">

    <label>
      🔎 ابحث عن المكان
    </label>

    <input
      id="destinationSearch"
      type="search"
      placeholder="اكتب اسم المكان أو الشارع أو المدينة..."
      autocomplete="off">

    <div
      id="searchResults"
      style="
        display:none;
        max-height:240px;
        overflow:auto;
        margin-top:8px;
      ">
    </div>

  </div>


  <div
    id="mapContainer"
    class="map"
    style="position:relative">

    <div
      id="map"
      style="
        height:100%;
        width:100%;
      ">
    </div>

    <div style="
      position:absolute;
      left:50%;
      top:50%;
      transform:translate(-50%,-100%);
      z-index:10;
      pointer-events:none;
      font-size:42px;
      line-height:1;
      filter:drop-shadow(0 3px 3px #0005);
    ">
      📍
    </div>

  </div>


  <div class="card">

    <div
      id="mapSelectedAddress"
      class="status">

      جاري تحميل الخريطة...

    </div>

    <button
      id="confirmDestinationBtn"
      class="btn primary"
      type="button">

      ✅ تأكيد مكان النزول

    </button>

  </div>

</section>


<!-- AUTH -->

<section
  id="authScreen"
  class="screen">

  <div class="card">

    <div class="avatar">
      📱
    </div>

    <h2>
      إنشاء / تسجيل الدخول
    </h2>


    <div
      class="card"
      style="margin:10px 0">

      <label>
        أنا:
      </label>

      <select id="accountRole">

        <option value="customer">
          👤 عميل
        </option>

        <option value="captain">
          🚕 كابتن
        </option>

      </select>

    </div>


    <input
      id="accountName"
      type="text"
      placeholder="الاسم بالكامل">


    <div
      id="captainFields"
      style="display:none">

      <input
        id="captainCarType"
        type="text"
        placeholder="نوع العربية - مثال: سيدان">

      <input
        id="captainCarModel"
        type="text"
        placeholder="موديل العربية - مثال: لانسر">

      <input
        id="captainCarNumber"
        type="text"
        placeholder="رقم السيارة">

    </div>


    <label>
      📷 الصورة الشخصية
    </label>

    <input
      id="profileImage"
      type="file"
      accept="image/*">


    <input
      id="phone"
      type="tel"
      placeholder="+201xxxxxxxxx">


    <div id="recaptcha"></div>


    <button
      id="sendCodeBtn"
      class="btn primary"
      type="button">

      إرسال كود التحقق

    </button>


    <div
      id="codeSection"
      style="display:none">

      <input
        id="verificationCode"
        type="number"
        placeholder="اكتب كود التحقق">

      <button
        id="verifyCodeBtn"
        class="btn green"
        type="button">

        تأكيد الكود

      </button>

    </div>


    <div
      id="authMsg"
      class="status">
    </div>

  </div>

</section>


<!-- CAPTAIN -->

<section
  id="captainScreen"
  class="screen">

  <div class="hero">

    <h2>
      منصة الكباتن 🚗
    </h2>

    <p>
      الرحلات المفتوحة تظهر هنا
      ويمكنك تقديم سعرك للعميل.
    </p>

  </div>


  <div
    id="captainRides"
    class="rides-list">

    <div class="card">
      لا توجد رحلات حالياً
    </div>

  </div>


  <button
    id="backHomeBtn"
    class="btn outline"
    type="button">

    ← العودة للرئيسية

  </button>

</section>


<!-- PROFILE -->

<section
  id="profileScreen"
  class="screen">

  <div class="card">

    <div class="avatar">
      👤
    </div>

    <h2>
      حسابي
    </h2>

    <div
      id="profileInfo"
      class="status">

      غير مسجل

    </div>


    <button
      id="logoutBtn"
      class="btn danger"
      type="button">

      تسجيل الخروج

    </button>

  </div>

</section>


<!-- NAV -->

<nav class="nav">

  <button
    id="navHome"
    class="active"
    type="button">

    🏠
    <br>
    الرئيسية

  </button>


  <button
    id="navCaptain"
    type="button">

    🚗
    <br>
    الكابتن

  </button>


  <button
    id="navProfile"
    type="button">

    👤
    <br>
    حسابي

  </button>

</nav>

</div>
`;

/* ======================================================
   NAVIGATION
====================================================== */

function showScreen(screenId) {
  document
    .querySelectorAll(".screen")
    .forEach((screen) => {
      screen.classList.remove("active");
    });

  const screen = $(`#${screenId}`);

  if (screen) {
    screen.classList.add("active");
  }

  document
    .querySelectorAll(".nav button")
    .forEach((button) => {
      button.classList.remove("active");
    });

  if (screenId === "homeScreen") {
    $("#navHome")?.classList.add("active");
  }

  if (screenId === "captainScreen") {
    $("#navCaptain")?.classList.add("active");
  }

  if (screenId === "profileScreen") {
    $("#navProfile")?.classList.add("active");
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

/* ======================================================
   LOCATION DISPLAY
====================================================== */

function updateLocationFields() {
  $("#pickupInfo").innerHTML = selectedPickup
    ? `
      📍
      <strong>
        ${escapeHtml(selectedPickup)}
      </strong>
    `
    : "لم يتم تحديد مكان الالتقاء";

  $("#destinationInfo").innerHTML =
    selectedDestination
      ? `
        🏁
        <strong>
          ${escapeHtml(selectedDestination)}
        </strong>
      `
      : "لم يتم تحديد مكان النزول";
}

/* ======================================================
   ROUTE
====================================================== */

async function calculateRoute() {
  if (
    !selectedPickupCoords ||
    !selectedDestinationCoords
  ) {
    return;
  }

  const routeCard = $("#routeCard");
  const routeInfo = $("#routeInfo");

  routeCard.style.display = "block";

  routeInfo.innerHTML =
    "🛣️ جاري حساب المسافة والوقت...";

  try {
    await loadGoogleMaps();

    const directionsService =
      new google.maps.DirectionsService();

    const result =
      await directionsService.route({
        origin: {
          lat: selectedPickupCoords.lat,
          lng: selectedPickupCoords.lng
        },

        destination: {
          lat: selectedDestinationCoords.lat,
          lng: selectedDestinationCoords.lng
        },

        travelMode:
          google.maps.TravelMode.DRIVING,

        unitSystem:
          google.maps.UnitSystem.METRIC
      });

    const route =
      result.routes?.[0];

    const leg =
      route?.legs?.[0];

    if (!leg) {
      throw new Error(
        "لم يتم العثور على الطريق."
      );
    }

    const meters =
      Number(
        leg.distance?.value || 0
      );

    selectedDistanceKm =
      meters / 1000;

    selectedDurationText =
      leg.duration?.text || "";

    routeInfo.innerHTML = `
      <div style="
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:10px;
        text-align:center;
      ">

        <div style="
          background:#eef6ff;
          padding:12px;
          border-radius:12px;
        ">

          <strong style="
            display:block;
            font-size:20px;
            color:#0878df;
          ">
            ${selectedDistanceKm.toFixed(1)}
          </strong>

          <small>
            كيلومتر
          </small>

        </div>

        <div style="
          background:#eef8f2;
          padding:12px;
          border-radius:12px;
        ">

          <strong style="
            display:block;
            font-size:20px;
            color:#20a65a;
          ">
            ${escapeHtml(selectedDurationText)}
          </strong>

          <small>
            وقت تقريبي
          </small>

        </div>

      </div>
    `;
  } catch (error) {
    console.error(error);

    selectedDistanceKm = null;
    selectedDurationText = "";

    routeInfo.innerHTML = `
      ⚠️ تعذر حساب المسافة والوقت.
      <br><br>
      تأكد من إعداد Google Maps.
    `;
  }
}

/* ======================================================
   CURRENT LOCATION
====================================================== */

async function getDeviceLocation() {
  try {
    let permission;

    try {
      permission =
        await Geolocation.checkPermissions();
    } catch (error) {
      console.warn(
        "checkPermissions failed:",
        error
      );
    }

    if (
      permission &&
      permission.location !== "granted"
    ) {
      permission =
        await Geolocation.requestPermissions();
    }

    if (
      permission &&
      permission.location !== "granted"
    ) {
      throw new Error(
        "LOCATION_PERMISSION_DENIED"
      );
    }

    const position =
      await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0
      });

    return {
      lat:
        position.coords.latitude,

      lng:
        position.coords.longitude,

      accuracy:
        position.coords.accuracy
    };
  } catch (nativeError) {
    console.error(
      "Capacitor location error:",
      nativeError
    );

    if (
      nativeError?.message ===
      "LOCATION_PERMISSION_DENIED"
    ) {
      throw nativeError;
    }

    if (
      !navigator.geolocation
    ) {
      throw nativeError;
    }

    return await new Promise(
      (resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              lat:
                position.coords.latitude,

              lng:
                position.coords.longitude,

              accuracy:
                position.coords.accuracy
            });
          },

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
}

/* ======================================================
   PICKUP
====================================================== */

$("#fromPlace").addEventListener(
  "click",
  async () => {
    const button =
      $("#fromPlace");

    button.disabled = true;

    button.textContent =
      "📍 جاري تحديد موقعك...";

    showMessage(
      "جاري تحديد موقع جهازك الحالي...",
      "info"
    );

    try {
      const position =
        await getDeviceLocation();

      selectedPickupCoords = {
        lat: position.lat,
        lng: position.lng
      };

      selectedPickup =
        "جاري معرفة العنوان...";

      updateLocationFields();

      const address =
        await getAddressFromCoordinates(
          position.lat,
          position.lng
        );

      selectedPickup =
        address;

      updateLocationFields();

      showMessage(
        `تم تحديد مكان الالتقاء. دقة الموقع حوالي ${Math.round(
          position.accuracy || 0
        )} متر.`,
        "success"
      );

      button.textContent =
        "📍 تم تحديد موقعي";

      await calculateRoute();
    } catch (error) {
      console.error(error);

      if (
        error?.message ===
          "LOCATION_PERMISSION_DENIED" ||
        error?.code === 1
      ) {
        showMessage(
          "اسمح للتطبيق باستخدام موقعك الحالي من نافذة إذن الموقع.",
          "error"
        );
      } else {
        showMessage(
          "تعذر تحديد موقعك. شغّل GPS وحاول مرة أخرى.",
          "error"
        );
      }

      button.textContent =
        "📍 حاول مرة أخرى";
    } finally {
      button.disabled = false;
    }
  }
);

/* ======================================================
   DESTINATION MAP
====================================================== */

async function openDestinationMap() {
  showScreen("mapScreen");

  $("#mapSelectedAddress").textContent =
    "جاري تجهيز الخريطة...";

  $("#destinationSearch").value = "";

  $("#searchResults").style.display =
    "none";

  try {
    await loadGoogleMaps();

    setTimeout(
      initializeDestinationMap,
      150
    );
  } catch (error) {
    console.error(error);

    $("#mapSelectedAddress").innerHTML = `
      ⚠️ لم يتم تحميل Google Maps.
      <br><br>
      تأكد من مفتاح Google Maps.
    `;

    showMessage(
      "تعذر تحميل Google Maps.",
      "error"
    );
  }
}

$("#toPlace").addEventListener(
  "click",
  openDestinationMap
);

/* ======================================================
   INITIALIZE DESTINATION MAP
====================================================== */

function initializeDestinationMap() {
  const mapElement =
    $("#map");

  if (!mapElement) return;

  const center =
    selectedDestinationCoords ||
    selectedPickupCoords || {
      lat: 30.5526,
      lng: 31.0106
    };

  map =
    new google.maps.Map(
      mapElement,
      {
        center,
        zoom:
          selectedDestinationCoords ||
          selectedPickupCoords
            ? 17
            : 12,

        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControl: true,
        gestureHandling: "greedy"
      }
    );

  if (destinationMarker) {
    destinationMarker.setMap(null);
  }

  destinationMarker =
    new google.maps.Marker({
      position: center,
      map,
      title: "مكان النزول"
    });

  selectedDestinationCoords = {
    lat: center.lat,
    lng: center.lng
  };

  updateMapAddress(
    center.lat,
    center.lng
  );

  map.addListener(
    "center_changed",
    () => {
      const position =
        map.getCenter();

      if (!position) return;

      const lat =
        position.lat();

      const lng =
        position.lng();

      selectedDestinationCoords = {
        lat,
        lng
      };

      if (destinationMarker) {
        destinationMarker.setPosition({
          lat,
          lng
        });
      }

      $("#mapSelectedAddress").innerHTML = `
        📍 جاري تحديد المكان...
        <br>
        <small>
          ${lat.toFixed(6)},
          ${lng.toFixed(6)}
        </small>
      `;
    }
  );

  map.addListener(
    "idle",
    () => {
      const position =
        map.getCenter();

      if (!position) return;

      updateMapAddress(
        position.lat(),
        position.lng()
      );
    }
  );
}

/* ======================================================
   MAP ADDRESS
====================================================== */

async function updateMapAddress(
  lat,
  lng
) {
  selectedDestinationCoords = {
    lat,
    lng
  };

  const address =
    await getAddressFromCoordinates(
      lat,
      lng
    );

  $("#mapSelectedAddress").innerHTML = `
    🏁
    <strong>
      المكان المحدد
    </strong>

    <br><br>

    ${escapeHtml(address)}

    <br><br>

    <small>
      ${lat.toFixed(6)},
      ${lng.toFixed(6)}
    </small>
  `;
}

/* ======================================================
   SEARCH
====================================================== */

$("#destinationSearch")
  .addEventListener(
    "input",
    () => {
      clearTimeout(
        mapSearchTimer
      );

      const value =
        $("#destinationSearch")
          .value
          .trim();

      if (value.length < 2) {
        $("#searchResults")
          .style.display =
          "none";

        $("#searchResults")
          .innerHTML = "";

        return;
      }

      mapSearchTimer =
        setTimeout(
          () => searchPlaces(value),
          500
        );
    }
  );

async function searchPlaces(text) {
  const resultsBox =
    $("#searchResults");

  resultsBox.style.display =
    "block";

  resultsBox.innerHTML = `
    <div class="card">
      🔎 جاري البحث...
    </div>
  `;

  try {
    await loadGoogleMaps();

    const service =
      new google.maps.places
        .AutocompleteService();

    service.getPlacePredictions(
      {
        input: text,

        componentRestrictions: {
          country: "eg"
        },

        language: "ar"
      },

      (predictions, status) => {
        if (
          status !==
            google.maps.places
              .PlacesServiceStatus.OK ||
          !predictions?.length
        ) {
          resultsBox.innerHTML = `
            <div class="card">
              لا توجد نتائج.
            </div>
          `;

          return;
        }

        resultsBox.innerHTML =
          predictions
            .slice(0, 8)
            .map(
              (prediction) => `
                <button
                  type="button"
                  class="search-result"
                  data-place-id="${escapeHtml(
                    prediction.place_id
                  )}"
                  style="
                    display:block;
                    width:100%;
                    text-align:right;
                    padding:12px;
                    margin-bottom:6px;
                    border:1px solid #ddd;
                    border-radius:10px;
                    background:#fff;
                    cursor:pointer;
                  ">

                  <strong>
                    ${escapeHtml(
                      prediction
                        .structured_formatting
                        ?.main_text ||
                      prediction.description
                    )}
                  </strong>

                  <br>

                  <small>
                    ${escapeHtml(
                      prediction
                        .structured_formatting
                        ?.secondary_text ||
                      ""
                    )}
                  </small>

                </button>
              `
            )
            .join("");

        resultsBox
          .querySelectorAll(
            ".search-result"
          )
          .forEach((button) => {
            button.addEventListener(
              "click",
              () => {
                selectPlace(
                  button.dataset.placeId
                );
              }
            );
          });
      }
    );
  } catch (error) {
    console.error(error);

    resultsBox.innerHTML = `
      <div class="card error">
        تعذر البحث عن المكان.
      </div>
    `;
  }
}

/* ======================================================
   SELECT SEARCH RESULT
====================================================== */

async function selectPlace(placeId) {
  try {
    await loadGoogleMaps();

    const temp =
      document.createElement("div");

    const service =
      new google.maps.places
        .PlacesService(temp);

    service.getDetails(
      {
        placeId,

        fields: [
          "geometry",
          "formatted_address",
          "name"
        ],

        language: "ar"
      },

      (place, status) => {
        if (
          status !==
            google.maps.places
              .PlacesServiceStatus.OK ||
          !place?.geometry?.location
        ) {
          showMessage(
            "تعذر تحديد المكان.",
            "error"
          );

          return;
        }

        const location =
          place.geometry.location;

        const coords = {
          lat: location.lat(),
          lng: location.lng()
        };

        selectedDestinationCoords =
          coords;

        selectedDestination =
          place.formatted_address ||
          place.name ||
          "المكان المحدد";

        if (map) {
          map.setCenter(coords);
          map.setZoom(18);
        }

        if (destinationMarker) {
          destinationMarker
            .setPosition(coords);
        }

        $("#destinationSearch")
          .value =
          selectedDestination;

        $("#searchResults")
          .style.display =
          "none";

        $("#mapSelectedAddress")
          .innerHTML = `
            🏁
            <strong>
              المكان المختار
            </strong>

            <br><br>

            ${escapeHtml(
              selectedDestination
            )}
          `;
      }
    );
  } catch (error) {
    console.error(error);

    showMessage(
      "تعذر تحديد المكان.",
      "error"
    );
  }
}

/* ======================================================
   GEOCODING
====================================================== */

async function getAddressFromCoordinates(
  lat,
  lng
) {
  try {
    await loadGoogleMaps();

    const geocoder =
      new google.maps.Geocoder();

    const result =
      await geocoder.geocode({
        location: {
          lat,
          lng
        },

        language: "ar"
      });

    if (
      result.results?.length
    ) {
      return result
        .results[0]
        .formatted_address;
    }
  } catch (error) {
    console.error(error);
  }

  return `
    موقع محدد
    (${lat.toFixed(6)}, ${lng.toFixed(6)})
  `;
}

/* ======================================================
   CONFIRM DESTINATION
====================================================== */

$("#confirmDestinationBtn")
  .addEventListener(
    "click",
    async () => {
      if (
        !selectedDestinationCoords
      ) {
        showMessage(
          "حدد مكان النزول أولاً.",
          "error"
        );

        return;
      }

      const button =
        $("#confirmDestinationBtn");

      button.disabled = true;

      button.textContent =
        "جاري التأكيد...";

      try {
        selectedDestination =
          await getAddressFromCoordinates(
            selectedDestinationCoords.lat,
            selectedDestinationCoords.lng
          );

        updateLocationFields();

        showScreen(
          "homeScreen"
        );

        await calculateRoute();

        showMessage(
          "تم تحديد مكان النزول وحساب الرحلة 📍",
          "success"
        );
      } catch (error) {
        console.error(error);

        showMessage(
          "تعذر تأكيد المكان.",
          "error"
        );
      } finally {
        button.disabled = false;

        button.textContent =
          "✅ تأكيد مكان النزول";
      }
    }
  );

$("#closeMapBtn")
  .addEventListener(
    "click",
    () => {
      showScreen(
        "homeScreen"
      );
    }
  );

/* ======================================================
   AUTH ROLE
====================================================== */

$("#accountRole")
  .addEventListener(
    "change",
    () => {
      const captain =
        $("#accountRole").value ===
        "captain";

      $("#captainFields")
        .style.display =
        captain
          ? "block"
          : "none";
    }
  );

/* ======================================================
   RECAPTCHA
====================================================== */

function setupRecaptcha() {
  if (recaptcha) return;

  try {
    recaptcha =
      new RecaptchaVerifier(
        auth,
        "recaptcha",
        {
          size: "normal"
        }
      );

    recaptcha.render();
  } catch (error) {
    console.error(error);

    $("#authMsg").textContent =
      "تعذر تشغيل التحقق.";
  }
}

/* ======================================================
   AUTH SCREEN
====================================================== */

async function openAuth() {
  showScreen("authScreen");

  setupRecaptcha();

  if (!currentUser) return;

  const snap =
    await getDoc(
      doc(
        db,
        "users",
        currentUser.uid
      )
    );

  if (!snap.exists()) return;

  const data =
    snap.data();

  $("#accountRole").value =
    data.role ||
    "customer";

  $("#accountName").value =
    data.name ||
    "";

  $("#captainFields")
    .style.display =
    data.role === "captain"
      ? "block"
      : "none";

  $("#captainCarType").value =
    data.carType ||
    "";

  $("#captainCarModel").value =
    data.carModel ||
    "";

  $("#captainCarNumber").value =
    data.carNumber ||
    "";
}

/* ======================================================
   PROFILE BUTTON
====================================================== */

$("#profileBtn")
  .addEventListener(
    "click",
    async () => {
      if (!currentUser) {
        await openAuth();
        return;
      }

      showScreen(
        "profileScreen"
      );
    }
  );

/* ======================================================
   SEND SMS
====================================================== */

$("#sendCodeBtn")
  .addEventListener(
    "click",
    async () => {
      const phone =
        $("#phone")
          .value
          .trim();

      if (
        !phone ||
        !phone.startsWith("+")
      ) {
        $("#authMsg")
          .textContent =
          "اكتب رقم الهاتف بصيغة دولية مثل +201xxxxxxxxx.";

        return;
      }

      try {
        setupRecaptcha();

        $("#sendCodeBtn")
          .disabled = true;

        $("#authMsg")
          .textContent =
          "جاري إرسال كود التحقق...";

        confirmationResult =
          await signInWithPhoneNumber(
            auth,
            phone,
            recaptcha
          );

        $("#codeSection")
          .style.display =
          "block";

        $("#authMsg")
          .textContent =
          "تم إرسال كود التحقق.";
      } catch (error) {
        console.error(error);

        $("#authMsg")
          .textContent =
          error.message ||
          "حدث خطأ أثناء إرسال الكود.";

        $("#sendCodeBtn")
          .disabled = false;
      }
    }
  );

/* ======================================================
   VERIFY CODE
====================================================== */

$("#verifyCodeBtn")
  .addEventListener(
    "click",
    async () => {
      const code =
        $("#verificationCode")
          .value
          .trim();

      if (!confirmationResult) {
        $("#authMsg")
          .textContent =
          "اطلب الكود أولاً.";

        return;
      }

      if (!code) {
        $("#authMsg")
          .textContent =
          "اكتب كود التحقق.";

        return;
      }

      try {
        await confirmationResult.confirm(
          code
        );

        await saveUserProfile();

        showScreen(
          currentRole === "captain"
            ? "captainScreen"
            : "homeScreen"
        );

        if (
          currentRole ===
          "captain"
        ) {
          loadCaptainRides();
        }

        $("#authMsg")
          .textContent =
          "تم تسجيل الدخول بنجاح.";
      } catch (error) {
        console.error(error);

        $("#authMsg")
          .textContent =
          error.message ||
          "كود التحقق غير صحيح.";
      }
    }
  );

/* ======================================================
   SAVE PROFILE
====================================================== */

async function saveUserProfile() {
  if (!currentUser) return;

  const role =
    $("#accountRole").value;

  const name =
    $("#accountName")
      .value
      .trim();

  if (!name) {
    throw new Error(
      "اكتب الاسم أولاً."
    );
  }

  let carType = "";
  let carModel = "";
  let carNumber = "";

  if (role === "captain") {
    carType =
      $("#captainCarType")
        .value
        .trim();

    carModel =
      $("#captainCarModel")
        .value
        .trim();

    carNumber =
      $("#captainCarNumber")
        .value
        .trim();

    if (
      !carType ||
      !carModel ||
      !carNumber
    ) {
      throw new Error(
        "الكابتن لازم يدخل نوع العربية وموديلها ورقم السيارة."
      );
    }
  }

  let photoURL = "";

  const imageFile =
    $("#profileImage")
      .files?.[0];

  if (imageFile) {
    const extension =
      imageFile.name
        .split(".")
        .pop() ||
      "jpg";

    const imageRef =
      storageRef(
        storage,
        `profileImages/${currentUser.uid}.${extension}`
      );

    await uploadBytes(
      imageRef,
      imageFile
    );

    photoURL =
      await getDownloadURL(
        imageRef
      );
  }

  const userRef =
    doc(
      db,
      "users",
      currentUser.uid
    );

  const oldSnap =
    await getDoc(userRef);

  const oldData =
    oldSnap.exists()
      ? oldSnap.data()
      : {};

  const userData = {
    uid:
      currentUser.uid,

    phone:
      currentUser.phoneNumber ||
      "",

    name,

    role,

    photoURL:
      photoURL ||
      oldData.photoURL ||
      "",

    updatedAt:
      serverTimestamp()
  };

  if (role === "captain") {
    userData.carType =
      carType;

    userData.carModel =
      carModel;

    userData.carNumber =
      carNumber;

    userData.captainStatus =
      "pending";
  } else {
    userData.carType = "";
    userData.carModel = "";
    userData.carNumber = "";
  }

  if (!oldSnap.exists()) {
    userData.createdAt =
      serverTimestamp();
  }

  await setDoc(
    userRef,
    userData,
    {
      merge: true
    }
  );

  currentRole = role;

  await loadProfile();
}

/* ======================================================
   REQUEST RIDE
====================================================== */

$("#requestBtn")
  .addEventListener(
    "click",
    async () => {
      if (!currentUser) {
        await openAuth();
        return;
      }

      if (
        currentRole !==
        "customer"
      ) {
        showMessage(
          "حساب الكابتن لا ينشئ رحلة عميل.",
          "error"
        );

        return;
      }

      if (!selectedPickupCoords) {
        showMessage(
          "حدد مكان الالتقاء أولاً.",
          "error"
        );

        return;
      }

      if (!selectedDestinationCoords) {
        showMessage(
          "حدد مكان النزول أولاً.",
          "error"
        );

        return;
      }

      const pickupDateTime =
        $("#pickupDateTime")
          .value;

      const dropoffDateTime =
        $("#dropoffDateTime")
          .value;

      if (!pickupDateTime) {
        showMessage(
          "حدد ميعاد الالتقاء.",
          "error"
        );

        return;
      }

      if (!dropoffDateTime) {
        showMessage(
          "حدد ميعاد النزول.",
          "error"
        );

        return;
      }

      if (
        new Date(dropoffDateTime) <
        new Date(pickupDateTime)
      ) {
        showMessage(
          "ميعاد النزول مينفعش يكون قبل ميعاد الالتقاء.",
          "error"
        );

        return;
      }

      const price =
        Number(
          $("#ridePrice").value
        );

      if (
        !price ||
        price <= 0
      ) {
        showMessage(
          "اكتب سعر الرحلة.",
          "error"
        );

        return;
      }

      const passengerCount =
        Number(
          $("#passengerCount")
            .value
        ) || 1;

      const rideNotes =
        $("#rideNotes")
          .value
          .trim();

      try {
        const button =
          $("#requestBtn");

        button.disabled = true;

        button.textContent =
          "جاري إرسال الرحلة...";

        if (
          !selectedDistanceKm ||
          !selectedDurationText
        ) {
          await calculateRoute();
        }

        const userSnap =
          await getDoc(
            doc(
              db,
              "users",
              currentUser.uid
            )
          );

        const userData =
          userSnap.exists()
            ? userSnap.data()
            : {};

        const ride = {
          userId:
            currentUser.uid,

          customerName:
            userData.name ||
            "",

          customerPhone:
            currentUser.phoneNumber ||
            "",

          customerPhoto:
            userData.photoURL ||
            "",

          fromPlace:
            selectedPickup,

          toPlace:
            selectedDestination,

          pickupCoords:
            selectedPickupCoords,

          destinationCoords:
            selectedDestinationCoords,

          pickupAt:
            pickupDateTime,

          dropoffAt:
            dropoffDateTime,

          price,

          passengerCount,

          notes:
            rideNotes,

          distanceKm:
            selectedDistanceKm ||
            0,

          durationText:
            selectedDurationText ||
            "",

          status:
            "open",

          createdAt:
            serverTimestamp()
        };

        const rideRef =
          await addDoc(
            collection(
              db,
              "rides"
            ),
            ride
          );

        localStorage.setItem(
          "lastRide",
          JSON.stringify({
            id:
              rideRef.id,

            fromPlace:
              selectedPickup,

            toPlace:
              selectedDestination,

            pickupCoords:
              selectedPickupCoords,

            destinationCoords:
              selectedDestinationCoords,

            pickupAt:
              pickupDateTime,

            dropoffAt:
              dropoffDateTime,

            price,

            passengerCount,

            notes:
              rideNotes,

            distanceKm:
              selectedDistanceKm,

            durationText:
              selectedDurationText
          })
        );

        showMessage(
          "تم إرسال الرحلة للكباتن بنجاح 🚕",
          "success"
        );

        $("#ridePrice").value =
          "";

        $("#rideNotes").value =
          "";

        $("#passengerCount")
          .value = "1";

        $("#pickupDateTime")
          .value = "";

        $("#dropoffDateTime")
          .value = "";
      } catch (error) {
        console.error(error);

        showMessage(
          error.message ||
          "حدث خطأ أثناء إرسال الرحلة.",
          "error"
        );
      } finally {
        $("#requestBtn")
          .disabled = false;

        $("#requestBtn")
          .textContent =
          "🚕 اطلب الرحلة";
      }
    }
  );

/* ======================================================
   CAPTAIN
====================================================== */

async function openCaptainScreen() {
  if (!currentUser) {
    await openAuth();

    $("#accountRole")
      .value =
      "captain";

    $("#captainFields")
      .style.display =
      "block";

    return;
  }

  if (
    currentRole !==
    "captain"
  ) {
    showMessage(
      "ده حساب عميل. لو عايز تشتغل ككابتن اعمل حساب كابتن.",
      "error"
    );

    return;
  }

  showScreen(
    "captainScreen"
  );

  loadCaptainRides();
}

$("#captainBtn")
  .addEventListener(
    "click",
    openCaptainScreen
  );

$("#navCaptain")
  .addEventListener(
    "click",
    openCaptainScreen
  );

$("#navHome")
  .addEventListener(
    "click",
    () => {
      showScreen(
        "homeScreen"
      );
    }
  );

$("#navProfile")
  .addEventListener(
    "click",
    async () => {
      if (!currentUser) {
        await openAuth();
        return;
      }

      showScreen(
        "profileScreen"
      );
    }
  );

$("#backHomeBtn")
  .addEventListener(
    "click",
    () => {
      showScreen(
        "homeScreen"
      );
    }
  );

/* ======================================================
   CAPTAIN RIDES
====================================================== */

function loadCaptainRides() {
  const container =
    $("#captainRides");

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

      orderBy(
        "createdAt",
        "desc"
      ),

      limit(50)
    );

  unsubscribeCaptainRides =
    onSnapshot(
      ridesQuery,

      (snapshot) => {
        if (snapshot.empty) {
          container.innerHTML = `
            <div class="card">
              لا توجد رحلات مفتوحة حالياً 🚕
            </div>
          `;

          return;
        }

        container.innerHTML =
          "";

        snapshot.forEach(
          (rideDoc) => {
            const ride =
              rideDoc.data();

            const card =
              document.createElement(
                "div"
              );

            card.className =
              "card";

            const customerPhoto =
              ride.customerPhoto
                ? `
                  <img
                    src="${escapeHtml(
                      ride.customerPhoto
                    )}"
                    style="
                      width:52px;
                      height:52px;
                      border-radius:50%;
                      object-fit:cover;
                    ">
                `
                : `
                  <div
                    style="font-size:35px">
                    👤
                  </div>
                `;

            card.innerHTML = `
              <div class="offer">

                <div>

                  <span class="pill">
                    رحلة جديدة
                  </span>

                  <h3>
                    🚕 طلب رحلة
                  </h3>

                </div>

                <div class="price">
                  ${Number(
                    ride.price || 0
                  )}
                  جنيه
                </div>

              </div>


              <div
                style="
                  display:flex;
                  gap:10px;
                  align-items:center;
                  margin-bottom:12px;
                ">

                ${customerPhoto}

                <div>

                  <strong>
                    ${escapeHtml(
                      ride.customerName ||
                      "عميل"
                    )}
                  </strong>

                  <br>

                  <small>
                    عميل
                  </small>

                </div>

              </div>


              <div class="status">

                📍
                <strong>
                  الالتقاء:
                </strong>

                <br>

                ${escapeHtml(
                  ride.fromPlace ||
                  "غير محدد"
                )}

              </div>


              <div class="status">

                🏁
                <strong>
                  النزول:
                </strong>

                <br>

                ${escapeHtml(
                  ride.toPlace ||
                  "غير محدد"
                )}

              </div>


              <div class="status">

                🕐
                <strong>
                  ميعاد الالتقاء:
                </strong>

                <br>

                ${escapeHtml(
                  formatDateTime(
                    ride.pickupAt
                  )
                )}

              </div>


              <div class="status">

                🕐
                <strong>
                  ميعاد النزول:
                </strong>

                <br>

                ${escapeHtml(
                  formatDateTime(
                    ride.dropoffAt
                  )
                )}

              </div>


              <div class="status">

                🛣️
                <strong>
                  المسافة:
                </strong>

                ${Number(
                  ride.distanceKm || 0
                ).toFixed(1)}

                كم

                ${
                  ride.durationText
                    ? `
                      <br>
                      ⏱️
                      <strong>
                        الوقت:
                      </strong>
                      ${escapeHtml(
                        ride.durationText
                      )}
                    `
                    : ""
                }

              </div>


              <div class="status">

                👥
                <strong>
                  عدد الركاب:
                </strong>

                ${Number(
                  ride.passengerCount ||
                  1
                )}

              </div>


              ${
                ride.notes
                  ? `
                    <div class="status">

                      📝
                      <strong>
                        ملاحظات العميل:
                      </strong>

                      <br><br>

                      ${escapeHtml(
                        ride.notes
                      )}

                    </div>
                  `
                  : ""
              }


              <button
                class="btn green offer-button"
                data-id="${rideDoc.id}"
                data-price="${ride.price || 0}"
                type="button">

                💰 تقديم عرض

              </button>
            `;

            container.appendChild(
              card
            );
          }
        );

        container
          .querySelectorAll(
            ".offer-button"
          )
          .forEach((button) => {
            button.addEventListener(
              "click",
              () => {
                sendOffer(
                  button.dataset.id,
                  Number(
                    button.dataset.price
                  )
                );
              }
            );
          });
      },

      (error) => {
        console.error(error);

        container.innerHTML = `
          <div class="card error">

            تعذر تحميل الرحلات.

            <br><br>

            ${escapeHtml(
              error.message
            )}

          </div>
        `;
      }
    );
}

/* ======================================================
   CAPTAIN OFFER
====================================================== */

async function sendOffer(
  rideId,
  originalPrice
) {
  if (
    !currentUser ||
    currentRole !==
      "captain"
  ) {
    showMessage(
      "سجل بحساب كابتن أولاً.",
      "error"
    );

    return;
  }

  const offerPrice =
    prompt(
      `سعر العميل: ${originalPrice} جنيه

اكتب عرضك:`
    );

  if (!offerPrice) return;

  const price =
    Number(offerPrice);

  if (
    !price ||
    price <= 0
  ) {
    showMessage(
      "اكتب سعر صحيح.",
      "error"
    );

    return;
  }

  try {
    const captainSnap =
      await getDoc(
        doc(
          db,
          "users",
          currentUser.uid
        )
      );

    const captain =
      captainSnap.exists()
        ? captainSnap.data()
        : {};

    await addDoc(
      collection(
        db,
        "rides",
        rideId,
        "offers"
      ),
      {
        captainId:
          currentUser.uid,

        captainName:
          captain.name ||
          "",

        captainPhone:
          currentUser.phoneNumber ||
          "",

        captainPhoto:
          captain.photoURL ||
          "",

        carType:
          captain.carType ||
          "",

        carModel:
          captain.carModel ||
          "",

        carNumber:
          captain.carNumber ||
          "",

        price,

        createdAt:
          serverTimestamp(),

        status:
          "pending"
      }
    );

    showMessage(
      "تم إرسال عرضك للعميل بنجاح ✅",
      "success"
    );
  } catch (error) {
    console.error(error);

    showMessage(
      error.message ||
      "تعذر إرسال العرض.",
      "error"
    );
  }
}

/* ======================================================
   PROFILE
====================================================== */

async function loadProfile() {
  if (!currentUser) return;

  try {
    const userSnap =
      await getDoc(
        doc(
          db,
          "users",
          currentUser.uid
        )
      );

    if (
      !userSnap.exists()
    ) {
      await setDoc(
        doc(
          db,
          "users",
          currentUser.uid
        ),
        {
          uid:
            currentUser.uid,

          phone:
            currentUser.phoneNumber ||
            "",

          role:
            "customer",

          createdAt:
            serverTimestamp()
        },
        {
          merge: true
        }
      );

      currentRole =
        "customer";

      $("#profileInfo")
        .textContent =
        "تم إنشاء حساب العميل. أكمل بيانات الاسم والصورة من الحساب.";

      return;
    }

    const data =
      userSnap.data();

    currentRole =
      data.role ||
      "customer";

    const photo =
      data.photoURL
        ? `
          <img
            src="${escapeHtml(
              data.photoURL
            )}"
            style="
              width:80px;
              height:80px;
              border-radius:50%;
              object-fit:cover;
            ">
        `
        : "👤";

    $("#profileInfo")
      .innerHTML = `
        <div
          style="
            text-align:center;
          ">

          ${photo}

          <br><br>

          <strong>
            ${escapeHtml(
              data.name ||
              "بدون اسم"
            )}
          </strong>

          <br><br>

          📱
          ${escapeHtml(
            currentUser.phoneNumber ||
            ""
          )}

          <br><br>

          👤 النوع:

          <strong>
            ${
              currentRole ===
              "captain"
                ? "كابتن"
                : "عميل"
            }
          </strong>

          ${
            currentRole ===
            "captain"
              ? `
                <br><br>

                🚗
                ${escapeHtml(
                  data.carType ||
                  ""
                )}

                <br>

                🚘
                ${escapeHtml(
                  data.carModel ||
                  ""
                )}

                <br>

                🔢
                ${escapeHtml(
                  data.carNumber ||
                  ""
                )}
              `
              : ""
          }

        </div>
      `;
  } catch (error) {
    console.error(error);

    $("#profileInfo")
      .textContent =
      "تعذر تحميل الحساب.";
  }
}

/* ======================================================
   AUTH STATE
====================================================== */

onAuthStateChanged(
  auth,
  async (user) => {
    currentUser =
      user;

    if (user) {
      await loadProfile();
    } else {
      currentRole =
        "customer";

      $("#profileInfo")
        .textContent =
        "غير مسجل";
    }
  }
);

/* ======================================================
   LOGOUT
====================================================== */

$("#logoutBtn")
  .addEventListener(
    "click",
    async () => {
      try {
        await signOut(auth);

        currentUser =
          null;

        currentRole =
          "customer";

        showMessage(
          "تم تسجيل الخروج.",
          "success"
        );

        showScreen(
          "homeScreen"
        );
      } catch (error) {
        console.error(error);

        showMessage(
          "تعذر تسجيل الخروج.",
          "error"
        );
      }
    }
  );

/* ======================================================
   INITIALIZE
====================================================== */

updateLocationFields();

showScreen(
  "homeScreen"
);

console.log(
  "وصلني المنوفية يعمل بنجاح 🚕"
);
