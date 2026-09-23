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


// ======================================================
// FIREBASE
// ======================================================

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const firebaseApp =
  initializeApp(firebaseConfig);

const auth =
  getAuth(firebaseApp);

const db =
  getFirestore(firebaseApp);


// ======================================================
// STATE
// ======================================================

let currentUser = null;

let currentRole = "customer";

let selectedPickup = "";

let selectedDestination = "";

let selectedPickupCoords = null;

let selectedDestinationCoords = null;

let recaptcha = null;

let confirmationResult = null;

let unsubscribeCaptainRides = null;

let map = null;

let destinationMarker = null;

let mapMode = "destination";

let googleMapsPromise = null;


// ======================================================
// HELPERS
// ======================================================

const $ = selector =>
  document.querySelector(selector);


function escapeHtml(value = "") {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


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
    setTimeout(() => {

      box.style.display =
        "none";

    }, 5000);

}


// ======================================================
// GOOGLE MAPS
// ======================================================

function loadGoogleMaps() {

  if (
    window.google &&
    window.google.maps
  ) {

    return Promise.resolve(
      window.google
    );

  }


  if (googleMapsPromise) {

    return googleMapsPromise;

  }


  googleMapsPromise =
    new Promise(
      (resolve, reject) => {

        const apiKey =
          import.meta.env
            .VITE_GOOGLE_MAPS_API_KEY;


        if (!apiKey) {

          reject(
            new Error(
              "VITE_GOOGLE_MAPS_API_KEY غير موجود"
            )
          );

          return;

        }


        const oldScript =
          document.getElementById(
            "google-maps-script"
          );


        if (oldScript) {

          const timer =
            setInterval(() => {

              if (
                window.google &&
                window.google.maps
              ) {

                clearInterval(
                  timer
                );

                resolve(
                  window.google
                );

              }

            }, 100);


          setTimeout(() => {

            clearInterval(
              timer
            );

            if (
              !window.google ||
              !window.google.maps
            ) {

              reject(
                new Error(
                  "Google Maps لم يتم تحميلها"
                )
              );

            }

          }, 15000);


          return;

        }


        const script =
          document.createElement(
            "script"
          );


        script.id =
          "google-maps-script";


        script.src =
          "https://maps.googleapis.com/maps/api/js" +
          "?key=" +
          encodeURIComponent(
            apiKey
          ) +
          "&libraries=places" +
          "&v=weekly";


        script.async =
          true;

        script.defer =
          true;


        script.onload =
          () => {

            if (
              window.google &&
              window.google.maps
            ) {

              resolve(
                window.google
              );

            } else {

              reject(
                new Error(
                  "Google Maps API غير متاحة"
                )
              );

            }

          };


        script.onerror =
          () => {

            reject(
              new Error(
                "فشل تحميل Google Maps"
              )
            );

          };


        document.head.appendChild(
          script
        );

      }
    );


  return googleMapsPromise;

}


// ======================================================
// MAIN HTML
// ======================================================

const appElement =
  $("#app");


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


  <!-- ================================================= -->
  <!-- HOME -->
  <!-- ================================================= -->

  <section
    id="homeScreen"
    class="screen active"
  >

    <div class="hero">

      <h1>
        اطلب رحلتك بسهولة 🚕
      </h1>

      <p>
        حدد مكان الانطلاق والوصول والسعر المناسب لك.
      </p>

    </div>


    <!-- PICKUP -->

    <div class="card">

      <label>
        📍 مكان الانطلاق
      </label>

      <button
        id="fromPlace"
        class="btn outline"
        type="button"
      >
        📍 استخدم موقعي الحالي
      </button>

      <div
        id="pickupInfo"
        class="status"
      >
        لم يتم تحديد مكان الانطلاق
      </div>

    </div>


    <!-- DESTINATION -->

    <div class="card">

      <label>
        🏁 مكان النزول
      </label>

      <button
        id="toPlace"
        class="btn outline"
        type="button"
      >
        🗺️ حدد مكان النزول على الخريطة
      </button>

      <div
        id="destinationInfo"
        class="status"
      >
        لم يتم تحديد مكان الوصول
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


    <!-- NOTES -->

    <div class="card">

      <label>
        📝 ملاحظات للرحلة
      </label>

      <textarea
        id="rideNotes"
        rows="4"
        maxlength="500"
        placeholder="مثال: معايا شنطة كبيرة، محتاج عربية واسعة، أو أي ملاحظة للكابتن..."
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
        placeholder="مثال: 100"
      />

      <small>
        اكتب السعر الذي تريد عرضه على الكباتن.
      </small>

    </div>


    <!-- REQUEST -->

    <button
      id="requestBtn"
      class="btn primary"
      type="button"
    >
      🚕 اطلب الرحلة
    </button>


    <button
      id="captainBtn"
      class="btn green"
      type="button"
    >
      🚗 دخول منصة الكباتن
    </button>

  </section>


  <!-- ================================================= -->
  <!-- MAP -->
  <!-- ================================================= -->

  <section
    id="mapScreen"
    class="screen"
  >

    <div class="card">

      <div class="switch">

        <div>

          <h2>
            🏁 حدد مكان النزول
          </h2>

          <small>
            حرك الخريطة حتى يكون الدبوس على المكان المطلوب.
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


    <div
      id="mapContainer"
      class="map"
      style="position:relative"
    >

      <div
        id="map"
        style="
          height:100%;
          width:100%;
        "
      ></div>


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
          filter:drop-shadow(0 3px 3px #0005);
        "
      >
        📍
      </div>

    </div>


    <div class="card">

      <div
        id="mapSelectedAddress"
        class="status"
      >
        جاري تحميل الخريطة...
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


  <!-- ================================================= -->
  <!-- AUTH -->
  <!-- ================================================= -->

  <section
    id="authScreen"
    class="screen"
  >

    <div class="card">

      <div class="avatar">
        📱
      </div>

      <h2>
        تسجيل الدخول
      </h2>

      <p class="muted">
        سجل برقم هاتفك عشان تقدر تطلب أو تقبل الرحلات.
      </p>


      <input
        id="phone"
        type="tel"
        placeholder="+201xxxxxxxxx"
      />


      <div id="recaptcha"></div>


      <button
        id="sendCodeBtn"
        class="btn primary"
        type="button"
      >
        إرسال كود التحقق
      </button>


      <div
        id="codeSection"
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
          تأكيد الكود
        </button>

      </div>


      <div
        id="authMsg"
        class="status"
      ></div>

    </div>

  </section>


  <!-- ================================================= -->
  <!-- CAPTAIN -->
  <!-- ================================================= -->

  <section
    id="captainScreen"
    class="screen"
  >

    <div class="hero">

      <h2>
        منصة الكباتن 🚗
      </h2>

      <p>
        الرحلات المفتوحة تظهر هنا ويمكنك تقديم سعرك.
      </p>

    </div>


    <div
      id="captainRides"
      class="rides-list"
    >

      <div class="card">
        لا توجد رحلات حالياً
      </div>

    </div>


    <button
      id="backHomeBtn"
      class="btn outline"
      type="button"
    >
      ← العودة للعميل
    </button>

  </section>


  <!-- ================================================= -->
  <!-- PROFILE -->
  <!-- ================================================= -->

  <section
    id="profileScreen"
    class="screen"
  >

    <div class="card">

      <div class="avatar">
        👤
      </div>

      <h2>
        حسابي
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


  <!-- ================================================= -->
  <!-- NAV -->
  <!-- ================================================= -->

  <nav class="nav">

    <button
      id="navHome"
      class="active"
      type="button"
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
      الكابتن
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


// ======================================================
// NAVIGATION
// ======================================================

function showScreen(
  screenId
) {

  document
    .querySelectorAll(".screen")
    .forEach(screen => {

      screen.classList.remove(
        "active"
      );

    });


  const screen =
    $(`#${screenId}`);


  if (screen) {

    screen.classList.add(
      "active"
    );

  }


  document
    .querySelectorAll(".nav button")
    .forEach(button => {

      button.classList.remove(
        "active"
      );

    });


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


// ======================================================
// UPDATE LOCATION
// ======================================================

function updateLocationFields() {

  const pickupInfo =
    $("#pickupInfo");


  const destinationInfo =
    $("#destinationInfo");


  if (pickupInfo) {

    pickupInfo.innerHTML =
      selectedPickup
        ? `
          📍
          <strong>
            ${escapeHtml(
              selectedPickup
            )}
          </strong>
        `
        : "لم يتم تحديد مكان الانطلاق";

  }


  if (destinationInfo) {

    destinationInfo.innerHTML =
      selectedDestination
        ? `
          🏁
          <strong>
            ${escapeHtml(
              selectedDestination
            )}
          </strong>
        `
        : "لم يتم تحديد مكان الوصول";

  }

}


// ======================================================
// CURRENT LOCATION
// ======================================================

function getCurrentLocation() {

  if (
    !("geolocation" in navigator)
  ) {

    showMessage(
      "الجهاز لا يدعم تحديد الموقع.",
      "error"
    );

    return;

  }


  const button =
    $("#fromPlace");


  button.disabled =
    true;


  button.textContent =
    "📍 جاري تحديد موقعك...";


  showMessage(
    "جاري تحديد موقعك الحالي...",
    "info"
  );


  navigator.geolocation.getCurrentPosition(

    async position => {

      const lat =
        position.coords.latitude;


      const lng =
        position.coords.longitude;


      selectedPickupCoords = {
        lat,
        lng
      };


      selectedPickup =
        `موقعك الحالي (${lat.toFixed(6)}, ${lng.toFixed(6)})`;


      updateLocationFields();


      /*
       * محاولة جلب اسم العنوان.
       */

      try {

        await loadGoogleMaps();


        const geocoder =
          new google.maps.Geocoder();


        const result =
          await geocoder.geocode({

            location: {
              lat,
              lng
            }

          });


        if (
          result.results &&
          result.results.length
        ) {

          selectedPickup =
            result.results[0]
              .formatted_address;


          updateLocationFields();

        }

      } catch (error) {

        console.warn(
          error
        );

      }


      showMessage(
        "تم تحديد موقعك بنجاح 📍",
        "success"
      );


      button.disabled =
        false;


      button.textContent =
        "📍 تم تحديد موقعي";

    },


    error => {

      console.error(
        error
      );


      let message =
        "لم نتمكن من تحديد موقعك.";


      if (
        error.code ===
        error.PERMISSION_DENIED
      ) {

        message =
          "تم رفض إذن الموقع. اسمح للتطبيق باستخدام موقعك من إعدادات الهاتف.";

      }


      if (
        error.code ===
        error.POSITION_UNAVAILABLE
      ) {

        message =
          "موقع الهاتف غير متاح حالياً. تأكد من تشغيل GPS.";

      }


      if (
        error.code ===
        error.TIMEOUT
      ) {

        message =
          "تحديد الموقع أخذ وقتاً طويلاً. حاول مرة أخرى.";

      }


      showMessage(
        message,
        "error"
      );


      button.disabled =
        false;


      button.textContent =
        "📍 حاول مرة أخرى";

    },


    {

      enableHighAccuracy:
        true,

      timeout:
        20000,

      maximumAge:
        0

    }

  );

}


// ======================================================
// DESTINATION MAP
// ======================================================

async function openDestinationMap() {

  mapMode =
    "destination";


  showScreen(
    "mapScreen"
  );


  $("#confirmDestinationBtn")
    .style
    .display =
    "block";


  $("#closeMapBtn")
    .textContent =
    "إلغاء";


  $("#mapSelectedAddress")
    .textContent =
    "جاري تحميل الخريطة...";


  try {

    await loadGoogleMaps();


    setTimeout(
      initializeDestinationMap,
      150
    );

  } catch (error) {

    console.error(
      error
    );


    $("#mapSelectedAddress")
      .innerHTML = `

        ⚠️ لم يتم تحميل Google Maps.

        <br><br>

        تأكد من Google Maps API Key.

      `;


    showMessage(
      "تعذر تحميل Google Maps.",
      "error"
    );

  }

}


// ======================================================
// INITIALIZE DESTINATION MAP
// ======================================================

function initializeDestinationMap() {

  const mapElement =
    $("#map");


  if (!mapElement) {

    return;

  }


  let center = {

    lat:
      30.5526,

    lng:
      31.0106

  };


  if (
    selectedPickupCoords
  ) {

    center = {

      lat:
        selectedPickupCoords.lat,

      lng:
        selectedPickupCoords.lng

    };

  }


  if (
    selectedDestinationCoords
  ) {

    center = {

      lat:
        selectedDestinationCoords.lat,

      lng:
        selectedDestinationCoords.lng

    };

  }


  map =
    new google.maps.Map(
      mapElement,
      {

        center,

        zoom:
          17,

        mapTypeControl:
          false,

        streetViewControl:
          false,

        fullscreenControl:
          false,

        zoomControl:
          true,

        gestureHandling:
          "greedy"

      }
    );


  if (
    destinationMarker
  ) {

    destinationMarker.setMap(
      null
    );

  }


  destinationMarker =
    new google.maps.Marker({

      position:
        center,

      map,

      title:
        "مكان النزول"

    });


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


      destinationMarker
        .setPosition({
          lat,
          lng
        });


      selectedDestinationCoords = {
        lat,
        lng
      };


      $("#mapSelectedAddress")
        .innerHTML = `

          📍 جاري تحديد العنوان...

          <br><br>

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


      const lat =
        position.lat();


      const lng =
        position.lng();


      selectedDestinationCoords = {
        lat,
        lng
      };


      const address =
        await getAddressFromCoordinates(
          lat,
          lng
        );


      $("#mapSelectedAddress")
        .innerHTML = `

          🏁

          <strong>
            مكان النزول
          </strong>

          <br><br>

          ${escapeHtml(
            address
          )}

          <br><br>

          <small>
            ${lat.toFixed(6)},
            ${lng.toFixed(6)}
          </small>

        `;

    }
  );


  setTimeout(
    () => {

      google.maps.event.trigger(
        map,
        "resize"
      );

      map.setCenter(
        center
      );

    },
    300
  );

}


// ======================================================
// GEOCODING
// ======================================================

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
        }

      });


    if (
      result.results &&
      result.results.length
    ) {

      return result.results[0]
        .formatted_address;

    }

  } catch (error) {

    console.error(
      error
    );

  }


  return `موقع محدد (${lat.toFixed(6)}, ${lng.toFixed(6)})`;

}


// ======================================================
// CONFIRM DESTINATION
// ======================================================

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


      button.disabled =
        true;


      button.textContent =
        "جاري تحديد العنوان...";


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


        showMessage(
          "تم تحديد مكان النزول بنجاح 📍",
          "success"
        );


      } catch (error) {

        console.error(
          error
        );

      }


      button.disabled =
        false;


      button.textContent =
        "✅ تأكيد مكان النزول";

    }
  );


// ======================================================
// CLOSE MAP
// ======================================================

$("#closeMapBtn")
  .addEventListener(
    "click",
    () => {

      showScreen(
        "homeScreen"
      );

    }
  );


// ======================================================
// PICKUP BUTTON
// ======================================================

$("#fromPlace")
  .addEventListener(
    "click",
    getCurrentLocation
  );


// ======================================================
// DESTINATION BUTTON
// ======================================================

$("#toPlace")
  .addEventListener(
    "click",
    openDestinationMap
  );


// ======================================================
// PROFILE
// ======================================================

$("#profileBtn")
  .addEventListener(
    "click",
    () => {

      if (!currentUser) {

        showScreen(
          "authScreen"
        );

        setupRecaptcha();

        return;

      }


      showScreen(
        "profileScreen"
      );

    }
  );


// ======================================================
// CAPTAIN
// ======================================================

async function openCaptainScreen() {

  if (!currentUser) {

    showScreen(
      "authScreen"
    );

    setupRecaptcha();

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


// ======================================================
// NAV HOME
// ======================================================

$("#navHome")
  .addEventListener(
    "click",
    () => {

      showScreen(
        "homeScreen"
      );

    }
  );


// ======================================================
// NAV PROFILE
// ======================================================

$("#navProfile")
  .addEventListener(
    "click",
    () => {

      if (!currentUser) {

        showScreen(
          "authScreen"
        );

        setupRecaptcha();

        return;

      }


      showScreen(
        "profileScreen"
      );

    }
  );


// ======================================================
// BACK
// ======================================================

$("#backHomeBtn")
  .addEventListener(
    "click",
    () => {

      showScreen(
        "homeScreen"
      );

    }
  );


// ======================================================
// RECAPTCHA
// ======================================================

function setupRecaptcha() {

  if (recaptcha) {

    return;

  }


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

    console.error(
      error
    );


    $("#authMsg")
      .textContent =
      "تعذر تشغيل التحقق.";

  }

}


// ======================================================
// SEND CODE
// ======================================================

$("#sendCodeBtn")
  .addEventListener(
    "click",
    async () => {

      const phone =
        $("#phone")
          .value
          .trim();


      if (!phone) {

        $("#authMsg")
          .textContent =
          "اكتب رقم الهاتف أولاً.";

        return;

      }


      if (
        !phone.startsWith("+")
      ) {

        $("#authMsg")
          .textContent =
          "اكتب الرقم بصيغة دولية.";

        return;

      }


      try {

        setupRecaptcha();


        $("#sendCodeBtn")
          .disabled =
          true;


        $("#authMsg")
          .textContent =
          "جاري إرسال الكود...";


        confirmationResult =
          await signInWithPhoneNumber(
            auth,
            phone,
            recaptcha
          );


        $("#codeSection")
          .style
          .display =
          "block";


        $("#authMsg")
          .textContent =
          "تم إرسال كود التحقق.";

      } catch (error) {

        console.error(
          error
        );


        $("#authMsg")
          .textContent =
          error.message ||
          "حدث خطأ أثناء إرسال الكود.";


        $("#sendCodeBtn")
          .disabled =
          false;

      }

    }
  );


// ======================================================
// VERIFY CODE
// ======================================================

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


      try {

        await confirmationResult
          .confirm(
            code
          );


        showScreen(
          "homeScreen"
        );


        $("#authMsg")
          .textContent =
          "تم تسجيل الدخول بنجاح.";

      } catch (error) {

        console.error(
          error
        );


        $("#authMsg")
          .textContent =
          "كود التحقق غير صحيح.";

      }

    }
  );


// ======================================================
// REQUEST RIDE
// ======================================================

$("#requestBtn")
  .addEventListener(
    "click",
    async () => {

      if (!currentUser) {

        showScreen(
          "authScreen"
        );

        setupRecaptcha();

        return;

      }


      if (!selectedPickupCoords) {

        showMessage(
          "حدد مكان الانطلاق أولاً.",
          "error"
        );

        return;

      }


      if (
        !selectedDestinationCoords
      ) {

        showMessage(
          "حدد مكان النزول أولاً.",
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
        ) || 1;


      const rideNotes =
        $("#rideNotes")
          .value
          .trim();


      if (
        passengerCount < 1 ||
        passengerCount > 8
      ) {

        showMessage(
          "عدد الركاب يجب أن يكون من 1 إلى 8.",
          "error"
        );

        return;

      }


      try {

        const button =
          $("#requestBtn");


        button.disabled =
          true;


        button.textContent =
          "جاري إرسال الرحلة...";


        const ride = {

          userId:
            currentUser.uid,

          fromPlace:
            selectedPickup,

          toPlace:
            selectedDestination,

          pickupCoords:
            selectedPickupCoords,

          destinationCoords:
            selectedDestinationCoords,

          price:

            price,

          passengerCount:

            passengerCount,

          notes:

            rideNotes,

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

            price:

              price,

            passengerCount:

              passengerCount,

            notes:

              rideNotes

          })
        );


        showMessage(
          "تم إرسال الرحلة للكباتن بنجاح 🚕",
          "success"
        );


        $("#ridePrice")
          .value =
          "";


        $("#rideNotes")
          .value =
          "";


        $("#passengerCount")
          .value =
          "1";


      } catch (error) {

        console.error(
          error
        );


        showMessage(
          error.message ||
          "حدث خطأ أثناء إرسال الرحلة.",
          "error"
        );

      }


      $("#requestBtn")
        .disabled =
        false;


      $("#requestBtn")
        .textContent =
        "🚕 اطلب الرحلة";

    }
  );


// ======================================================
// CAPTAIN RIDES
// ======================================================

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


        container.innerHTML =
          "";


        snapshot.forEach(
          rideDoc => {

            const ride =
              rideDoc.data();


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

                📍

                <strong>
                  الانطلاق:
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


              <div class="row">

                <button
                  class="btn primary view-ride-map"
                  data-id="${rideDoc.id}"
                  type="button"
                >
                  🗺️ الخريطة
                </button>


                <button
                  class="btn green offer-button"
                  data-id="${rideDoc.id}"
                  data-price="${ride.price || 0}"
                  type="button"
                >
                  💰 تقديم عرض
                </button>

              </div>

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
          .forEach(
            button => {

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

            }
          );

      },


      error => {

        console.error(
          error
        );


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


// ======================================================
// SEND OFFER
// ======================================================

async function sendOffer(
  rideId,
  originalPrice
) {

  if (!currentUser) {

    showScreen(
      "authScreen"
    );

    setupRecaptcha();

    return;

  }


  const offerPrice =
    prompt(
      `السعر المقترح: ${originalPrice} جنيه\n\nاكتب عرضك:`
    );


  if (!offerPrice) {

    return;

  }


  const price =
    Number(
      offerPrice
    );


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

        price:

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

    console.error(
      error
    );


    showMessage(
      error.message ||
      "تعذر إرسال العرض.",
      "error"
    );

  }

}


// ======================================================
// PROFILE
// ======================================================

async function loadProfile() {

  if (!currentUser) return;


  try {

    const userRef =
      doc(
        db,
        "users",
        currentUser.uid
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

        `;

    } else {

      await setDoc(

        userRef,

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

        }

      );


      currentRole =
        "customer";


      $("#profileInfo")
        .textContent =
        "تم إنشاء حسابك بنجاح.";

    }

  } catch (error) {

    console.error(
      error
    );


    $("#profileInfo")
      .textContent =
      "تعذر تحميل الحساب.";

  }

}


// ======================================================
// AUTH STATE
// ======================================================

onAuthStateChanged(
  auth,
  async user => {

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


// ======================================================
// LOGOUT
// ======================================================

$("#logoutBtn")
  .addEventListener(
    "click",
    async () => {

      try {

        await signOut(
          auth
        );


        currentUser =
          null;


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


        showMessage(
          "تعذر تسجيل الخروج.",
          "error"
        );

      }

    }
  );


// ======================================================
// INITIAL
// ======================================================

updateLocationFields();

showScreen(
  "homeScreen"
);


console.log(
  "وصلني المنوفية يعمل بنجاح 🚕"
);
