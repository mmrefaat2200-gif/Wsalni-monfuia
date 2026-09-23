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
  updateDoc,
  query,
  where,
  limit,
  onSnapshot,
  getDocs,
  serverTimestamp
} from "firebase/firestore";

import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "firebase/storage";

import {
  getCurrentPosition,
  requestPermissions,
  checkPermissions
} from "@capacitor/geolocation";

/* ======================================================
/* ======================================================
   FIREBASE
   ====================================================== */

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
  updateDoc,
  query,
  where,
  limit,
  onSnapshot,
  getDocs,
  serverTimestamp
} from "firebase/firestore";

import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "firebase/storage";


/* ======================================================
   FIREBASE CONFIG
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


/* ======================================================
   INITIALIZE FIREBASE
   ====================================================== */

const firebaseApp = initializeApp(firebaseConfig);


/* ======================================================
   FIREBASE SERVICES
   ====================================================== */

const auth = getAuth(firebaseApp);

const db = getFirestore(firebaseApp);

const storage = getStorage(firebaseApp);
/* ======================================================
   GLOBAL VARIABLES
   ====================================================== */

let currentUser = null;
let currentRole = "customer";
let currentProfile = null;

let selectedPickup = "";
let selectedDestination = "";

let selectedPickupCoords = null;
let selectedDestinationCoords = null;

let confirmationResult = null;
let recaptcha = null;

let googleMapsPromise = null;

let map = null;
let destinationMarker = null;
let pickupMarker = null;

let directionsService = null;
let directionsRenderer = null;

let mapSearchTimer = null;

let unsubscribeOpenRides = null;
let unsubscribeCustomerRides = null;
let unsubscribeCaptainHistory = null;

const $ = selector => document.querySelector(selector);

/* ======================================================
   HELPERS
   ====================================================== */

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(timestamp) {
  if (!timestamp) return "منذ قليل";

  try {
    const date = timestamp.toDate
      ? timestamp.toDate()
      : new Date(timestamp);

    return date.toLocaleString("ar-EG", {
      dateStyle: "short",
      timeStyle: "short"
    });
  } catch {
    return "منذ قليل";
  }
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
          "VITE_GOOGLE_MAPS_API_KEY غير موجود في ملف .env"
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
              "Google Maps لم يتم تحميلها"
            )
          );
        }
      }, 15000);

      return;
    }

    const script = document.createElement("script");

    script.id = "google-maps-script";

    script.src =
      "https://maps.googleapis.com/maps/api/js" +
      "?key=" +
      encodeURIComponent(apiKey) +
      "&libraries=places" +
      "&v=weekly";

    script.async = true;
    script.defer = true;

    script.onload = () => {
      if (window.google?.maps) {
        resolve(window.google);
      } else {
        reject(
          new Error(
            "Google Maps API غير متاحة"
          )
        );
      }
    };

    script.onerror = () => {
      reject(
        new Error(
          "فشل تحميل Google Maps"
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

const app = $("#app");

app.innerHTML = `

<div class="app">

<header class="header">

  <div class="logo">
    🚕 <span>وصلني المنوفية</span>
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


<!-- ==================================================
     CUSTOMER HOME
================================================== -->

<section
  id="homeScreen"
  class="screen active">

  <div class="hero">

    <h1>
      اطلب رحلتك بسهولة 🚕
    </h1>

    <p>
      حدد مكان الانطلاق والوصول والسعر المناسب لك.
    </p>

  </div>


  <div class="card">

    <label>
      📍 مكان الانطلاق
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

      لم يتم تحديد مكان الانطلاق

    </div>

  </div>


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

      لم يتم تحديد مكان الوصول

    </div>

  </div>


  <div class="card">

    <label>
      👥 عدد الركاب
    </label>

    <select id="passengerCount">

      <option value="1">1 راكب</option>
      <option value="2">2 ركاب</option>
      <option value="3">3 ركاب</option>
      <option value="4">4 ركاب</option>
      <option value="5">5 ركاب</option>
      <option value="6">6 ركاب</option>
      <option value="7">7 ركاب</option>
      <option value="8">8 ركاب</option>

    </select>

  </div>


  <div class="card">

    <label>
      📝 ملاحظات للرحلة
    </label>

    <textarea
      id="rideNotes"
      rows="4"
      maxlength="500"
      placeholder="مثال: معايا شنطة كبيرة، محتاج عربية واسعة..."></textarea>

    <small>
      اكتب أي شيء مهم عايز الكابتن يعرفه.
    </small>

  </div>


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

    🚗 منصة الكباتن

  </button>

</section>


<!-- ==================================================
     CUSTOMER RIDES
================================================== -->

<section
  id="customerRidesScreen"
  class="screen">

  <div class="hero">

    <h2>
      📋 رحلاتي
    </h2>

    <p>
      تابع الرحلات والعروض اللي وصلتك من الكباتن.
    </p>

  </div>

  <div id="customerRides">

    <div class="card">
      جاري تحميل الرحلات...
    </div>

  </div>

</section>


<!-- ==================================================
     DESTINATION MAP
================================================== -->

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
          ابحث عن المكان أو حرّك الخريطة.
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
        margin-top:8px">
    </div>

  </div>


  <div
    id="mapContainer"
    class="map"
    style="position:relative">

    <div
      id="map"
      style="height:100%;width:100%">
    </div>

    <div
      style="
        position:absolute;
        left:50%;
        top:50%;
        transform:translate(-50%,-100%);
        z-index:10;
        pointer-events:none;
        font-size:42px;
        line-height:1;
        filter:drop-shadow(0 3px 3px #0005)">

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


<!-- ==================================================
     AUTH
================================================== -->

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


    <label>
      نوع الحساب
    </label>

    <select id="accountRole">

      <option value="customer">
        👤 عميل
      </option>

      <option value="captain">
        🚕 كابتن
      </option>

    </select>


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


<!-- ==================================================
     CAPTAIN HOME
================================================== -->

<section
  id="captainScreen"
  class="screen">

  <div class="hero">

    <h2>
      🚗 منصة الكباتن
    </h2>

    <p>
      الرحلات المفتوحة المتاحة للكباتن.
    </p>

  </div>


  <div id="captainRides">

    <div class="card">
      جاري تحميل الرحلات...
    </div>

  </div>

</section>


<!-- ==================================================
     CAPTAIN HISTORY
================================================== -->

<section
  id="captainHistoryScreen"
  class="screen">

  <div class="hero">

    <h2>
      📋 رحلاتي ككابتن
    </h2>

  </div>


  <div id="captainHistory">

    <div class="card">
      جاري تحميل الرحلات...
    </div>

  </div>

</section>


<!-- ==================================================
     PROFILE
================================================== -->

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
      id="editProfileBtn"
      class="btn outline"
      type="button">

      ✏️ تعديل الحساب

    </button>


    <button
      id="logoutBtn"
      class="btn danger"
      type="button">

      تسجيل الخروج

    </button>

  </div>

</section>


<!-- ==================================================
     BOTTOM NAV
================================================== -->

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
    id="navRides"
    type="button">

    📋
    <br>
    رحلاتي

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
    .forEach(screen => {
      screen.classList.remove("active");
    });

  const screen = $(`#${screenId}`);

  if (screen) {
    screen.classList.add("active");
  }

  document
    .querySelectorAll(".nav button")
    .forEach(button => {
      button.classList.remove("active");
    });

  if (screenId === "homeScreen") {
    $("#navHome")?.classList.add("active");
  }

  if (screenId === "customerRidesScreen") {
    $("#navRides")?.classList.add("active");
  }

  if (
    screenId === "captainScreen" ||
    screenId === "captainHistoryScreen"
  ) {
    $("#navCaptain")?.classList.add("active");
  }

  if (screenId === "profileScreen") {
    $("#navProfile")?.classList.add("active");
  }
}

/* ======================================================
   LOCATION DISPLAY
   ====================================================== */

function updateLocationFields() {

  $("#pickupInfo").innerHTML = selectedPickup
    ? `📍 <strong>${escapeHtml(selectedPickup)}</strong>`
    : "لم يتم تحديد مكان الانطلاق";


  $("#destinationInfo").innerHTML =
    selectedDestination

      ? `🏁 <strong>${escapeHtml(selectedDestination)}</strong>`

      : "لم يتم تحديد مكان الوصول";
}

/* ======================================================
   DEVICE LOCATION
   ====================================================== */

async function getDeviceLocation() {

  try {

    try {

      const permission =
        await checkPermissions();

      if (
        permission.location !== "granted"
      ) {

        const requested =
          await requestPermissions();

        if (
          requested.location !== "granted"
        ) {

          throw new Error(
            "LOCATION_PERMISSION_DENIED"
          );

        }

      }

    } catch (capacitorError) {

      if (!navigator.geolocation) {
        throw capacitorError;
      }

    }


    try {

      const position =
        await getCurrentPosition({

          enableHighAccuracy: true,

          timeout: 20000,

          maximumAge: 0

        });


      return {

        lat: position.coords.latitude,

        lng: position.coords.longitude,

        accuracy: position.coords.accuracy

      };

    } catch (nativeError) {

      if (!navigator.geolocation) {
        throw nativeError;
      }


      return await new Promise(
        (resolve, reject) => {

          navigator.geolocation.getCurrentPosition(

            position => {

              resolve({

                lat: position.coords.latitude,

                lng: position.coords.longitude,

                accuracy: position.coords.accuracy

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

  } catch (error) {

    throw error;

  }
}

/* ======================================================
   CURRENT LOCATION BUTTON
   ====================================================== */

$("#fromPlace").addEventListener(
  "click",
  async () => {

    const button = $("#fromPlace");

    button.disabled = true;

    button.textContent =
      "📍 جاري تحديد موقعك...";

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


      selectedPickup = address;

      updateLocationFields();


      button.textContent =
        "📍 تم تحديد موقعي";


      showMessage(
        `تم تحديد موقع الانطلاق. دقة GPS حوالي ${Math.round(position.accuracy)} متر.`,
        "success"
      );

    } catch (error) {

      console.error(error);


      if (
        error?.message ===
        "LOCATION_PERMISSION_DENIED" ||
        error?.code === 1
      ) {

        showMessage(
          "اسمح للتطبيق بالدخول للموقع من إعدادات الهاتف ثم حاول مرة أخرى.",
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
   OPEN MAP
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
      200
    );

  } catch (error) {

    console.error(error);

    $("#mapSelectedAddress").innerHTML = `
      ⚠️ لم يتم تحميل Google Maps.
      <br><br>
      تأكد من مفتاح Google Maps.
    `;

  }
}

$("#toPlace").addEventListener(
  "click",
  openDestinationMap
);

/* ======================================================
   INITIALIZE MAP
   ====================================================== */

function initializeDestinationMap() {

  const mapElement = $("#map");

  if (!mapElement) return;


  let center =
    selectedDestinationCoords ||
    selectedPickupCoords ||
    {
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

        fullscreenControl: true,

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

      title:
        "مكان النزول"

    });


  selectedDestinationCoords = {
    lat: center.lat,
    lng: center.lng
  };


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
    async () => {

      const position =
        map.getCenter();

      if (!position) return;

      await updateMapAddress(
        position.lat(),
        position.lng()
      );

    }
  );


  setTimeout(() => {

    google.maps.event.trigger(
      map,
      "resize"
    );

    map.setCenter(center);

  }, 300);
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
    🏁 <strong>المكان المحدد</strong>

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
   SEARCH DESTINATION
   ====================================================== */

$("#destinationSearch")
  .addEventListener(
    "input",
    () => {

      clearTimeout(
        mapSearchTimer
      );


      const text =
        $("#destinationSearch")
          .value
          .trim();


      if (text.length < 2) {

        $("#searchResults").style.display =
          "none";

        return;

      }


      mapSearchTimer =
        setTimeout(
          () => searchPlaces(text),
          500
        );

    }
  );

/* ======================================================
   SEARCH PLACES
   ====================================================== */

async function searchPlaces(text) {

  const results =
    $("#searchResults");

  results.style.display =
    "block";

  results.innerHTML = `
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

          results.innerHTML = `
            <div class="card">
              لا توجد نتائج.
            </div>
          `;

          return;

        }


        results.innerHTML =
          predictions
            .slice(0, 8)
            .map(
              place => `

              <button
                type="button"
                class="search-result"
                data-place-id="${escapeHtml(place.place_id)}"
                style="
                  display:block;
                  width:100%;
                  text-align:right;
                  padding:12px;
                  margin-bottom:6px;
                  border:1px solid #ddd;
                  border-radius:10px;
                  background:#fff;
                ">

                <strong>
                  ${escapeHtml(
                    place
                      .structured_formatting
                      ?.main_text ||
                    place.description
                  )}
                </strong>

                <br>

                <small>
                  ${escapeHtml(
                    place
                      .structured_formatting
                      ?.secondary_text ||
                    ""
                  )}
                </small>

              </button>

            `
            )
            .join("");


        results
          .querySelectorAll(
            ".search-result"
          )
          .forEach(button => {

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

    results.innerHTML = `
      <div class="card">
        تعذر البحث عن المكان.
      </div>
    `;

  }
}

/* ======================================================
   SELECT PLACE
   ====================================================== */

async function selectPlace(placeId) {

  try {

    await loadGoogleMaps();


    const service =
      new google.maps.places
        .PlacesService(
          document.createElement("div")
        );


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
            🏁 <strong>
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
   GEOCODER
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


    if (result.results?.length) {

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

      if (!selectedDestinationCoords) {

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

        showScreen("homeScreen");


        showMessage(
          "تم تحديد مكان النزول بنجاح 📍",
          "success"
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
      showScreen("homeScreen");
    }
  );

/* ======================================================
   ROUTE
   ====================================================== */

async function drawRoute(
  pickup,
  destination
) {

  if (!pickup || !destination) {
    return;
  }


  try {

    await loadGoogleMaps();


    if (!directionsService) {

      directionsService =
        new google.maps
          .DirectionsService();

    }


    if (!directionsRenderer) {

      directionsRenderer =
        new google.maps
          .DirectionsRenderer({
            suppressMarkers: false
          });

    }


    directionsRenderer.setMap(map);


    directionsService.route(

      {

        origin: pickup,

        destination,

        travelMode:
          google.maps.TravelMode.DRIVING

      },

      (result, status) => {

        if (
          status ===
          google.maps.DirectionsStatus.OK
        ) {

          directionsRenderer
            .setDirections(result);

        }

      }

    );

  } catch (error) {

    console.error(error);

  }
}

/* ======================================================
   ACCOUNT ROLE
   ====================================================== */

$("#accountRole")
  .addEventListener(
    "change",
    () => {

      const isCaptain =
        $("#accountRole").value ===
        "captain";


      $("#captainFields")
        .style.display =
          isCaptain
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

  }
}

/* ======================================================
   OPEN AUTH
   ====================================================== */

async function openAuth(
  role = null
) {

  showScreen("authScreen");

  setupRecaptcha();


  if (role) {

    $("#accountRole").value =
      role;

    $("#captainFields")
      .style.display =
        role === "captain"
          ? "block"
          : "none";

  }


  if (!currentUser) return;


  try {

    const snapshot =
      await getDoc(
        doc(
          db,
          "users",
          currentUser.uid
        )
      );


    if (!snapshot.exists()) return;


    const data =
      snapshot.data();


    $("#accountRole").value =
      data.role || "customer";


    $("#accountName").value =
      data.name || "";


    $("#captainFields")
      .style.display =
        data.role === "captain"
          ? "block"
          : "none";


    $("#captainCarType").value =
      data.carType || "";


    $("#captainCarModel").value =
      data.carModel || "";


    $("#captainCarNumber").value =
      data.carNumber || "";

  } catch (error) {

    console.error(error);

  }
}

/* ======================================================
   SEND PHONE CODE
   ====================================================== */

$("#sendCodeBtn")
  .addEventListener(
    "click",
    async () => {

      const phone =
        $("#phone").value.trim();


      if (
        !phone ||
        !phone.startsWith("+")
      ) {

        $("#authMsg").textContent =
          "اكتب الرقم بصيغة دولية مثل +201xxxxxxxxx";

        return;

      }


      try {

        setupRecaptcha();


        $("#sendCodeBtn")
          .disabled = true;


        $("#authMsg").textContent =
          "جاري إرسال الكود...";


        confirmationResult =
          await signInWithPhoneNumber(
            auth,
            phone,
            recaptcha
          );


        $("#codeSection")
          .style.display =
            "block";


        $("#authMsg").textContent =
          "تم إرسال كود التحقق.";

      } catch (error) {

        console.error(error);

        $("#authMsg").textContent =
          error.message ||
          "تعذر إرسال الكود.";


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

        $("#authMsg").textContent =
          "اطلب الكود أولاً.";

        return;

      }


      if (!code) {

        $("#authMsg").textContent =
          "اكتب كود التحقق.";

        return;

      }


      try {

        const result =
          await confirmationResult
            .confirm(code);


        currentUser =
          result.user;


        await saveUserProfile();


        if (
          currentRole === "captain"
        ) {

          showScreen(
            "captainScreen"
          );

          loadOpenCaptainRides();

        } else {

          showScreen(
            "homeScreen"
          );

        }


        showMessage(
          "تم تسجيل الدخول بنجاح ✅",
          "success"
        );

      } catch (error) {

        console.error(error);

        $("#authMsg").textContent =
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
      "اكتب الاسم بالكامل."
    );

  }


  if (role === "captain") {

    const carType =
      $("#captainCarType")
        .value
        .trim();


    const carModel =
      $("#captainCarModel")
        .value
        .trim();


    const carNumber =
      $("#captainCarNumber")
        .value
        .trim();


    if (
      !carType ||
      !carModel ||
      !carNumber
    ) {

      throw new Error(
        "اكتب نوع العربية والموديل ورقم السيارة."
      );

    }

  }


  let photoURL =
    currentProfile?.photoURL ||
    "";


  const file =
    $("#profileImage")
      .files?.[0];


  if (file) {

    const extension =
      file.name
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
      file
    );


    photoURL =
      await getDownloadURL(
        imageRef
      );

  }


  const data = {

    uid:
      currentUser.uid,

    phone:
      currentUser.phoneNumber || "",

    name,

    role,

    photoURL,

    updatedAt:
      serverTimestamp()

  };


  if (role === "captain") {

    data.carType =
      $("#captainCarType")
        .value
        .trim();


    data.carModel =
      $("#captainCarModel")
        .value
        .trim();


    data.carNumber =
      $("#captainCarNumber")
        .value
        .trim();

  }


  const userRef =
    doc(
      db,
      "users",
      currentUser.uid
    );


  const old =
    await getDoc(userRef);


  if (!old.exists()) {

    data.createdAt =
      serverTimestamp();

  }


  await setDoc(
    userRef,
    data,
    { merge: true }
  );


  currentRole = role;

  currentProfile = {
    ...(old.exists()
      ? old.data()
      : {}),
    ...data
  };


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

        await openAuth(
          "customer"
        );

        return;

      }


      if (
        currentRole !==
        "customer"
      ) {

        showMessage(
          "حساب الكابتن لا يستطيع إنشاء رحلة عميل.",
          "error"
        );

        return;

      }


      if (!selectedPickupCoords) {

        showMessage(
          "حدد مكان الانطلاق أولاً.",
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


      const notes =
        $("#rideNotes")
          .value
          .trim();


      const button =
        $("#requestBtn");


      try {

        button.disabled = true;

        button.textContent =
          "جاري إرسال الرحلة...";


        const profileSnapshot =
          await getDoc(
            doc(
              db,
              "users",
              currentUser.uid
            )
          );


        const user =
          profileSnapshot.exists()
            ? profileSnapshot.data()
            : {};


        const ride = {

          userId:
            currentUser.uid,

          customerName:
            user.name || "",

          customerPhone:
            currentUser.phoneNumber ||
            "",

          customerPhoto:
            user.photoURL || "",


          fromPlace:
            selectedPickup,

          toPlace:
            selectedDestination,


          pickupCoords:
            selectedPickupCoords,

          destinationCoords:
            selectedDestinationCoords,


          price,

          passengerCount,

          notes,


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
            id: rideRef.id,
            fromPlace:
              selectedPickup,
            toPlace:
              selectedDestination,
            pickupCoords:
              selectedPickupCoords,
            destinationCoords:
              selectedDestinationCoords,
            price,
            passengerCount,
            notes
          })
        );


        $("#ridePrice").value =
          "";

        $("#rideNotes").value =
          "";

        $("#passengerCount")
          .value = "1";


        showMessage(
          "تم إرسال الرحلة للكباتن 🚕",
          "success"
        );


        showScreen(
          "customerRidesScreen"
        );


        loadCustomerRides();

      } catch (error) {

        console.error(error);

        showMessage(
          error.message ||
          "حدث خطأ أثناء إرسال الرحلة.",
          "error"
        );

      } finally {

        button.disabled = false;

        button.textContent =
          "🚕 اطلب الرحلة";

      }

    }
  );

/* ======================================================
   CUSTOMER RIDES
====================================================== */

async function loadCustomerRides() {

  if (!currentUser) return;


  const container =
    $("#customerRides");


  if (
    unsubscribeCustomerRides
  ) {

    unsubscribeCustomerRides();

    unsubscribeCustomerRides =
      null;

  }


  const ridesQuery =
    query(
      collection(
        db,
        "rides"
      ),

      where(
        "userId",
        "==",
        currentUser.uid
      ),

      limit(50)
    );


  unsubscribeCustomerRides =
    onSnapshot(

      ridesQuery,

      snapshot => {

        if (snapshot.empty) {

          container.innerHTML = `
            <div class="card">
              لا توجد رحلات حتى الآن 🚕
            </div>
          `;

          return;

        }


        const rides =
          snapshot.docs
            .map(item => ({
              id: item.id,
              ...item.data()
            }))
            .sort(
              (a, b) =>
                getTime(b.createdAt) -
                getTime(a.createdAt)
            );


        container.innerHTML = "";


        rides.forEach(ride => {

          renderCustomerRide(
            container,
            ride
          );

        });

      },

      error => {

        console.error(error);

        container.innerHTML = `
          <div class="card">
            تعذر تحميل رحلاتك.
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
   TIME
   ====================================================== */

function getTime(timestamp) {

  if (!timestamp) {
    return 0;
  }

  try {

    if (timestamp.toMillis) {
      return timestamp.toMillis();
    }

    return new Date(
      timestamp
    ).getTime();

  } catch {

    return 0;

  }
}

/* ======================================================
   CUSTOMER RIDE CARD
   ====================================================== */

function renderCustomerRide(
  container,
  ride
) {

  const card =
    document.createElement(
      "div"
    );


  card.className =
    "card";


  let statusText =
    "مفتوحة للكباتن";

  let statusClass =
    "pill";


  if (
    ride.status ===
    "accepted"
  ) {

    statusText =
      "تم قبول الرحلة";

  }


  if (
    ride.status ===
    "completed"
  ) {

    statusText =
      "مكتملة";

  }


  if (
    ride.status ===
    "cancelled"
  ) {

    statusText =
      "ملغاة";

  }


  card.innerHTML = `

    <div class="offer">

      <div>

        <span class="${statusClass}">
          ${statusText}
        </span>

        <h3>
          🚕 رحلتي
        </h3>

      </div>

      <div class="price">
        ${Number(ride.price || 0)}
        جنيه
      </div>

    </div>


    <div class="status">

      📍 <strong>الانطلاق:</strong>

      <br>

      ${escapeHtml(
        ride.fromPlace ||
        "غير محدد"
      )}

    </div>


    <div class="status">

      🏁 <strong>النزول:</strong>

      <br>

      ${escapeHtml(
        ride.toPlace ||
        "غير محدد"
      )}

    </div>


    <div class="status">

      👥 عدد الركاب:

      ${Number(
        ride.passengerCount || 1
      )}

    </div>


    ${
      ride.notes
        ? `
          <div class="status">

            📝 ملاحظات:

            <br><br>

            ${escapeHtml(
              ride.notes
            )}

          </div>
        `
        : ""
    }


    <div class="status">

      🕐

      ${formatDate(
        ride.createdAt
      )}

    </div>


    ${
      ride.status ===
      "accepted"
        ? `

          <div class="card">

            <h3>
              🚗 الكابتن
            </h3>

            <strong>
              ${escapeHtml(
                ride.captainName ||
                ""
              )}
            </strong>

            <br>

            📱
            ${escapeHtml(
              ride.captainPhone ||
              ""
            )}

            <br>

            🚘
            ${escapeHtml(
              ride.captainCarType ||
              ""
            )}

            -
            ${escapeHtml(
              ride.captainCarModel ||
              ""
            )}

            <br>

            🔢
            ${escapeHtml(
              ride.captainCarNumber ||
              ""
            )}

          </div>

        `
        : `

          <button
            class="btn primary showOffersBtn"
            type="button">

            💰 مشاهدة عروض الكباتن

          </button>

          <div
            class="offersContainer"
            style="display:none">
          </div>

        `
    }

  `;


  container.appendChild(card);


  const offersButton =
    card.querySelector(
      ".showOffersBtn"
    );


  if (offersButton) {

    offersButton.addEventListener(
      "click",
      async () => {

        const box =
          card.querySelector(
            ".offersContainer"
          );


        if (
          box.style.display ===
          "block"
        ) {

          box.style.display =
            "none";

          return;

        }


        box.style.display =
          "block";


        await loadRideOffers(
          ride.id,
          box
        );

      }
    );

  }

}

/* ======================================================
   LOAD OFFERS
   ====================================================== */

async function loadRideOffers(
  rideId,
  container
) {

  container.innerHTML = `
    <div class="status">
      جاري تحميل عروض الكباتن...
    </div>
  `;


  try {

    const offersSnapshot =
      await getDocs(
        collection(
          db,
          "rides",
          rideId,
          "offers"
        )
      );


    if (
      offersSnapshot.empty
    ) {

      container.innerHTML = `
        <div class="status">
          لسه مفيش عروض من الكباتن.
        </div>
      `;

      return;

    }


    const offers =
      offersSnapshot.docs
        .map(item => ({
          id: item.id,
          ...item.data()
        }))
        .sort(
          (a, b) =>
            Number(a.price || 0) -
            Number(b.price || 0)
        );


    container.innerHTML = "";


    offers.forEach(
      offer => {

        const box =
          document.createElement(
            "div"
          );


        box.className =
          "card";


        box.innerHTML = `

          <div class="offer">

            <div>

              <strong>
                🚗
                ${escapeHtml(
                  offer.captainName ||
                  "كابتن"
                )}
              </strong>

              <br>

              <small>
                ${escapeHtml(
                  offer.carType ||
                  ""
                )}
                -
                ${escapeHtml(
                  offer.carModel ||
                  ""
                )}
              </small>

            </div>

            <div class="price">
              ${Number(
                offer.price || 0
              )}
              جنيه
            </div>

          </div>


          <div class="status">

            🔢 السيارة:

            ${escapeHtml(
              offer.carNumber ||
              ""
            )}

            <br>

            📱 الهاتف:

            ${escapeHtml(
              offer.captainPhone ||
              ""
            )}

          </div>


          <button
            class="btn green acceptOfferBtn"
            type="button">

            ✅ قبول الكابتن

          </button>

        `;


        container.appendChild(
          box
        );


        box
          .querySelector(
            ".acceptOfferBtn"
          )
          .addEventListener(
            "click",
            () => {

              acceptCaptainOffer(
                rideId,
                offer
              );

            }
          );

      }
    );

  } catch (error) {

    console.error(error);

    container.innerHTML = `
      <div class="status">
        تعذر تحميل العروض.
      </div>
    `;

  }
}

/* ======================================================
   ACCEPT CAPTAIN OFFER
   ====================================================== */

async function acceptCaptainOffer(
  rideId,
  offer
) {

  if (!currentUser) return;


  const confirmed =
    confirm(
      `هل تريد قبول عرض ${offer.captainName} بسعر ${offer.price} جنيه؟`
    );


  if (!confirmed) return;


  try {

    await updateDoc(

      doc(
        db,
        "rides",
        rideId
      ),

      {

        status:
          "accepted",

        captainId:
          offer.captainId,

        captainName:
          offer.captainName || "",

        captainPhone:
          offer.captainPhone || "",

        captainPhoto:
          offer.captainPhoto || "",

        captainCarType:
          offer.carType || "",

        captainCarModel:
          offer.carModel || "",

        captainCarNumber:
          offer.carNumber || "",

        finalPrice:
          Number(
            offer.price
          ),

        acceptedOfferId:
          offer.id,

        acceptedAt:
          serverTimestamp()

      }

    );


    showMessage(
      "تم قبول الكابتن بنجاح 🚗",
      "success"
    );


    loadCustomerRides();

  } catch (error) {

    console.error(error);

    showMessage(
      "تعذر قبول العرض.",
      "error"
    );

  }
}

/* ======================================================
   CAPTAIN SCREEN
   ====================================================== */

async function openCaptainScreen() {

  if (!currentUser) {

    await openAuth(
      "captain"
    );

    return;

  }


  if (
    currentRole !==
    "captain"
  ) {

    showMessage(
      "لازم تدخل بحساب كابتن.",
      "error"
    );

    return;

  }


  showScreen(
    "captainScreen"
  );


  loadOpenCaptainRides();

}

/* ======================================================
   OPEN RIDES FOR CAPTAIN
   ====================================================== */

function loadOpenCaptainRides() {

  if (
    !currentUser ||
    currentRole !==
    "captain"
  ) {

    return;

  }


  const container =
    $("#captainRides");


  if (
    unsubscribeOpenRides
  ) {

    unsubscribeOpenRides();

    unsubscribeOpenRides =
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

      limit(50)

    );


  unsubscribeOpenRides =
    onSnapshot(

      ridesQuery,

      snapshot => {

        if (
          snapshot.empty
        ) {

          container.innerHTML = `
            <div class="card">
              لا توجد رحلات مفتوحة حالياً 🚕
            </div>
          `;

          return;

        }


        const rides =
          snapshot.docs
            .map(item => ({
              id: item.id,
              ...item.data()
            }))
            .sort(
              (a, b) =>
                getTime(
                  b.createdAt
                ) -
                getTime(
                  a.createdAt
                )
            );


        container.innerHTML =
          "";


        rides.forEach(
          ride => {

            renderCaptainRide(
              container,
              ride
            );

          }
        );

      },

      error => {

        console.error(error);

        container.innerHTML = `
          <div class="card">
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
   CAPTAIN RIDE CARD
   ====================================================== */

function renderCaptainRide(
  container,
  ride
) {

  const card =
    document.createElement(
      "div"
    );


  card.className =
    "card";


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


    <div class="status">

      👤 العميل:

      <strong>
        ${escapeHtml(
          ride.customerName ||
          "عميل"
        )}
      </strong>

    </div>


    <div class="status">

      📍 <strong>
        الانطلاق:
      </strong>

      <br>

      ${escapeHtml(
        ride.fromPlace ||
        ""
      )}

    </div>


    <div class="status">

      🏁 <strong>
        النزول:
      </strong>

      <br>

      ${escapeHtml(
        ride.toPlace ||
        ""
      )}

    </div>


    <div class="status">

      👥 عدد الركاب:

      ${Number(
        ride.passengerCount ||
        1
      )}

    </div>


    ${
      ride.notes
        ? `

          <div class="status">

            📝 ملاحظات:

            <br><br>

            ${escapeHtml(
              ride.notes
            )}

          </div>

        `
        : ""
    }


    <div class="status">

      💰 سعر العميل:

      <strong>
        ${Number(
          ride.price || 0
        )}
        جنيه
      </strong>

    </div>


    <button
      class="btn green offerButton"
      type="button">

      💰 تقديم عرض

    </button>

  `;


  container.appendChild(
    card
  );


  card
    .querySelector(
      ".offerButton"
    )
    .addEventListener(
      "click",
      () => {

        sendOffer(
          ride.id,
          ride.price
        );

      }
    );

}

/* ======================================================
   SEND CAPTAIN OFFER
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


  const input =
    prompt(
      `سعر العميل ${originalPrice} جنيه\n\nاكتب سعرك:`
    );


  if (
    input === null ||
    input.trim() === ""
  ) {

    return;

  }


  const price =
    Number(input);


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

    const captainSnapshot =
      await getDoc(
        doc(
          db,
          "users",
          currentUser.uid
        )
      );


    const captain =
      captainSnapshot.exists()
        ? captainSnapshot.data()
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
          captain.name || "",

        captainPhone:
          currentUser.phoneNumber ||
          "",

        captainPhoto:
          captain.photoURL || "",

        carType:
          captain.carType || "",

        carModel:
          captain.carModel || "",

        carNumber:
          captain.carNumber || "",

        price,

        createdAt:
          serverTimestamp(),

        status:
          "pending"

      }

    );


    showMessage(
      "تم إرسال عرضك للعميل ✅",
      "success"
    );

  } catch (error) {

    console.error(error);

    showMessage(
      "تعذر إرسال العرض.",
      "error"
    );

  }
}

/* ======================================================
   CAPTAIN HISTORY
   ====================================================== */

function loadCaptainHistory() {

  if (!currentUser) return;


  const container =
    $("#captainHistory");


  if (
    unsubscribeCaptainHistory
  ) {

    unsubscribeCaptainHistory();

    unsubscribeCaptainHistory =
      null;

  }


  const historyQuery =
    query(

      collection(
        db,
        "rides"
      ),

      where(
        "captainId",
        "==",
        currentUser.uid
      ),

      limit(50)

    );


  unsubscribeCaptainHistory =
    onSnapshot(

      historyQuery,

      snapshot => {

        if (
          snapshot.empty
        ) {

          container.innerHTML = `
            <div class="card">
              لا توجد رحلات حتى الآن.
            </div>
          `;

          return;

        }


        const rides =
          snapshot.docs
            .map(item => ({
              id: item.id,
              ...item.data()
            }))
            .sort(
              (a, b) =>
                getTime(
                  b.createdAt
                ) -
                getTime(
                  a.createdAt
                )
            );


        container.innerHTML =
          "";


        rides.forEach(
          ride => {

            const card =
              document.createElement(
                "div"
              );


            card.className =
              "card";


            card.innerHTML = `

              <div class="offer">

                <div>

                  <span class="pill">
                    ${
                      ride.status ===
                      "completed"
                        ? "مكتملة"
                        : "مقبولة"
                    }
                  </span>

                  <h3>
                    🚕 رحلة
                  </h3>

                </div>

                <div class="price">
                  ${Number(
                    ride.finalPrice ||
                    ride.price ||
                    0
                  )}
                  جنيه
                </div>

              </div>


              <div class="status">

                👤 العميل:

                ${escapeHtml(
                  ride.customerName ||
                  ""
                )}

                <br>

                📱

                ${escapeHtml(
                  ride.customerPhone ||
                  ""
                )}

              </div>


              <div class="status">

                📍

                ${escapeHtml(
                  ride.fromPlace ||
                  ""
                )}

              </div>


              <div class="status">

                🏁

                ${escapeHtml(
                  ride.toPlace ||
                  ""
                )}

              </div>

            `;


            container.appendChild(
              card
            );

          }
        );

      },

      error => {

        console.error(error);

        container.innerHTML = `
          <div class="card">
            تعذر تحميل سجل الرحلات.
          </div>
        `;

      }

    );

}

/* ======================================================
   PROFILE
   ====================================================== */

async function loadProfile() {

  if (!currentUser) {

    $("#profileInfo")
      .textContent =
        "غير مسجل";

    return;

  }


  try {

    const snapshot =
      await getDoc(
        doc(
          db,
          "users",
          currentUser.uid
        )
      );


    if (!snapshot.exists()) {

      currentRole =
        "customer";

      currentProfile =
        null;


      $("#profileInfo")
        .innerHTML = `
          لم يتم استكمال بيانات الحساب.
        `;

      return;

    }


    const data =
      snapshot.data();


    currentProfile =
      data;


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
              width:90px;
              height:90px;
              border-radius:50%;
              object-fit:cover">
        `

        : "👤";


    $("#profileInfo")
      .innerHTML = `

        <div
          style="text-align:center">

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

          ${
            currentRole ===
            "captain"

              ? `

                🚗 كابتن

                <br><br>

                نوع العربية:

                ${escapeHtml(
                  data.carType ||
                  ""
                )}

                <br>

                الموديل:

                ${escapeHtml(
                  data.carModel ||
                  ""
                )}

                <br>

                رقم السيارة:

                ${escapeHtml(
                  data.carNumber ||
                  ""
                )}

              `

              : `

                👤 عميل

              `

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
   NAVIGATION EVENTS
   ====================================================== */

$("#navHome")
  .addEventListener(
    "click",
    () => {

      showScreen(
        "homeScreen"
      );

    }
  );


$("#navRides")
  .addEventListener(
    "click",
    async () => {

      if (!currentUser) {

        await openAuth(
          "customer"
        );

        return;

      }


      showScreen(
        "customerRidesScreen"
      );


      loadCustomerRides();

    }
  );


$("#navCaptain")
  .addEventListener(
    "click",
    openCaptainScreen
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


      loadProfile();

    }
  );


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


      loadProfile();

    }
  );


$("#captainBtn")
  .addEventListener(
    "click",
    openCaptainScreen
  );


$("#editProfileBtn")
  .addEventListener(
    "click",
    async () => {

      if (!currentUser) {

        await openAuth();

        return;

      }


      await openAuth(
        currentRole
      );

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

        currentProfile =
          null;

        currentRole =
          "customer";


        if (
          unsubscribeOpenRides
        ) {

          unsubscribeOpenRides();

          unsubscribeOpenRides =
            null;

        }


        if (
          unsubscribeCustomerRides
        ) {

          unsubscribeCustomerRides();

          unsubscribeCustomerRides =
            null;

        }


        if (
          unsubscribeCaptainHistory
        ) {

          unsubscribeCaptainHistory();

          unsubscribeCaptainHistory =
            null;

        }


        showScreen(
          "homeScreen"
        );


        showMessage(
          "تم تسجيل الخروج.",
          "success"
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
   AUTH STATE
   ====================================================== */

onAuthStateChanged(
  auth,
  async user => {

    currentUser =
      user;


    if (!user) {

      currentRole =
        "customer";

      currentProfile =
        null;

      return;

    }


    try {

      await loadProfile();

    } catch (error) {

      console.error(error);

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
