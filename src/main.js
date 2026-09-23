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

const firebaseApp = initializeApp(firebaseConfig);

const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);


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
let pickupMarker = null;

let mapMode = "destination";

let selectedRideId = null;


// ======================================================
// HELPERS
// ======================================================

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

  setTimeout(() => {

    box.style.display = "none";

  }, 5000);
}


// ======================================================
// MAIN HTML
// ======================================================

const appElement = $("#app");

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
  <!-- CUSTOMER -->
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
        استخدم موقعي الحالي
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
        📍 حدد مكان النزول على الخريطة
      </button>

      <div
        id="destinationInfo"
        class="status"
      >
        لم يتم تحديد مكان الوصول
      </div>

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
        اكتب السعر الذي تريد عرضه على الكباتن
      </small>

    </div>


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
  <!-- MAP SCREEN -->
  <!-- ================================================= -->

  <section
    id="mapScreen"
    class="screen"
  >

    <div class="card">

      <div class="switch">

        <div>

          <h2>
            حدد مكان النزول
          </h2>

          <small>
            حرك الخريطة حتى تكون العلامة على المكان بالضبط
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
    >

      <div
        id="map"
        style="height:100%;width:100%"
      ></div>

    </div>


    <div class="card">

      <div
        id="mapSelectedAddress"
        class="status"
      >
        حرك الخريطة وحدد مكان النزول
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
  <!-- BOTTOM NAV -->
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
// SCREEN NAVIGATION
// ======================================================

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

  if (screenId === "captainScreen") {

    $("#navCaptain")?.classList.add("active");

  }

  if (screenId === "profileScreen") {

    $("#navProfile")?.classList.add("active");

  }

}


// ======================================================
// UPDATE LOCATION UI
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
            ${escapeHtml(selectedPickup)}
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
            ${escapeHtml(selectedDestination)}
          </strong>
        `
        : "لم يتم تحديد مكان الوصول";

  }

}


// ======================================================
// GOOGLE MAP CHECK
// ======================================================

function googleMapsReady() {

  return (
    typeof window.google !== "undefined" &&
    window.google.maps
  );

}


// ======================================================
// OPEN DESTINATION MAP
// ======================================================

function openDestinationMap() {

  mapMode = "destination";

  showScreen("mapScreen");


  setTimeout(() => {

    initializeMap();

  }, 100);

}


// ======================================================
// INITIALIZE GOOGLE MAP
// ======================================================

function initializeMap() {

  if (!googleMapsReady()) {

    $("#map").innerHTML = `

      <div
        style="
          height:100%;
          display:grid;
          place-items:center;
          padding:20px;
          text-align:center;
          color:#718496;
        "
      >

        ⚠️ خريطة Google Maps غير محملة.

        <br><br>

        تأكد من إضافة Google Maps JavaScript API
        في index.html.

      </div>

    `;

    return;

  }


  let center = {
    lat: 30.5526,
    lng: 31.0106
  };


  if (selectedDestinationCoords) {

    center = {
      lat:
        selectedDestinationCoords.lat,

      lng:
        selectedDestinationCoords.lng
    };

  } else if (selectedPickupCoords) {

    center = {
      lat:
        selectedPickupCoords.lat,

      lng:
        selectedPickupCoords.lng
    };

  }


  map =
    new google.maps.Map(
      $("#map"),
      {

        center,

        zoom: 17,

        mapTypeControl: false,

        streetViewControl: false,

        fullscreenControl: false,

        zoomControl: true,

        gestureHandling: "greedy"

      }
    );


  /*
   * Marker الخاص بمكان النزول
   *
   * يظل في منتصف الخريطة.
   */

  destinationMarker =
    new google.maps.Marker({

      position: center,

      map,

      draggable: false,

      title:
        "مكان النزول"

    });


  map.addListener(
    "center_changed",
    () => {

      const centerPosition =
        map.getCenter();

      if (!centerPosition) return;


      const lat =
        centerPosition.lat();

      const lng =
        centerPosition.lng();


      destinationMarker.setPosition(
        {
          lat,
          lng
        }
      );


      selectedDestinationCoords = {
        lat,
        lng
      };


      updateMapCoordinates(
        lat,
        lng
      );

    }
  );


  google.maps.event.trigger(
    map,
    "resize"
  );


  updateMapCoordinates(
    center.lat,
    center.lng
  );

}


// ======================================================
// MAP COORDINATES
// ======================================================

function updateMapCoordinates(lat, lng) {

  const box =
    $("#mapSelectedAddress");

  if (!box) return;


  box.innerHTML = `

    📍 النقطة المحددة

    <br>

    <small>
      ${lat.toFixed(6)},
      ${lng.toFixed(6)}
    </small>

  `;

}


// ======================================================
// REVERSE GEOCODING
// ======================================================

async function getAddressFromCoordinates(
  lat,
  lng
) {

  if (!googleMapsReady()) {

    return `موقع (${lat.toFixed(5)}, ${lng.toFixed(5)})`;

  }


  try {

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
      result.results.length > 0
    ) {

      return result.results[0]
        .formatted_address;

    }

  } catch (error) {

    console.error(
      "Geocoder error:",
      error
    );

  }


  return `موقع (${lat.toFixed(5)}, ${lng.toFixed(5)})`;

}


// ======================================================
// CONFIRM DESTINATION
// ======================================================

$("#confirmDestinationBtn")
  .addEventListener(
    "click",
    async () => {

      if (!selectedDestinationCoords) {

        showMessage(
          "حدد مكان النزول على الخريطة أولاً.",
          "error"
        );

        return;

      }


      const button =
        $("#confirmDestinationBtn");


      button.disabled = true;

      button.textContent =
        "جاري تحديد العنوان...";


      try {

        const {
          lat,
          lng
        } =
          selectedDestinationCoords;


        selectedDestination =
          await getAddressFromCoordinates(
            lat,
            lng
          );


        updateLocationFields();

        showScreen("homeScreen");


        showMessage(
          "تم تحديد مكان النزول بدقة ✅",
          "success"
        );


      } catch (error) {

        console.error(error);

        selectedDestination =
          `موقع (${selectedDestinationCoords.lat.toFixed(5)}, ${selectedDestinationCoords.lng.toFixed(5)})`;

        updateLocationFields();

        showScreen("homeScreen");

      }


      button.disabled = false;

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

      showScreen("homeScreen");

    }
  );


// ======================================================
// GET CURRENT LOCATION
// ======================================================

function getCurrentLocation() {

  if (!("geolocation" in navigator)) {

    showMessage(
      "الجهاز لا يدعم تحديد الموقع.",
      "error"
    );

    return;

  }


  showMessage(
    "جاري تحديد موقعك...",
    "info"
  );


  navigator.geolocation.getCurrentPosition(

    async (position) => {

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


      showMessage(
        "تم تحديد مكان الانطلاق ✅",
        "success"
      );

    },


    (error) => {

      console.error(
        "Geolocation error:",
        error
      );


      showMessage(
        "لم نتمكن من تحديد موقعك. اسمح للتطبيق باستخدام الموقع.",
        "error"
      );

    },


    {

      enableHighAccuracy: true,

      timeout: 15000,

      maximumAge: 0

    }

  );

}


// ======================================================
// PICKUP BUTTON
// ======================================================

$("#fromPlace")
  .addEventListener(
    "click",
    () => {

      getCurrentLocation();

    }
  );


// ======================================================
// DESTINATION BUTTON
// ======================================================

$("#toPlace")
  .addEventListener(
    "click",
    () => {

      openDestinationMap();

    }
  );


// ======================================================
// PROFILE
// ======================================================

$("#profileBtn")
  .addEventListener(
    "click",
    () => {

      if (!currentUser) {

        showScreen("authScreen");

        setupRecaptcha();

        return;

      }


      showScreen("profileScreen");

    }
  );


// ======================================================
// CAPTAIN
// ======================================================

async function openCaptainScreen() {

  if (!currentUser) {

    showScreen("authScreen");

    setupRecaptcha();

    return;

  }


  showScreen("captainScreen");

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

      showScreen("homeScreen");

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

        showScreen("authScreen");

        setupRecaptcha();

        return;

      }


      showScreen("profileScreen");

    }
  );


// ======================================================
// BACK HOME
// ======================================================

$("#backHomeBtn")
  .addEventListener(
    "click",
    () => {

      showScreen("homeScreen");

    }
  );


// ======================================================
// RECAPTCHA
// ======================================================

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

    console.error(
      "reCAPTCHA error:",
      error
    );


    const msg =
      $("#authMsg");


    if (msg) {

      msg.textContent =
        "تعذر تشغيل التحقق. حاول مرة أخرى.";

    }

  }

}


// ======================================================
// SEND PHONE CODE
// ======================================================

$("#sendCodeBtn")
  .addEventListener(
    "click",
    async () => {

      const phone =
        $("#phone").value.trim();


      if (!phone) {

        $("#authMsg").textContent =
          "اكتب رقم الهاتف أولاً.";

        return;

      }


      if (!phone.startsWith("+")) {

        $("#authMsg").textContent =
          "اكتب الرقم بصيغة دولية، مثال: +201xxxxxxxxx";

        return;

      }


      try {

        setupRecaptcha();


        $("#sendCodeBtn").disabled =
          true;


        $("#authMsg").textContent =
          "جاري إرسال الكود...";


        confirmationResult =
          await signInWithPhoneNumber(
            auth,
            phone,
            recaptcha
          );


        $("#codeSection").style.display =
          "block";


        $("#authMsg").textContent =
          "تم إرسال كود التحقق.";

      } catch (error) {

        console.error(error);


        $("#authMsg").textContent =
          error.message ||
          "حدث خطأ أثناء إرسال الكود.";


        $("#sendCodeBtn").disabled =
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

        $("#authMsg").textContent =
          "اطلب كود التحقق أولاً.";

        return;

      }


      if (!code) {

        $("#authMsg").textContent =
          "اكتب كود التحقق.";

        return;

      }


      try {

        await confirmationResult.confirm(
          code
        );


        $("#authMsg").textContent =
          "تم تسجيل الدخول بنجاح ✅";


        showScreen("homeScreen");

      } catch (error) {

        console.error(error);


        $("#authMsg").textContent =
          error.message ||
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

        showScreen("authScreen");

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


      if (!selectedDestinationCoords) {

        showMessage(
          "حدد مكان النزول على الخريطة أولاً.",
          "error"
        );

        return;

      }


      const price =
        Number(
          $("#ridePrice").value
        );


      if (!price || price <= 0) {

        showMessage(
          "اكتب سعر الرحلة.",
          "error"
        );

        return;

      }


      try {

        $("#requestBtn").disabled =
          true;


        $("#requestBtn").textContent =
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

          price,

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
            ...ride
          })
        );


        showMessage(
          "تم إرسال الرحلة للكباتن بنجاح 🚕",
          "success"
        );


        $("#ridePrice").value =
          "";


        $("#requestBtn").disabled =
          false;


        $("#requestBtn").textContent =
          "🚕 اطلب الرحلة";

      } catch (error) {

        console.error(error);


        showMessage(
          error.message ||
          "حدث خطأ أثناء إرسال الرحلة.",
          "error"
        );


        $("#requestBtn").disabled =
          false;


        $("#requestBtn").textContent =
          "🚕 اطلب الرحلة";

      }

    }
  );


// ======================================================
// LOAD CAPTAIN RIDES
// ======================================================

function loadCaptainRides() {

  const container =
    $("#captainRides");


  if (!currentUser) {

    container.innerHTML = `

      <div class="card">

        سجل الدخول أولاً.

      </div>

    `;

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


        container.innerHTML = "";


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
                  ${Number(ride.price || 0)}
                  جنيه
                </div>

              </div>


              <div class="status">

                📍
                <strong>
                  من:
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
                  إلى:
                </strong>

                <br>

                ${escapeHtml(
                  ride.toPlace ||
                  "غير محدد"
                )}

              </div>


              <div class="row">

                <button
                  class="btn primary view-ride-map"
                  data-id="${rideDoc.id}"
                >
                  🗺️ الخريطة
                </button>

                <button
                  class="btn green offer-button"
                  data-id="${rideDoc.id}"
                  data-price="${ride.price || 0}"
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
          .forEach(button => {

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


        container
          .querySelectorAll(
            ".view-ride-map"
          )
          .forEach(button => {

            button.addEventListener(
              "click",
              () => {

                showCaptainRideMap(
                  button.dataset.id
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


// ======================================================
// CAPTAIN RIDE MAP
// ======================================================

async function showCaptainRideMap(
  rideId
) {

  try {

    const rideSnap =
      await getDoc(
        doc(
          db,
          "rides",
          rideId
        )
      );


    if (!rideSnap.exists()) {

      showMessage(
        "الرحلة غير موجودة.",
        "error"
      );

      return;

    }


    const ride =
      rideSnap.data();


    if (!googleMapsReady()) {

      showMessage(
        "Google Maps غير محملة.",
        "error"
      );

      return;

    }


    const pickup =
      ride.pickupCoords;


    const destination =
      ride.destinationCoords;


    if (!pickup || !destination) {

      showMessage(
        "إحداثيات الرحلة غير متوفرة.",
        "error"
      );

      return;

    }


    showScreen("mapScreen");


    setTimeout(() => {

      map =
        new google.maps.Map(
          $("#map"),
          {

            center: {
              lat:
                pickup.lat,

              lng:
                pickup.lng
            },

            zoom: 14,

            mapTypeControl: false,

            streetViewControl: false,

            fullscreenControl: false

          }
        );


      new google.maps.Marker({

        position: {
          lat:
            pickup.lat,

          lng:
            pickup.lng
        },

        map,

        label: "A",

        title:
          "مكان الانطلاق"

      });


      new google.maps.Marker({

        position: {
          lat:
            destination.lat,

          lng:
            destination.lng
        },

        map,

        label: "B",

        title:
          "مكان النزول"

      });


      const bounds =
        new google.maps.LatLngBounds();


      bounds.extend({
        lat:
          pickup.lat,

        lng:
          pickup.lng
      });


      bounds.extend({
        lat:
          destination.lat,

        lng:
          destination.lng
      });


      map.fitBounds(bounds);


      $("#mapSelectedAddress").innerHTML = `

        <strong>
          📍 الانطلاق
        </strong>

        <br>

        ${escapeHtml(
          ride.fromPlace || ""
        )}

        <hr>

        <strong>
          🏁 الوصول
        </strong>

        <br>

        ${escapeHtml(
          ride.toPlace || ""
        )}

      `;


      $("#confirmDestinationBtn").style.display =
        "none";


      $("#closeMapBtn").textContent =
        "رجوع";


    }, 100);


  } catch (error) {

    console.error(error);


    showMessage(
      error.message ||
      "تعذر فتح خريطة الرحلة.",
      "error"
    );

  }

}


// ======================================================
// SEND CAPTAIN OFFER
// ======================================================

async function sendOffer(
  rideId,
  originalPrice
) {

  if (!currentUser) {

    showScreen("authScreen");

    setupRecaptcha();

    return;

  }


  const offerPrice =
    prompt(
      `السعر المطلوب من العميل: ${originalPrice} جنيه\n\nاكتب السعر الذي ستقدمه:`
    );


  if (!offerPrice) return;


  const price =
    Number(offerPrice);


  if (!price || price <= 0) {

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


    if (userSnap.exists()) {

      const data =
        userSnap.data();


      currentRole =
        data.role ||
        "customer";


      $("#profileInfo").innerHTML = `

        <div>

          📱

          ${escapeHtml(
            currentUser.phoneNumber ||
            ""
          )}

        </div>

        <br>

        <div>

          👤 النوع:

          <strong>

            ${
              currentRole === "captain"
                ? "كابتن"
                : "عميل"
            }

          </strong>

        </div>

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


      $("#profileInfo").textContent =
        "تم إنشاء حسابك بنجاح.";

    }


  } catch (error) {

    console.error(error);


    $("#profileInfo").textContent =
      "تعذر تحميل الحساب.";

  }

}


// ======================================================
// AUTH STATE
// ======================================================

onAuthStateChanged(
  auth,
  async (user) => {

    currentUser =
      user;


    if (user) {

      await loadProfile();


      console.log(
        "Logged in:",
        user.phoneNumber
      );

    } else {

      currentRole =
        "customer";


      $("#profileInfo").textContent =
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

        console.error(error);


        showMessage(
          "تعذر تسجيل الخروج.",
          "error"
        );

      }

    }
  );


// ======================================================
// INITIAL UI
// ======================================================

updateLocationFields();

showScreen(
  "homeScreen"
);


// ======================================================
// START
// ======================================================

console.log(
  "وصلني المنوفية يعمل بنجاح 🚕"
);               
