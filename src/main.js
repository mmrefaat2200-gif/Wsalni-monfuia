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
  serverTimestamp,
  query,
  where,
  orderBy,
  onSnapshot
} from "firebase/firestore";

import {
  getCurrentPosition,
  checkPermissions,
  requestPermissions
} from "@capacitor/geolocation";


// =====================================================
// FIREBASE
// =====================================================

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const firebaseApp =
  initializeApp(firebaseConfig);

const auth =
  getAuth(firebaseApp);

const db =
  getFirestore(firebaseApp);


// =====================================================
// VARIABLES
// =====================================================

let currentUser = null;

let currentRole = "customer";

let pickupCoords = null;

let destinationCoords = null;

let pickupAddress = "";

let destinationAddress = "";

let tripDistanceKm = 0;

let tripDurationMin = 0;

let map = null;

let pickupMarker = null;

let destinationMarker = null;

let searchTimer = null;

let confirmationResult = null;

let recaptchaVerifier = null;

let captainUnsubscribe = null;


// =====================================================
// APP
// =====================================================

const app = document.querySelector("#app");

app.innerHTML = `

<div class="app">

<header class="header">

  <div class="logo">
    🚕
    <span>وصلني المنوفية</span>
  </div>

  <button
    id="profileBtn"
    class="icon-button"
    type="button"
  >
    👤
  </button>

</header>


<div
  id="messageBox"
  class="message-box"
  style="display:none"
></div>


<!-- ========================================= -->
<!-- HOME -->
<!-- ========================================= -->

<section
  id="homeScreen"
  class="screen active"
>

  <div class="hero">

    <h1>
      اطلب رحلتك 🚕
    </h1>

    <p>
      حدد مكان الالتقاء ومكان النزول.
    </p>

  </div>


  <!-- PICKUP -->

  <div class="card">

    <label>
      📍 مكان الالتقاء
    </label>

    <button
      id="pickupBtn"
      class="btn primary"
      type="button"
    >
      📍 حدد موقعي الحالي
    </button>

    <div
      id="pickupInfo"
      class="status"
    >
      لم يتم تحديد مكان الالتقاء
    </div>

  </div>


  <!-- DESTINATION -->

  <div class="card">

    <label>
      🏁 مكان النزول
    </label>

    <button
      id="destinationBtn"
      class="btn outline"
      type="button"
    >
      🗺️ حدد مكان النزول
    </button>

    <div
      id="destinationInfo"
      class="status"
    >
      لم يتم تحديد مكان النزول
    </div>

  </div>


  <!-- DISTANCE -->

  <div
    id="distanceCard"
    class="card"
    style="display:none"
  >

    <h3>
      📏 تفاصيل الرحلة
    </h3>

    <div class="status">

      المسافة:

      <strong id="distanceValue">
        -
      </strong>

      <br><br>

      الوقت التقريبي:

      <strong id="durationValue">
        -
      </strong>

    </div>

  </div>


  <!-- PASSENGERS -->

  <div class="card">

    <label>
      👥 عدد الركاب
    </label>

    <select
      id="passengerCount"
    >

      <option value="1">
        1 راكب
      </option>

      <option value="2">
        2 ركاب
      </option>

      <option value="3">
        3 ركاب
      </option>

      <option value="4">
        4 ركاب
      </option>

      <option value="5">
        5 ركاب
      </option>

      <option value="6">
        6 ركاب
      </option>

      <option value="7">
        7 ركاب
      </option>

      <option value="8">
        8 ركاب
      </option>

    </select>

  </div>


  <!-- PRICE -->

  <div class="card">

    <label>
      💰 سعر الرحلة
    </label>

    <input
      id="ridePrice"
      type="number"
      min="1"
      inputmode="decimal"
      placeholder="مثال: 100"
    />

  </div>


  <!-- NOTES -->

  <div class="card">

    <label>
      📝 ملاحظات
    </label>

    <textarea
      id="rideNotes"
      rows="4"
      maxlength="500"
      placeholder="مثال: معايا شنطة كبيرة..."
    ></textarea>

  </div>


  <!-- UPLOAD -->

  <button
    id="uploadRideBtn"
    class="btn green"
    type="button"
  >
    🚕 رفع الرحلة
  </button>


  <button
    id="captainBtn"
    class="btn outline"
    type="button"
  >
    🚗 منصة الكباتن
  </button>

</section>


<!-- ========================================= -->
<!-- DESTINATION MAP -->
<!-- ========================================= -->

<section
  id="mapScreen"
  class="screen"
>

  <div class="card">

    <div
      style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:10px;
      "
    >

      <div>

        <h2>
          🏁 حدد مكان النزول
        </h2>

        <small>
          ابحث عن المدينة أو الشارع ثم حدد النقطة بدقة من الخريطة.
        </small>

      </div>

      <button
        id="closeMapBtn"
        class="btn danger"
        type="button"
        style="width:auto"
      >
        إلغاء
      </button>

    </div>

  </div>


  <!-- SEARCH -->

  <div
    class="card"
    style="
      position:relative;
      z-index:1000;
    "
  >

    <label>
      🔎 البحث عن مكان
    </label>

    <div
      style="
        display:flex;
        gap:8px;
      "
    >

      <input
        id="destinationSearch"
        type="search"
        placeholder="اكتب مدينة أو شارع أو مكان"
        autocomplete="off"
        style="flex:1"
      />

      <button
        id="searchDestinationBtn"
        class="btn primary"
        type="button"
        style="
          width:auto;
          white-space:nowrap;
        "
      >
        بحث
      </button>

    </div>


    <div
      id="searchResults"
      style="
        display:none;
        max-height:260px;
        overflow:auto;
        margin-top:10px;
      "
    ></div>

  </div>


  <!-- MAP -->

  <div
    id="mapWrapper"
    style="
      width:100%;
      height:55vh;
      min-height:360px;
      position:relative;
      overflow:hidden;
    "
  >

    <div
      id="map"
      style="
        width:100%;
        height:100%;
      "
    ></div>


    <!-- CENTER PIN -->

    <div
      style="
        position:absolute;
        left:50%;
        top:50%;
        transform:translate(-50%,-100%);
        z-index:500;
        pointer-events:none;
        font-size:44px;
        line-height:1;
        filter:drop-shadow(0 3px 4px #0008);
      "
    >
      📍
    </div>

  </div>


  <!-- SELECTED ADDRESS -->

  <div class="card">

    <div
      id="selectedDestinationAddress"
      class="status"
    >
      حرك الخريطة لتحديد مكان النزول.
    </div>


    <button
      id="confirmDestinationBtn"
      class="btn primary"
      type="button"
    >
      ✅ تأكيد مكان النزول
    </button>

  </div>

</section>


<!-- ========================================= -->
<!-- AUTH -->
<!-- ========================================= -->

<section
  id="authScreen"
  class="screen"
>

  <div class="card">

    <h2>
      📱 تسجيل الدخول
    </h2>

    <p>
      سجل برقم الموبايل عشان تقدر ترفع الرحلة.
    </p>


    <input
      id="phoneInput"
      type="tel"
      placeholder="+201xxxxxxxxx"
    />


    <div id="recaptcha-container"></div>


    <button
      id="sendCodeBtn"
      class="btn primary"
      type="button"
    >
      📱 إرسال كود SMS
    </button>


    <div
      id="verificationBox"
      style="display:none"
    >

      <input
        id="verificationCode"
        type="number"
        placeholder="اكتب كود التحقق"
      />

      <button
        id="verifyCodeBtn"
        class="btn green"
        type="button"
      >
        ✅ تأكيد الكود
      </button>

    </div>


    <div
      id="authStatus"
      class="status"
    ></div>

  </div>

</section>


<!-- ========================================= -->
<!-- CAPTAIN -->
<!-- ========================================= -->

<section
  id="captainScreen"
  class="screen"
>

  <div class="hero">

    <h2>
      🚗 رحلات العملاء
    </h2>

    <p>
      الرحلات المفتوحة تظهر هنا.
    </p>

  </div>


  <div id="captainRides">

    <div class="card">
      جاري تحميل الرحلات...
    </div>

  </div>


  <button
    id="backHomeBtn"
    class="btn outline"
    type="button"
  >
    ← الرئيسية
  </button>

</section>


<!-- ========================================= -->
<!-- PROFILE -->
<!-- ========================================= -->

<section
  id="profileScreen"
  class="screen"
>

  <div class="card">

    <h2>
      👤 حسابي
    </h2>

    <div
      id="profileInfo"
      class="status"
    >
      غير مسجل
    </div>

    <button
      id="logoutBtn"
      class="btn danger"
      type="button"
    >
      تسجيل الخروج
    </button>

  </div>

</section>


<!-- ========================================= -->
<!-- NAV -->
<!-- ========================================= -->

<nav class="nav">

  <button
    id="navHome"
    type="button"
    class="active"
  >
    🏠
    <br>
    الرئيسية
  </button>

  <button
    id="navCaptain"
    type="button"
  >
    🚗
    <br>
    الكباتن
  </button>

  <button
    id="navProfile"
    type="button"
  >
    👤
    <br>
    حسابي
  </button>

</nav>

</div>
`;


// =====================================================
// SHORT SELECTOR
// =====================================================

function $(selector) {
  return document.querySelector(selector);
}


// =====================================================
// ESCAPE HTML
// =====================================================

function escapeHtml(value = "") {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


// =====================================================
// MESSAGE
// =====================================================

function showMessage(
  message,
  type = "info"
) {

  const box =
    $("#messageBox");

  if (!box) return;

  box.textContent =
    message;

  box.className =
    `message-box ${type}`;

  box.style.display =
    "block";

  clearTimeout(
    window.__messageTimer
  );

  window.__messageTimer =
    setTimeout(
      () => {

        box.style.display =
          "none";

      },
      5000
    );

}


// =====================================================
// SCREEN
// =====================================================

function showScreen(
  screenId
) {

  document
    .querySelectorAll(".screen")
    .forEach(
      screen => {

        screen.classList.remove(
          "active"
        );

      }
    );


  const screen =
    document.getElementById(
      screenId
    );


  if (screen) {

    screen.classList.add(
      "active"
    );

  }


  document
    .querySelectorAll(".nav button")
    .forEach(
      button => {

        button.classList.remove(
          "active"
        );

      }
    );


  if (
    screenId ===
    "homeScreen"
  ) {

    $("#navHome")
      ?.classList
      .add("active");

  }


  if (
    screenId ===
    "captainScreen"
  ) {

    $("#navCaptain")
      ?.classList
      .add("active");

  }


  if (
    screenId ===
    "profileScreen"
  ) {

    $("#navProfile")
      ?.classList
      .add("active");

  }

}


// =====================================================
// HIGH ACCURACY GPS
// =====================================================

async function getPreciseLocation() {

  let nativeError =
    null;


  // -------------------------------
  // Capacitor Android GPS
  // -------------------------------

  try {

    let permissions =
      await checkPermissions();


    if (
      permissions.location !==
      "granted"
    ) {

      permissions =
        await requestPermissions();

    }


    if (
      permissions.location ===
      "granted"
    ) {

      const position =
        await getCurrentPosition({

          enableHighAccuracy:
            true,

          timeout:
            30000,

          maximumAge:
            0

        });


      return {

        lat:
          position.coords.latitude,

        lng:
          position.coords.longitude,

        accuracy:
          position.coords.accuracy

      };

    }

  } catch (error) {

    nativeError =
      error;

    console.log(
      "Native GPS error:",
      error
    );

  }


  // -------------------------------
  // Browser fallback
  // -------------------------------

  try {

    if (
      navigator.geolocation
    ) {

      return await new Promise(
        (
          resolve,
          reject
        ) => {

          navigator.geolocation
            .getCurrentPosition(

              position => {

                resolve({

                  lat:
                    position.coords.latitude,

                  lng:
                    position.coords.longitude,

                  accuracy:
                    position.coords.accuracy

                });

              },

              error => {

                reject(error);

              },

              {

                enableHighAccuracy:
                  true,

                timeout:
                  30000,

                maximumAge:
                  0

              }

            );

        }
      );

    }

  } catch (error) {

    nativeError =
      error;

  }


  throw (
    nativeError ||
    new Error(
      "GPS unavailable"
    )
  );

}


// =====================================================
// REVERSE GEOCODE
// =====================================================

async function reverseGeocode(
  lat,
  lng
) {

  try {

    const url =
      "https://nominatim.openstreetmap.org/reverse" +
      `?format=jsonv2` +
      `&lat=${encodeURIComponent(lat)}` +
      `&lon=${encodeURIComponent(lng)}` +
      `&zoom=18` +
      `&addressdetails=1` +
      `&accept-language=ar`;


    const response =
      await fetch(
        url
      );


    if (!response.ok) {

      throw new Error(
        "Reverse geocoding failed"
      );

    }


    const data =
      await response.json();


    if (
      data.display_name
    ) {

      return data.display_name;

    }

  } catch (error) {

    console.log(
      "Reverse geocode error:",
      error
    );

  }


  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

}


// =====================================================
// PICKUP CURRENT LOCATION
// =====================================================

$("#pickupBtn")
  .addEventListener(
    "click",
    async () => {

      const button =
        $("#pickupBtn");


      button.disabled =
        true;


      button.textContent =
        "📍 جاري تحديد موقعك بدقة...";


      try {

        const location =
          await getPreciseLocation();


        pickupCoords = {

          lat:
            location.lat,

          lng:
            location.lng

        };


        pickupAddress =
          await reverseGeocode(

            location.lat,

            location.lng

          );


        $("#pickupInfo")
          .innerHTML = `

            📍

            <strong>
              ${escapeHtml(
                pickupAddress
              )}
            </strong>

            <br>

            <small>
              دقة تحديد الموقع:
              ${Math.round(
                location.accuracy
              )}
              متر
            </small>

          `;


        showMessage(
          "تم تحديد مكان الالتقاء الحالي بدقة ✅",
          "success"
        );


        await calculateRoute();

      } catch (error) {

        console.error(
          error
        );


        showMessage(
          "لم نتمكن من تحديد موقعك. وافق على إذن الموقع من أندرويد ثم حاول مرة أخرى.",
          "error"
        );


        $("#pickupInfo")
          .textContent =
          "لم يتم تحديد مكان الالتقاء";

      }


      button.disabled =
        false;


      button.textContent =
        "📍 حدد موقعي الحالي";

    }
  );


// =====================================================
// OPEN DESTINATION MAP
// =====================================================

$("#destinationBtn")
  .addEventListener(
    "click",
    () => {

      showScreen(
        "mapScreen"
      );


      setTimeout(
        initializeDestinationMap,
        250
      );

    }
  );


// =====================================================
// INITIALIZE LEAFLET MAP
// =====================================================

async function initializeDestinationMap() {

  if (
    typeof L ===
    "undefined"
  ) {

    showMessage(
      "Leaflet غير محملة. تأكد أن index.html فيه ملف Leaflet.",
      "error"
    );

    return;

  }


  if (map) {

    map.remove();

    map =
      null;

  }


  let centerLat =
    30.5526;

  let centerLng =
    31.0106;

  let zoom =
    11;


  if (
    destinationCoords
  ) {

    centerLat =
      destinationCoords.lat;

    centerLng =
      destinationCoords.lng;

    zoom =
      18;

  } else if (
    pickupCoords
  ) {

    centerLat =
      pickupCoords.lat;

    centerLng =
      pickupCoords.lng;

    zoom =
      17;

  }


  map =
    L.map(
      "map",
      {

        zoomControl:
          true,

        attributionControl:
          true

      }
    );


  map.setView(
    [
      centerLat,
      centerLng
    ],
    zoom
  );


  // OpenStreetMap

  L.tileLayer(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {

      maxZoom:
        19,

      attribution:
        "&copy; OpenStreetMap contributors"

    }
  )
  .addTo(map);


  // --------------------------------------------
  // Pickup marker
  // --------------------------------------------

  if (
    pickupCoords
  ) {

    pickupMarker =
      L.marker(
        [
          pickupCoords.lat,
          pickupCoords.lng
        ]
      )
      .addTo(map)
      .bindPopup(
        "📍 مكان الالتقاء"
      );

  }


  // --------------------------------------------
  // Destination marker
  // --------------------------------------------

  if (
    destinationCoords
  ) {

    destinationMarker =
      L.marker(
        [
          destinationCoords.lat,
          destinationCoords.lng
        ]
      )
      .addTo(map)
      .bindPopup(
        "🏁 مكان النزول"
      );

  }


  // --------------------------------------------
  // Initial center address
  // --------------------------------------------

  await updateDestinationFromCenter();


  // --------------------------------------------
  // User moves map
  // --------------------------------------------

  map.on(
    "moveend",
    async () => {

      await updateDestinationFromCenter();

    }
  );


  setTimeout(
    () => {

      map.invalidateSize();

    },
    400
  );

}


// =====================================================
// UPDATE DESTINATION FROM CENTER
// =====================================================

async function updateDestinationFromCenter() {

  if (!map) return;


  const center =
    map.getCenter();


  const lat =
    center.lat;


  const lng =
    center.lng;


  destinationCoords = {

    lat,
    lng

  };


  $("#selectedDestinationAddress")
    .innerHTML = `

      📍 جاري تحديد العنوان...

      <br>

      <small>
        ${lat.toFixed(6)},
        ${lng.toFixed(6)}
      </small>

    `;


  if (
    destinationMarker
  ) {

    destinationMarker.setLatLng(
      [
        lat,
        lng
      ]
    );

  } else {

    destinationMarker =
      L.marker(
        [
          lat,
          lng
        ]
      )
      .addTo(map)
      .bindPopup(
        "🏁 مكان النزول"
      );

  }


  const address =
    await reverseGeocode(
      lat,
      lng
    );


  destinationAddress =
    address;


  $("#selectedDestinationAddress")
    .innerHTML = `

      🏁

      <strong>
        ${escapeHtml(
          address
        )}
      </strong>

      <br><br>

      <small>
        حرك الخريطة بحيث الدبوس الموجود في المنتصف يكون على المكان بالظبط.
      </small>

    `;

}


// =====================================================
// SEARCH BUTTON
// =====================================================

$("#searchDestinationBtn")
  .addEventListener(
    "click",
    async () => {

      const text =
        $("#destinationSearch")
          .value
          .trim();


      if (
        text.length < 2
      ) {

        showMessage(
          "اكتب اسم مدينة أو شارع أو مكان.",
          "error"
        );

        return;

      }


      await searchDestination(
        text
      );

    }
  );


// =====================================================
// SEARCH BY ENTER
// =====================================================

$("#destinationSearch")
  .addEventListener(
    "keydown",
    event => {

      if (
        event.key ===
        "Enter"
      ) {

        event.preventDefault();

        $("#searchDestinationBtn")
          .click();

      }

    }
  );


// =====================================================
// SEARCH NOMINATIM
// =====================================================

async function searchDestination(
  text
) {

  const resultsBox =
    $("#searchResults");


  resultsBox.style.display =
    "block";


  resultsBox.innerHTML = `

    <div
      class="card"
      style="margin:0"
    >
      🔎 جاري البحث...
    </div>

  `;


  try {

    const url =
      "https://nominatim.openstreetmap.org/search" +
      `?format=jsonv2` +
      `&q=${encodeURIComponent(text)}` +
      `&countrycodes=eg` +
      `&limit=8` +
      `&addressdetails=1` +
      `&accept-language=ar`;


    const response =
      await fetch(
        url
      );


    if (!response.ok) {

      throw new Error(
        "Search failed"
      );

    }


    const results =
      await response.json();


    if (
      !results.length
    ) {

      resultsBox.innerHTML = `

        <div
          class="card"
          style="margin:0"
        >
          ❌ مش لاقي المكان.
          جرب تكتب اسم المدينة أو الشارع بطريقة مختلفة.
        </div>

      `;

      return;

    }


    resultsBox.innerHTML =
      results
        .map(
          (
            item,
            index
          ) => `

            <button
              type="button"
              class="search-result"
              data-index="${index}"
              style="
                display:block;
                width:100%;
                text-align:right;
                background:#fff;
                border:1px solid #ddd;
                border-radius:12px;
                padding:13px;
                margin-bottom:7px;
                cursor:pointer;
              "
            >

              📍

              <strong>
                ${escapeHtml(
                  item.display_name
                )}
              </strong>

            </button>

          `
        )
        .join("");


    resultsBox
      .querySelectorAll(
        ".search-result"
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            () => {

              const item =
                results[
                  Number(
                    button.dataset
                      .index
                  )
                ];


              chooseSearchResult(
                item
              );

            }
          );

        }
      );

  } catch (error) {

    console.error(
      error
    );


    resultsBox.innerHTML = `

      <div
        class="card"
        style="margin:0"
      >
        ⚠️ حصل خطأ في البحث.
        حاول مرة أخرى.
      </div>

    `;

  }

}


// =====================================================
// CHOOSE SEARCH RESULT
// =====================================================

function chooseSearchResult(
  item
) {

  const lat =
    Number(
      item.lat
    );


  const lng =
    Number(
      item.lon
    );


  destinationCoords = {

    lat,
    lng

  };


  destinationAddress =
    item.display_name;


  $("#destinationSearch")
    .value =
    item.display_name;


  $("#searchResults")
    .style
    .display =
    "none";


  if (map) {

    map.setView(
      [
        lat,
        lng
      ],
      18
    );

  }


  $("#selectedDestinationAddress")
    .innerHTML = `

      🏁

      <strong>
        ${escapeHtml(
          destinationAddress
        )}
      </strong>

      <br><br>

      <small>
        دلوقتي حرك الخريطة لو عايز تحدد الشارع أو النقطة بدقة أكبر.
      </small>

    `;

}


// =====================================================
// CONFIRM DESTINATION
// =====================================================

$("#confirmDestinationBtn")
  .addEventListener(
    "click",
    async () => {

      if (
        !destinationCoords
      ) {

        showMessage(
          "حدد مكان النزول الأول.",
          "error"
        );

        return;

      }


      if (
        !destinationAddress
      ) {

        destinationAddress =
          await reverseGeocode(

            destinationCoords.lat,

            destinationCoords.lng

          );

      }


      $("#destinationInfo")
        .innerHTML = `

          🏁

          <strong>
            ${escapeHtml(
              destinationAddress
            )}
          </strong>

        `;


      showScreen(
        "homeScreen"
      );


      showMessage(
        "تم تحديد مكان النزول ✅",
        "success"
      );


      await calculateRoute();

    }
  );


// =====================================================
// CLOSE MAP
// =====================================================

$("#closeMapBtn")
  .addEventListener(
    "click",
    () => {

      showScreen(
        "homeScreen"
      );

    }
  );


// =====================================================
// CALCULATE ROAD DISTANCE
// =====================================================

async function calculateRoute() {

  if (
    !pickupCoords ||
    !destinationCoords
  ) {

    return;

  }


  $("#distanceCard")
    .style
    .display =
    "block";


  $("#distanceValue")
    .textContent =
    "جاري الحساب...";


  $("#durationValue")
    .textContent =
    "جاري الحساب...";


  try {

    const url =
      "https://router.project-osrm.org/route/v1/driving/" +

      `${pickupCoords.lng},${pickupCoords.lat};` +

      `${destinationCoords.lng},${destinationCoords.lat}` +

      "?overview=false&steps=false";


    const response =
      await fetch(
        url
      );


    if (!response.ok) {

      throw new Error(
        "OSRM request failed"
      );

    }


    const data =
      await response.json();


    if (
      data.code !==
      "Ok" ||
      !data.routes ||
      !data.routes.length
    ) {

      throw new Error(
        "No route"
      );

    }


    const route =
      data.routes[0];


    tripDistanceKm =
      route.distance /
      1000;


    tripDurationMin =
      route.duration /
      60;


    $("#distanceValue")
      .textContent =
      `${tripDistanceKm.toFixed(1)} كم`;


    $("#durationValue")
      .textContent =
      `${Math.round(
        tripDurationMin
      )} دقيقة تقريبًا`;

  } catch (error) {

    console.error(
      "Route error:",
      error
    );


    // -----------------------------------------
    // fallback straight line
    // -----------------------------------------

    tripDistanceKm =
      calculateStraightDistance(

        pickupCoords.lat,

        pickupCoords.lng,

        destinationCoords.lat,

        destinationCoords.lng

      );


    tripDurationMin =
      0;


    $("#distanceValue")
      .textContent =
      `${tripDistanceKm.toFixed(1)} كم تقريبًا`;


    $("#durationValue")
      .textContent =
      "غير متاح";

  }

}


// =====================================================
// STRAIGHT DISTANCE
// =====================================================

function calculateStraightDistance(
  lat1,
  lon1,
  lat2,
  lon2
) {

  const R =
    6371;


  const dLat =
    (
      lat2 -
      lat1
    ) *
    Math.PI /
    180;


  const dLon =
    (
      lon2 -
      lon1
    ) *
    Math.PI /
    180;


  const a =
    Math.sin(
      dLat / 2
    ) ** 2 +

    Math.cos(
      lat1 *
      Math.PI /
      180
    ) *

    Math.cos(
      lat2 *
      Math.PI /
      180
    ) *

    Math.sin(
      dLon / 2
    ) ** 2;


  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(
        1 - a
      )
    );


  return R * c;

}


// =====================================================
// UPLOAD RIDE
// =====================================================

$("#uploadRideBtn")
  .addEventListener(
    "click",
    async () => {

      if (
        !currentUser
      ) {

        showMessage(
          "لازم تسجل دخول الأول.",
          "error"
        );

        showScreen(
          "authScreen"
        );

        return;

      }


      if (
        currentRole ===
        "captain"
      ) {

        showMessage(
          "حساب الكابتن لا يستطيع رفع رحلة عميل.",
          "error"
        );

        return;

      }


      if (
        !pickupCoords
      ) {

        showMessage(
          "حدد مكان الالتقاء الأول.",
          "error"
        );

        return;

      }


      if (
        !destinationCoords
      ) {

        showMessage(
          "حدد مكان النزول الأول.",
          "error"
        );

        return;

      }


      const price =
        Number(
          $("#ridePrice")
            .value
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
        );


      const notes =
        $("#rideNotes")
          .value
          .trim();


      const button =
        $("#uploadRideBtn");


      button.disabled =
        true;


      button.textContent =
        "⏳ جاري رفع الرحلة...";


      try {

        if (
          !pickupAddress
        ) {

          pickupAddress =
            await reverseGeocode(

              pickupCoords.lat,

              pickupCoords.lng

            );

        }


        if (
          !destinationAddress
        ) {

          destinationAddress =
            await reverseGeocode(

              destinationCoords.lat,

              destinationCoords.lng

            );

        }


        await calculateRoute();


        const ride = {

          userId:
            currentUser.uid,

          customerPhone:
            currentUser.phoneNumber ||
            "",

          from:
            pickupAddress,

          to:
            destinationAddress,

          pickupCoords: {

            lat:
              pickupCoords.lat,

            lng:
              pickupCoords.lng

          },

          destinationCoords: {

            lat:
              destinationCoords.lat,

            lng:
              destinationCoords.lng

          },

          distanceKm:
            Number(
              tripDistanceKm.toFixed(2)
            ),

          durationMin:
            Math.round(
              tripDurationMin
            ),

          price:

            price,

          passengerCount:

            passengerCount,

          notes:

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


        console.log(
          "Ride created:",
          rideRef.id
        );


        showMessage(
          "تم رفع الرحلة للكباتن بنجاح 🚕✅",
          "success"
        );


        // -----------------------------------
        // RESET
        // -----------------------------------

        pickupCoords =
          null;

        destinationCoords =
          null;

        pickupAddress =
          "";

        destinationAddress =
          "";

        tripDistanceKm =
          0;

        tripDurationMin =
          0;


        $("#pickupInfo")
          .textContent =
          "لم يتم تحديد مكان الالتقاء";


        $("#destinationInfo")
          .textContent =
          "لم يتم تحديد مكان النزول";


        $("#distanceCard")
          .style
          .display =
          "none";


        $("#ridePrice")
          .value =
          "";


        $("#rideNotes")
          .value =
          "";


        $("#passengerCount")
          .value =
          "1";


        showScreen(
          "homeScreen"
        );

      } catch (error) {

        console.error(
          error
        );


        showMessage(
          "حصل خطأ أثناء رفع الرحلة.",
          "error"
        );

      }


      button.disabled =
        false;


      button.textContent =
        "🚕 رفع الرحلة";

    }
  );


// =====================================================
// SEND SMS
// =====================================================

$("#sendCodeBtn")
  .addEventListener(
    "click",
    async () => {

      const phone =
        $("#phoneInput")
          .value
          .trim();


      if (
        !phone
      ) {

        $("#authStatus")
          .textContent =
          "اكتب رقم الموبايل.";

        return;

      }


      const button =
        $("#sendCodeBtn");


      button.disabled =
        true;


      button.textContent =
        "⏳ جاري الإرسال...";


      try {

        if (
          !recaptchaVerifier
        ) {

          recaptchaVerifier =
            new RecaptchaVerifier(
              auth,
              "recaptcha-container",
              {
                size:
                  "normal"
              }
            );

        }


        confirmationResult =
          await signInWithPhoneNumber(

            auth,

            phone,

            recaptchaVerifier

          );


        $("#verificationBox")
          .style
          .display =
          "block";


        $("#authStatus")
          .textContent =
          "تم إرسال كود SMS.";

      } catch (error) {

        console.error(
          error
        );


        $("#authStatus")
          .textContent =
          "فشل إرسال الكود. تأكد من إعداد Firebase.";

      }


      button.disabled =
        false;


      button.textContent =
        "📱 إرسال كود SMS";

    }
  );


// =====================================================
// VERIFY SMS
// =====================================================

$("#verifyCodeBtn")
  .addEventListener(
    "click",
    async () => {

      if (
        !confirmationResult
      ) {

        return;

      }


      const code =
        $("#verificationCode")
          .value
          .trim();


      if (
        !code
      ) {

        return;

      }


      try {

        await confirmationResult
          .confirm(
            code
          );


        showMessage(
          "تم تسجيل الدخول بنجاح ✅",
          "success"
        );


        showScreen(
          "homeScreen"
        );

      } catch (error) {

        console.error(
          error
        );


        $("#authStatus")
          .textContent =
          "الكود غير صحيح.";

      }

    }
  );


// =====================================================
// AUTH STATE
// =====================================================

onAuthStateChanged(
  auth,
  async user => {

    currentUser =
      user;


    if (!user) {

      currentRole =
        "customer";

      $("#profileInfo")
        .textContent =
        "غير مسجل";

      return;

    }


    try {

      const userRef =
        doc(
          db,
          "users",
          user.uid
        );


      const userSnap =
        await getDoc(
          userRef
        );


      if (
        userSnap.exists()
      ) {

        const data =
          userSnap.data();


        currentRole =
          data.role ||
          "customer";


        $("#profileInfo")
          .innerHTML = `

            👤

            <strong>
              ${escapeHtml(
                data.name ||
                "مستخدم"
              )}
            </strong>

            <br><br>

            📱

            ${escapeHtml(
              user.phoneNumber ||
              ""
            )}

            <br><br>

            الحساب:

            ${
              currentRole ===
              "captain"
                ? "🚗 كابتن"
                : "👤 عميل"
            }

          `;

      } else {

        await setDoc(

          userRef,

          {

            phone:
              user.phoneNumber ||
              "",

            role:
              "customer",

            createdAt:
              serverTimestamp()

          },

          {
            merge:
              true
          }

        );

      }

    } catch (error) {

      console.error(
        error
      );

    }

  }
);


// =====================================================
// PROFILE
// =====================================================

$("#profileBtn")
  .addEventListener(
    "click",
    () => {

      showScreen(
        "profileScreen"
      );

    }
  );


$("#navProfile")
  .addEventListener(
    "click",
    () => {

      showScreen(
        "profileScreen"
      );

    }
  );


// =====================================================
// HOME
// =====================================================

$("#navHome")
  .addEventListener(
    "click",
    () => {

      showScreen(
        "homeScreen"
      );

    }
  );


// =====================================================
// LOGOUT
// =====================================================

$("#logoutBtn")
  .addEventListener(
    "click",
    async () => {

      try {

        await signOut(
          auth
        );


        showMessage(
          "تم تسجيل الخروج.",
          "success"
        );


        showScreen(
          "homeScreen"
        );

      } catch (error) {

        console.error(
          error
        );

      }

    }
  );


// =====================================================
// CAPTAIN SCREEN
// =====================================================

$("#captainBtn")
  .addEventListener(
    "click",
    () => {

      if (
        !currentUser
      ) {

        showScreen(
          "authScreen"
        );

        return;

      }


      showScreen(
        "captainScreen"
      );


      loadCaptainRides();

    }
  );


$("#navCaptain")
  .addEventListener(
    "click",
    () => {

      if (
        !currentUser
      ) {

        showScreen(
          "authScreen"
        );

        return;

      }


      showScreen(
        "captainScreen"
      );


      loadCaptainRides();

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


// =====================================================
// CAPTAIN RIDES
// =====================================================

function loadCaptainRides() {

  const container =
    $("#captainRides");


  if (
    captainUnsubscribe
  ) {

    captainUnsubscribe();

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
      )

    );


  captainUnsubscribe =
    onSnapshot(

      ridesQuery,

      snapshot => {

        if (
          snapshot.empty
        ) {

          container.innerHTML = `

            <div class="card">

              لا توجد رحلات مفتوحة حالياً.

            </div>

          `;

          return;

        }


        container.innerHTML =
          snapshot.docs
            .map(
              docSnap => {

                const ride =
                  docSnap.data();


                return `

                  <div
                    class="card"
                    style="
                      margin-bottom:12px;
                    "
                  >

                    <h3>
                      🚕 رحلة جديدة
                    </h3>

                    <p>
                      📍
                      ${escapeHtml(
                        ride.from ||
                        ""
                      )}
                    </p>

                    <p>
                      🏁
                      ${escapeHtml(
                        ride.to ||
                        ""
                      )}
                    </p>

                    <p>
                      📏
                      ${
                        ride.distanceKm ||
                        "-"
                      }
                      كم
                    </p>

                    <p>
                      👥
                      ${
                        ride.passengerCount ||
                        1
                      }
                      راكب
                    </p>

                    <p>
                      💰
                      السعر المقترح:
                      <strong>
                        ${
                          ride.price ||
                          "-"
                        }
                        جنيه
                      </strong>
                    </p>

                    ${
                      ride.notes
                        ? `
                          <p>
                            📝
                            ${escapeHtml(
                              ride.notes
                            )}
                          </p>
                        `
                        : ""
                    }

                  </div>

                `;

              }
            )
            .join("");

      },

      error => {

        console.error(
          error
        );


        container.innerHTML = `

          <div class="card">

            حصل خطأ في تحميل الرحلات.

          </div>

        `;

      }

    );

}


// =====================================================
// START
// =====================================================

showScreen(
  "homeScreen"
);
