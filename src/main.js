/* =========================================================
   وصلني المنوفية
   MAIN.JS - FULL VERSION
   MAP: LEAFLET + OPENSTREETMAP
   FIREBASE: AUTH + FIRESTORE + STORAGE
   ========================================================= */

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


/* =========================================================
   FIREBASE
   ========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyAZVXuhTTiGKfDflIZUm_8IgzhRjjWsfIc",
  authDomain: "wasselni-monufia-13f28.firebaseapp.com",
  projectId: "wasselni-monufia-13f28",
  storageBucket: "wasselni-monufia-13f28.firebasestorage.app",
  messagingSenderId: "1007737426615",
  appId: "1:1007737426615:web:3a9d2638b8cb9616cef332",
  measurementId: "G-7K0MVY6F73"
};

const firebaseApp =
  initializeApp(firebaseConfig);

const auth =
  getAuth(firebaseApp);

const db =
  getFirestore(firebaseApp);

const storage =
  getStorage(firebaseApp);


/* =========================================================
   GLOBAL VARIABLES
   ========================================================= */

let currentUser = null;

let currentRole = "customer";

let confirmationResult = null;

let recaptchaVerifier = null;

let map = null;

let pickupMarker = null;

let destinationMarker = null;

let routeLine = null;

let pickupLocation = null;

let destinationLocation = null;

let selectedDestination = null;

let unsubscribeCustomerRides = null;

let unsubscribeCaptainRides = null;


/* =========================================================
   HELPERS
   ========================================================= */

function escapeHtml(value = "") {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function showMessage(message) {

  let box =
    document.getElementById(
      "messageBox"
    );

  if (!box) {

    box =
      document.createElement("div");

    box.id =
      "messageBox";

    box.style.position =
      "fixed";

    box.style.left =
      "50%";

    box.style.bottom =
      "25px";

    box.style.transform =
      "translateX(-50%)";

    box.style.zIndex =
      "99999";

    box.style.background =
      "#222";

    box.style.color =
      "#fff";

    box.style.padding =
      "13px 18px";

    box.style.borderRadius =
      "14px";

    box.style.maxWidth =
      "90%";

    box.style.textAlign =
      "center";

    document.body.appendChild(box);
  }

  box.textContent =
    message;

  box.style.display =
    "block";

  clearTimeout(
    window.__messageTimer
  );

  window.__messageTimer =
    setTimeout(() => {

      box.style.display =
        "none";

    }, 3500);
}


function showScreen(screenId) {

  document
    .querySelectorAll(".screen")
    .forEach(screen => {

      screen.classList.remove(
        "active"
      );

      screen.style.display =
        "none";

    });

  const screen =
    document.getElementById(
      screenId
    );

  if (!screen) return;

  screen.classList.add(
    "active"
  );

  screen.style.display =
    "block";
}


function setText(id, value) {

  const element =
    document.getElementById(id);

  if (element) {

    element.textContent =
      value ?? "";

  }
}


function getValue(id) {

  const element =
    document.getElementById(id);

  return element
    ? element.value.trim()
    : "";
}


/* =========================================================
   LEAFLET LOADER
   ========================================================= */

function loadLeaflet() {

  return new Promise(
    (resolve, reject) => {

      if (window.L) {

        resolve(window.L);

        return;
      }

      if (
        !document.getElementById(
          "leaflet-css"
        )
      ) {

        const css =
          document.createElement(
            "link"
          );

        css.id =
          "leaflet-css";

        css.rel =
          "stylesheet";

        css.href =
          "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

        document.head.appendChild(
          css
        );
      }


      const oldScript =
        document.querySelector(
          "script[data-leaflet]"
        );

      if (oldScript) {

        oldScript.addEventListener(
          "load",
          () => resolve(window.L)
        );

        oldScript.addEventListener(
          "error",
          reject
        );

        return;
      }


      const script =
        document.createElement(
          "script"
        );

      script.src =
        "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

      script.async =
        true;

      script.dataset.leaflet =
        "true";

      script.onload = () => {

        if (window.L) {

          resolve(
            window.L
          );

        } else {

          reject(
            new Error(
              "Leaflet not loaded"
            )
          );

        }
      };

      script.onerror = () => {

        reject(
          new Error(
            "تعذر تحميل الخريطة"
          )
        );

      };

      document.head.appendChild(
        script
      );

    }
  );
}


/* =========================================================
   MAP INITIALIZE
   ========================================================= */

async function initializeMap() {

  try {

    await loadLeaflet();

    const mapElement =
      document.getElementById(
        "map"
      );

    if (!mapElement) {

      return;
    }


    if (map) {

      setTimeout(() => {

        map.invalidateSize();

      }, 300);

      return;
    }


    let center = [
      30.9876,
      31.1669
    ];


    if (pickupLocation) {

      center = [
        pickupLocation.lat,
        pickupLocation.lng
      ];

    }


    map =
      L.map(
        "map",
        {
          zoomControl: true
        }
      ).setView(
        center,
        14
      );


    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,

        attribution:
          "&copy; OpenStreetMap contributors"
      }
    ).addTo(map);


    /* مكان الانطلاق */

    if (pickupLocation) {

      createPickupMarker();

    }


    /* الضغط على الخريطة */

    map.on(
      "click",
      async event => {

        const position = {

          lat:
            event.latlng.lat,

          lng:
            event.latlng.lng

        };

        selectedDestination =
          position;

        await setDestinationMarker(
          position
        );

      }
    );


    setTimeout(() => {

      map.invalidateSize();

    }, 500);

  } catch (error) {

    console.error(
      error
    );

    showMessage(
      "حصل خطأ في تشغيل الخريطة"
    );

  }
}


/* =========================================================
   PICKUP MARKER
   ========================================================= */

function createPickupMarker() {

  if (!map || !pickupLocation) {

    return;
  }


  if (pickupMarker) {

    map.removeLayer(
      pickupMarker
    );

  }


  pickupMarker =
    L.marker(
      [
        pickupLocation.lat,
        pickupLocation.lng
      ]
    )
    .addTo(map)
    .bindPopup(
      "📍 مكان الانطلاق"
    );


}


/* =========================================================
   DESTINATION MARKER
   ========================================================= */

async function setDestinationMarker(
  position
) {

  if (!map) return;


  if (destinationMarker) {

    map.removeLayer(
      destinationMarker
    );

  }


  destinationMarker =
    L.marker(
      [
        position.lat,
        position.lng
      ]
    )
    .addTo(map)
    .bindPopup(
      "📍 مكان النزول"
    )
    .openPopup();


  map.setView(
    [
      position.lat,
      position.lng
    ],
    16
  );


  let address = "";


  try {

    const place =
      await reverseGeocode(
        position.lat,
        position.lng
      );

    address =
      place?.display_name ||
      "";

  } catch {

    address = "";

  }


  selectedDestination = {

    lat:
      position.lat,

    lng:
      position.lng,

    name:
      address,

    address:
      address

  };


  const input =
    document.getElementById(
      "destinationSearch"
    );

  if (input && address) {

    input.value =
      address;

  }
}


/* =========================================================
   REVERSE GEOCODING
   ========================================================= */

async function reverseGeocode(
  lat,
  lng
) {

  const url =
    "https://nominatim.openstreetmap.org/reverse" +
    `?format=jsonv2` +
    `&lat=${encodeURIComponent(lat)}` +
    `&lon=${encodeURIComponent(lng)}` +
    `&accept-language=ar`;


  const response =
    await fetch(
      url
    );


  if (!response.ok) {

    throw new Error(
      "Reverse geocoding error"
    );

  }


  return await response.json();
}


/* =========================================================
   SEARCH PLACES
   ========================================================= */

async function searchPlaces(
  searchText
) {

  const results =
    document.getElementById(
      "searchResults"
    );


  if (!results) return;


  if (!searchText.trim()) {

    results.innerHTML =
      "";

    return;
  }


  results.innerHTML =
    "<div style='padding:10px'>جاري البحث...</div>";


  try {

    const url =
      "https://nominatim.openstreetmap.org/search" +
      "?format=jsonv2" +
      `&q=${encodeURIComponent(searchText)}` +
      "&countrycodes=eg" +
      "&limit=5" +
      "&accept-language=ar";


    const response =
      await fetch(
        url
      );


    if (!response.ok) {

      throw new Error(
        "Search failed"
      );

    }


    const places =
      await response.json();


    if (!places.length) {

      results.innerHTML =
        "<div style='padding:10px'>مفيش نتائج.</div>";

      return;
    }


    results.innerHTML =
      "";


    places.forEach(
      place => {

        const button =
          document.createElement(
            "button"
          );


        button.type =
          "button";


        button.className =
          "search-result";


        button.style.display =
          "block";

        button.style.width =
          "100%";

        button.style.textAlign =
          "right";

        button.style.padding =
          "12px";

        button.style.border =
          "0";

        button.style.background =
          "#fff";

        button.style.borderBottom =
          "1px solid #eee";


        button.textContent =
          place.display_name;


        button.addEventListener(
          "click",
          async () => {

            const position = {

              lat:
                Number(
                  place.lat
                ),

              lng:
                Number(
                  place.lon
                ),

              name:
                place.display_name,

              address:
                place.display_name

            };


            selectedDestination =
              position;


            await setDestinationMarker(
              position
            );


            results.innerHTML =
              "";

          }
        );


        results.appendChild(
          button
        );

      }
    );

  } catch (error) {

    console.error(
      error
    );


    results.innerHTML =
      "<div style='padding:10px'>حصل خطأ أثناء البحث.</div>";

  }
}


/* =========================================================
   DRAW ROUTE
   ========================================================= */

async function drawRoute() {

  if (
    !pickupLocation ||
    !destinationLocation ||
    !map
  ) {

    return;
  }


  try {

    const url =
      "https://router.project-osrm.org/route/v1/driving/" +
      `${pickupLocation.lng},${pickupLocation.lat};` +
      `${destinationLocation.lng},${destinationLocation.lat}` +
      "?overview=full&geometries=geojson";


    const response =
      await fetch(
        url
      );


    if (!response.ok) {

      throw new Error(
        "Routing failed"
      );

    }


    const data =
      await response.json();


    if (
      data.code !== "Ok" ||
      !data.routes?.length
    ) {

      return;
    }


    const coordinates =
      data.routes[0]
        .geometry
        .coordinates
        .map(
          ([lng, lat]) => [
            lat,
            lng
          ]
        );


    if (routeLine) {

      map.removeLayer(
        routeLine
      );

    }


    routeLine =
      L.polyline(
        coordinates,
        {
          weight: 5
        }
      ).addTo(map);


    map.fitBounds(
      routeLine.getBounds(),
      {
        padding: [
          30,
          30
        ]
      }
    );


  } catch (error) {

    console.error(
      "Route error:",
      error
    );

  }
}


/* =========================================================
   GET DEVICE LOCATION
   ========================================================= */

async function getDeviceLocation() {

  try {

    let permission;


    try {

      permission =
        await checkPermissions();

    } catch {

      permission =
        null;

    }


    if (
      !permission ||
      permission.location !== "granted"
    ) {

      try {

        await requestPermissions();

      } catch (error) {

        console.error(
          error
        );

      }

    }


    const position =
      await getCurrentPosition(
        {
          enableHighAccuracy:
            true,

          timeout:
            15000,

          maximumAge:
            10000
        }
      );


    pickupLocation = {

      lat:
        position.coords.latitude,

      lng:
        position.coords.longitude

    };


    if (map) {

      createPickupMarker();


      map.setView(
        [
          pickupLocation.lat,
          pickupLocation.lng
        ],
        15
      );

    }


    const fromPlace =
      document.getElementById(
        "fromPlace"
      );


    if (fromPlace) {

      fromPlace.value =
        "موقعي الحالي";

    }


    return pickupLocation;


  } catch (error) {

    console.error(
      "Location error:",
      error
    );


    showMessage(
      "اسمح للتطبيق بالوصول إلى الموقع من إعدادات الهاتف."
    );


    return null;
  }
}


/* =========================================================
   OPEN MAP
   ========================================================= */

async function openMap() {

  showScreen(
    "mapScreen"
  );


  if (!pickupLocation) {

    await getDeviceLocation();

  }


  await initializeMap();


  setTimeout(() => {

    if (map) {

      map.invalidateSize();

    }

  }, 400);
}


/* =========================================================
   SAVE USER PROFILE
   ========================================================= */

async function saveUserProfile(
  uid,
  data
) {

  await setDoc(
    doc(
      db,
      "users",
      uid
    ),
    {
      ...data,

      updatedAt:
        serverTimestamp()
    },
    {
      merge: true
    }
  );
}


/* =========================================================
   GET USER PROFILE
   ========================================================= */

async function getUserProfile(
  uid
) {

  const snap =
    await getDoc(
      doc(
        db,
        "users",
        uid
      )
    );


  if (!snap.exists()) {

    return null;

  }


  return snap.data();
}


/* =========================================================
   RENDER APP
   ========================================================= */

function renderApp() {

  document.body.innerHTML = `

    <div id="app">

      <!-- HOME -->

      <section
        id="homeScreen"
        class="screen active"
      >

        <div class="app-header">

          <h2>
            وصلني المنوفية
          </h2>

          <p>
            اطلب رحلتك بسهولة
          </p>

        </div>


        <div class="ride-card">

          <label>
            مكان الانطلاق
          </label>

          <div class="location-row">

            <input
              id="fromPlace"
              type="text"
              placeholder="موقعي الحالي"
              readonly
            />

            <button
              id="currentLocationBtn"
              type="button"
            >
              📍
            </button>

          </div>


          <label>
            مكان النزول
          </label>

          <button
            id="toPlace"
            type="button"
            class="location-select"
          >
            📍 حدد مكان النزول
          </button>


          <label>
            عدد الركاب
          </label>

          <input
            id="passengers"
            type="number"
            min="1"
            max="20"
            value="1"
            placeholder="عدد الركاب"
          />


          <label>
            السعر المقترح
          </label>

          <input
            id="ridePrice"
            type="number"
            min="0"
            placeholder="اكتب السعر"
          />


          <label>
            ملاحظات
          </label>

          <textarea
            id="rideNotes"
            placeholder="مثلاً: شنطة كبيرة أو أي ملاحظة"
          ></textarea>


          <button
            id="requestBtn"
            class="primary-btn"
            type="button"
          >
            🚕 اطلب الرحلة
          </button>

        </div>


        <nav class="bottom-nav">

          <button
            data-screen="homeScreen"
            type="button"
          >
            🏠
            <span>الرئيسية</span>
          </button>

          <button
            data-screen="customerRidesScreen"
            type="button"
          >
            🚕
            <span>رحلاتي</span>
          </button>

          <button
            data-screen="profileScreen"
            type="button"
          >
            👤
            <span>حسابي</span>
          </button>

        </nav>

      </section>


      <!-- CUSTOMER RIDES -->

      <section
        id="customerRidesScreen"
        class="screen"
      >

        <div class="app-header">

          <h2>
            رحلاتي
          </h2>

        </div>

        <div id="customerRidesList"></div>


        <nav class="bottom-nav">

          <button
            data-screen="homeScreen"
            type="button"
          >
            🏠
            <span>الرئيسية</span>
          </button>

          <button
            data-screen="customerRidesScreen"
            type="button"
          >
            🚕
            <span>رحلاتي</span>
          </button>

          <button
            data-screen="profileScreen"
            type="button"
          >
            👤
            <span>حسابي</span>
          </button>

        </nav>

      </section>


      <!-- MAP -->

      <section
        id="mapScreen"
        class="screen"
      >

        <div class="map-header">

          <button
            id="closeMapBtn"
            type="button"
          >
            ✕
          </button>

          <h3>
            حدد مكان النزول
          </h3>

        </div>


        <div
          id="map"
          style="
            width:100%;
            height:58vh;
            min-height:380px;
            border-radius:18px;
            overflow:hidden;
          "
        ></div>


        <div class="map-bottom">

          <input
            id="destinationSearch"
            type="text"
            placeholder="🔎 ابحث عن المكان"
          />


          <div
            id="searchResults"
          ></div>


          <button
            id="confirmDestinationBtn"
            class="primary-btn"
            type="button"
          >
            تأكيد المكان
          </button>

        </div>

      </section>


      <!-- AUTH -->

      <section
        id="authScreen"
        class="screen"
      >

        <div class="auth-card">

          <h2>
            وصلني المنوفية
          </h2>

          <p>
            تسجيل الدخول
          </p>


          <select id="authRole">

            <option value="customer">
              راكب
            </option>

            <option value="captain">
              كابتن
            </option>

          </select>


          <input
            id="authName"
            type="text"
            placeholder="الاسم"
          />


          <div
            id="captainFields"
            style="display:none"
          >

            <input
              id="captainCarType"
              type="text"
              placeholder="نوع العربية"
            />

            <input
              id="captainCarModel"
              type="text"
              placeholder="موديل العربية"
            />

            <input
              id="captainCarNumber"
              type="text"
              placeholder="رقم العربية"
            />

            <input
              id="captainImage"
              type="file"
              accept="image/*"
            />

          </div>


          <input
            id="authPhone"
            type="tel"
            placeholder="رقم الهاتف"
          />


          <div
            id="recaptcha-container"
          ></div>


          <button
            id="sendCodeBtn"
            class="primary-btn"
            type="button"
          >
            إرسال كود التحقق
          </button>


          <div
            id="codeSection"
            style="display:none"
          >

            <input
              id="authCode"
              type="number"
              placeholder="كود التحقق"
            />

            <button
              id="verifyCodeBtn"
              class="primary-btn"
              type="button"
            >
              تأكيد الكود
            </button>

          </div>

        </div>

      </section>


      <!-- CAPTAIN -->

      <section
        id="captainScreen"
        class="screen"
      >

        <div class="app-header">

          <h2>
            رحلات متاحة
          </h2>

          <button
            id="captainHistoryBtn"
            type="button"
          >
            الرحلات السابقة
          </button>

        </div>


        <div
          id="captainRidesList"
        ></div>

      </section>


      <!-- CAPTAIN HISTORY -->

      <section
        id="captainHistoryScreen"
        class="screen"
      >

        <div class="app-header">

          <button
            id="backCaptainBtn"
            type="button"
          >
            ←
          </button>

          <h2>
            رحلاتي السابقة
          </h2>

        </div>


        <div
          id="captainHistoryList"
        ></div>

      </section>


      <!-- PROFILE -->

      <section
        id="profileScreen"
        class="screen"
      >

        <div class="app-header">

          <h2>
            حسابي
          </h2>

        </div>


        <div
          id="profileContent"
        ></div>


        <button
          id="logoutBtn"
          class="danger-btn"
          type="button"
        >
          تسجيل الخروج
        </button>


        <nav class="bottom-nav">

          <button
            data-screen="homeScreen"
            type="button"
          >
            🏠
            <span>الرئيسية</span>
          </button>

          <button
            data-screen="customerRidesScreen"
            type="button"
          >
            🚕
            <span>رحلاتي</span>
          </button>

          <button
            data-screen="profileScreen"
            type="button"
          >
            👤
            <span>حسابي</span>
          </button>

        </nav>

      </section>

    </div>

  `;


  setupEvents();

}


/* =========================================================
   AUTH - RECAPTCHA
   ========================================================= */

function setupRecaptcha() {

  if (recaptchaVerifier) {

    try {

      recaptchaVerifier.clear();

    } catch {}

    recaptchaVerifier =
      null;

  }


  recaptchaVerifier =
    new RecaptchaVerifier(
      auth,
      "recaptcha-container",
      {
        size:
          "normal",

        callback:
          () => {},

        "expired-callback":
          () => {

            showMessage(
              "انتهى التحقق، حاول مرة أخرى."
            );

          }
      }
    );

}


/* =========================================================
   SEND PHONE CODE
   ========================================================= */

async function sendPhoneCode() {

  const phone =
    getValue(
      "authPhone"
    );


  if (!phone) {

    showMessage(
      "اكتب رقم الهاتف."
    );

    return;
  }


  if (
    !phone.startsWith("+")
  ) {

    showMessage(
      "اكتب الرقم بصيغة دولية مثل +2010xxxxxxxx."
    );

    return;
  }


  try {

    setupRecaptcha();


    confirmationResult =
      await signInWithPhoneNumber(
        auth,
        phone,
        recaptchaVerifier
      );


    const codeSection =
      document.getElementById(
        "codeSection"
      );


    if (codeSection) {

      codeSection.style.display =
        "block";

    }


    showMessage(
      "تم إرسال كود التحقق."
    );


  } catch (error) {

    console.error(
      error
    );


    showMessage(
      error?.message ||
      "تعذر إرسال الكود."
    );

  }
}


/* =========================================================
   VERIFY PHONE CODE
   ========================================================= */

async function verifyPhoneCode() {

  const code =
    getValue(
      "authCode"
    );


  if (
    !confirmationResult
  ) {

    showMessage(
      "اطلب كود التحقق أولاً."
    );

    return;
  }


  if (!code) {

    showMessage(
      "اكتب كود التحقق."
    );

    return;
  }


  try {

    const result =
      await confirmationResult.confirm(
        code
      );


    currentUser =
      result.user;


    const role =
      getValue(
        "authRole"
      ) ||
      "customer";


    const name =
      getValue(
        "authName"
      );


    const phone =
      currentUser.phoneNumber ||
      getValue("authPhone");


    let profile = {

      uid:
        currentUser.uid,

      phone:
        phone,

      name:
        name,

      role:
        role

    };


    if (
      role === "captain"
    ) {

      profile.carType =
        getValue(
          "captainCarType"
        );

      profile.carModel =
        getValue(
          "captainCarModel"
        );

      profile.carNumber =
        getValue(
          "captainCarNumber"
        );


      const imageInput =
        document.getElementById(
          "captainImage"
        );


      if (
        imageInput?.files?.length
      ) {

        try {

          const file =
            imageInput.files[0];


          const fileRef =
            storageRef(
              storage,
              `captains/${currentUser.uid}/profile.jpg`
            );


          await uploadBytes(
            fileRef,
            file
          );


          profile.photoURL =
            await getDownloadURL(
              fileRef
            );

        } catch (error) {

          console.error(
            "Image upload error:",
            error
          );

        }

      }

    }


    await saveUserProfile(
      currentUser.uid,
      profile
    );


    currentRole =
      role;


    showMessage(
      "تم تسجيل الدخول بنجاح."
    );


    if (
      role === "captain"
    ) {

      showScreen(
        "captainScreen"
      );

      loadCaptainRides();

    } else {

      showScreen(
        "homeScreen"
      );

      getDeviceLocation();

      loadCustomerRides();

    }


  } catch (error) {

    console.error(
      error
    );


    showMessage(
      "كود التحقق غير صحيح."
    );

  }
}


/* =========================================================
   CREATE RIDE
   ========================================================= */

async function createRide() {

  if (!currentUser) {

    showScreen(
      "authScreen"
    );

    return;
  }


  if (
    currentRole !== "customer"
  ) {

    showMessage(
      "الكابتن لا يستطيع طلب رحلة."
    );

    return;
  }


  if (!pickupLocation) {

    await getDeviceLocation();

  }


  if (!pickupLocation) {

    showMessage(
      "حدد مكان الانطلاق أولاً."
    );

    return;
  }


  if (!destinationLocation) {

    showMessage(
      "حدد مكان النزول أولاً."
    );

    return;
  }


  const passengers =
    Number(
      getValue(
        "passengers"
      )
    );


  const price =
    Number(
      getValue(
        "ridePrice"
      )
    );


  const notes =
    getValue(
      "rideNotes"
    );


  if (
    !passengers ||
    passengers < 1
  ) {

    showMessage(
      "اكتب عدد الركاب."
    );

    return;
  }


  if (
    !price ||
    price <= 0
  ) {

    showMessage(
      "اكتب سعر الرحلة."
    );

    return;
  }


  try {

    const profile =
      await getUserProfile(
        currentUser.uid
      );


    const customerName =
      profile?.name ||
      currentUser.phoneNumber ||
      "عميل";


    const ride = {

      customerId:
        currentUser.uid,

      customerName:
        customerName,

      customerPhone:
        currentUser.phoneNumber ||
        "",


      pickup: {

        lat:
          pickupLocation.lat,

        lng:
          pickupLocation.lng

      },


      destination: {

        lat:
          destinationLocation.lat,

        lng:
          destinationLocation.lng,

        name:
          destinationLocation.name ||
          "",

        address:
          destinationLocation.address ||
          ""

      },


      passengers:
        passengers,

      price:
        price,

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
      "تم نشر الرحلة للكباتن."
    );


    setText(
      "toPlace",
      "📍 حدد مكان النزول"
    );


    const priceInput =
      document.getElementById(
        "ridePrice"
      );

    const notesInput =
      document.getElementById(
        "rideNotes"
      );


    if (priceInput)
      priceInput.value =
        "";


    if (notesInput)
      notesInput.value =
        "";


    destinationLocation =
      null;

    selectedDestination =
      null;


    showScreen(
      "customerRidesScreen"
    );


    loadCustomerRides();


  } catch (error) {

    console.error(
      "Create ride error:",
      error
    );


    showMessage(
      "تعذر نشر الرحلة."
    );

  }
}


/* =========================================================
   LOAD CUSTOMER RIDES
   ========================================================= */

function loadCustomerRides() {

  if (
    unsubscribeCustomerRides
  ) {

    unsubscribeCustomerRides();

    unsubscribeCustomerRides =
      null;

  }


  if (!currentUser) {

    return;
  }


  const ridesQuery =
    query(
      collection(
        db,
        "rides"
      ),
      where(
        "customerId",
        "==",
        currentUser.uid
      ),
      limit(50)
    );


  unsubscribeCustomerRides =
    onSnapshot(
      ridesQuery,
      snapshot => {

        const list =
          document.getElementById(
            "customerRidesList"
          );


        if (!list) return;


        if (
          snapshot.empty
        ) {

          list.innerHTML = `
            <div class="empty-state">
              مفيش رحلات لسه.
            </div>
          `;

          return;
        }


        const rides =
          snapshot.docs
            .map(
              d => ({
                id:
                  d.id,

                ...d.data()

              })
            )
            .sort(
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


        list.innerHTML =
          rides
            .map(
              ride =>
                renderCustomerRide(
                  ride
                )
            )
            .join("");


        rides.forEach(
          ride => {

            loadRideOffers(
              ride.id
            );

          }
        );

      },
      error => {

        console.error(
          error
        );

        showMessage(
          "تعذر تحميل الرحلات."
        );

      }
    );
}


/* =========================================================
   RENDER CUSTOMER RIDE
   ========================================================= */

function renderCustomerRide(
  ride
) {

  const destination =
    ride.destination?.name ||
    ride.destination?.address ||
    "غير محدد";


  let status =
    "مفتوحة";


  if (
    ride.status ===
    "accepted"
  ) {

    status =
      "تم قبول الرحلة";

  }


  if (
    ride.status ===
    "cancelled"
  ) {

    status =
      "ملغاة";

  }


  return `

    <div
      class="ride-item"
      data-ride-id="${escapeHtml(ride.id)}"
    >

      <h3>
        🚕 رحلة
      </h3>

      <p>
        📍 من موقعي الحالي
      </p>

      <p>
        📍 إلى:
        ${escapeHtml(destination)}
      </p>

      <p>
        👥 الركاب:
        ${escapeHtml(ride.passengers)}
      </p>

      <p>
        💰 السعر:
        ${escapeHtml(ride.price)} جنيه
      </p>

      ${
        ride.notes
          ? `
            <p>
              📝 ${escapeHtml(
                ride.notes
              )}
            </p>
          `
          : ""
      }

      <p>
        الحالة:
        <strong>
          ${status}
        </strong>
      </p>

      <div
        id="offers-${escapeHtml(ride.id)}"
      >
        جاري تحميل عروض الكباتن...
      </div>

    </div>

  `;
}


/* =========================================================
   LOAD RIDE OFFERS
   ========================================================= */

function loadRideOffers(
  rideId
) {

  const offersRef =
    collection(
      db,
      "rides",
      rideId,
      "offers"
    );


  onSnapshot(
    offersRef,
    snapshot => {

      const container =
        document.getElementById(
          `offers-${rideId}`
        );


      if (!container) return;


      if (
        snapshot.empty
      ) {

        container.innerHTML =
          "<p>مفيش عروض من الكباتن لسه.</p>";

        return;
      }


      container.innerHTML =
        snapshot.docs
          .map(
            offerDoc => {

              const offer =
                offerDoc.data();


              return `

                <div class="offer-item">

                  <p>
                    👨‍✈️
                    ${escapeHtml(
                      offer.captainName ||
                      "كابتن"
                    )}
                  </p>

                  <p>
                    🚗
                    ${escapeHtml(
                      offer.carType ||
                      ""
                    )}
                  </p>

                  <p>
                    💰
                    ${escapeHtml(
                      offer.price
                    )}
                    جنيه
                  </p>

                  ${
                    offer.status ===
                    "accepted"
                      ? `
                        <strong>
                          تم قبول العرض
                        </strong>
                      `
                      : `
                        <button
                          class="accept-offer-btn"
                          data-ride-id="${escapeHtml(rideId)}"
                          data-captain-id="${escapeHtml(offer.captainId)}"
                        >
                          قبول العرض
                        </button>
                      `
                  }

                </div>

              `;

            }
          )
          .join("");


      container
        .querySelectorAll(
          ".accept-offer-btn"
        )
        .forEach(
          button => {

            button.addEventListener(
              "click",
              () => {

                acceptOffer(
                  button.dataset.rideId,
                  button.dataset.captainId
                );

              }
            );

          }
        );

    }
  );
}


/* =========================================================
   ACCEPT CAPTAIN OFFER
   ========================================================= */

async function acceptOffer(
  rideId,
  captainId
) {

  try {

    const rideRef =
      doc(
        db,
        "rides",
        rideId
      );


    const offerRef =
      doc(
        db,
        "rides",
        rideId,
        "offers",
        captainId
      );


    const offerSnap =
      await getDoc(
        offerRef
      );


    if (
      !offerSnap.exists()
    ) {

      showMessage(
        "العرض غير موجود."
      );

      return;
    }


    const offer =
      offerSnap.data();


    await updateDoc(
      rideRef,
      {

        status:
          "accepted",

        acceptedCaptainId:
          captainId,

        acceptedCaptainName:
          offer.captainName ||
          "",

        acceptedCaptainPhone:
          offer.captainPhone ||
          "",

        acceptedPrice:
          Number(
            offer.price
          ),

        acceptedAt:
          serverTimestamp()

      }
    );


    await updateDoc(
      offerRef,
      {

        status:
          "accepted"

      }
    );


    showMessage(
      "تم قبول عرض الكابتن."
    );


  } catch (error) {

    console.error(
      error
    );


    showMessage(
      "تعذر قبول العرض."
    );

  }
}


/* =========================================================
   LOAD CAPTAIN RIDES
   ========================================================= */

function loadCaptainRides() {

  if (
    unsubscribeCaptainRides
  ) {

    unsubscribeCaptainRides();

    unsubscribeCaptainRides =
      null;

  }


  if (!currentUser) {

    return;
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


  unsubscribeCaptainRides =
    onSnapshot(
      ridesQuery,
      snapshot => {

        const list =
          document.getElementById(
            "captainRidesList"
          );


        if (!list) return;


        if (
          snapshot.empty
        ) {

          list.innerHTML = `
            <div class="empty-state">
              مفيش رحلات متاحة حاليًا.
            </div>
          `;

          return;
        }


        const rides =
          snapshot.docs
            .map(
              d => ({
                id:
                  d.id,

                ...d.data()

              })
            );


        list.innerHTML =
          rides
            .map(
              ride =>
                renderCaptainRide(
                  ride
                )
            )
            .join("");


        list
          .querySelectorAll(
            ".send-offer-btn"
          )
          .forEach(
            button => {

              button.addEventListener(
                "click",
                () => {

                  sendCaptainOffer(
                    button.dataset.rideId
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

        showMessage(
          "تعذر تحميل الرحلات."
        );

      }
    );
}


/* =========================================================
   RENDER CAPTAIN RIDE
   ========================================================= */

function renderCaptainRide(
  ride
) {

  const destination =
    ride.destination?.name ||
    ride.destination?.address ||
    "غير محدد";


  return `

    <div class="ride-item">

      <h3>
        🚕 رحلة جديدة
      </h3>

      <p>
        👤 العميل:
        ${escapeHtml(
          ride.customerName ||
          "عميل"
        )}
      </p>

      <p>
        📍 الانطلاق:
        موقع العميل
      </p>

      <p>
        📍 النزول:
        ${escapeHtml(
          destination
        )}
      </p>

      <p>
        👥 عدد الركاب:
        ${escapeHtml(
          ride.passengers
        )}
      </p>

      <p>
        💰 السعر المطلوب:
        ${escapeHtml(
          ride.price
        )}
        جنيه
      </p>

      ${
        ride.notes
          ? `
            <p>
              📝 الملاحظات:
              ${escapeHtml(
                ride.notes
              )}
            </p>
          `
          : ""
      }


      <input
        class="captain-offer-price"
        id="offer-${escapeHtml(ride.id)}"
        type="number"
        min="1"
        placeholder="السعر الذي ستعرضه"
      />


      <button
        class="send-offer-btn primary-btn"
        data-ride-id="${escapeHtml(ride.id)}"
        type="button"
      >
        إرسال عرض
      </button>

    </div>

  `;
}


/* =========================================================
   SEND CAPTAIN OFFER
   ========================================================= */

async function sendCaptainOffer(
  rideId
) {

  if (!currentUser) {

    showScreen(
      "authScreen"
    );

    return;
  }


  const priceInput =
    document.getElementById(
      `offer-${rideId}`
    );


  const price =
    Number(
      priceInput?.value
    );


  if (
    !price ||
    price <= 0
  ) {

    showMessage(
      "اكتب السعر."
    );

    return;
  }


  try {

    const profile =
      await getUserProfile(
        currentUser.uid
      );


    if (
      profile?.role !==
      "captain"
    ) {

      showMessage(
        "لازم تكون مسجل ككابتن."
      );

      return;
    }


    const offerRef =
      doc(
        db,
        "rides",
        rideId,
        "offers",
        currentUser.uid
      );


    await setDoc(
      offerRef,
      {

        captainId:
          currentUser.uid,

        captainName:
          profile.name ||
          "كابتن",

        captainPhone:
          currentUser.phoneNumber ||
          profile.phone ||
          "",

        carType:
          profile.carType ||
          "",

        carModel:
          profile.carModel ||
          "",

        carNumber:
          profile.carNumber ||
          "",

        photoURL:
          profile.photoURL ||
          "",

        price:
          price,

        status:
          "pending",

        createdAt:
          serverTimestamp()

      },
      {
        merge: true
      }
    );


    showMessage(
      "تم إرسال عرضك للعميل."
    );


    if (priceInput) {

      priceInput.value =
        "";

    }


  } catch (error) {

    console.error(
      error
    );


    showMessage(
      "تعذر إرسال العرض."
    );

  }
}


/* =========================================================
   CAPTAIN HISTORY
   ========================================================= */

async function loadCaptainHistory() {

  const list =
    document.getElementById(
      "captainHistoryList"
    );


  if (!list) return;


  if (!currentUser) {

    return;
  }


  list.innerHTML =
    "جاري التحميل...";


  try {

    const q =
      query(
        collection(
          db,
          "rides"
        ),
        where(
          "acceptedCaptainId",
          "==",
          currentUser.uid
        ),
        limit(50)
      );


    const snapshot =
      await getDocs(q);


    if (
      snapshot.empty
    ) {

      list.innerHTML =
        "<div class='empty-state'>مفيش رحلات سابقة.</div>";

      return;
    }


    const rides =
      snapshot.docs.map(
        d => ({
          id:
            d.id,

          ...d.data()

        })
      );


    list.innerHTML =
      rides
        .map(
          ride => {

            const destination =
              ride.destination?.name ||
              ride.destination?.address ||
              "غير محدد";


            return `

              <div class="ride-item">

                <h3>
                  🚕 رحلة مكتملة
                </h3>

                <p>
                  👤 العميل:
                  ${escapeHtml(
                    ride.customerName ||
                    ""
                  )}
                </p>

                <p>
                  📍 النزول:
                  ${escapeHtml(
                    destination
                  )}
                </p>

                <p>
                  💰 السعر:
                  ${escapeHtml(
                    ride.acceptedPrice ||
                    ride.price ||
                    ""
                  )}
                  جنيه
                </p>

              </div>

            `;

          }
        )
        .join("");


  } catch (error) {

    console.error(
      error
    );


    list.innerHTML =
      "تعذر تحميل الرحلات السابقة.";

  }
}


/* =========================================================
   PROFILE
   ========================================================= */

async function loadProfileScreen() {

  const container =
    document.getElementById(
      "profileContent"
    );


  if (!container) return;


  if (!currentUser) {

    container.innerHTML = `

      <div class="empty-state">

        <p>
          سجل الدخول أولاً
        </p>

        <button
          id="profileLoginBtn"
          class="primary-btn"
          type="button"
        >
          تسجيل الدخول
        </button>

      </div>

    `;


    document
      .getElementById(
        "profileLoginBtn"
      )
      ?.addEventListener(
        "click",
        () => {

          showScreen(
            "authScreen"
          );

        }
      );


    return;
  }


  const profile =
    await getUserProfile(
      currentUser.uid
    );


  if (!profile) {

    container.innerHTML =
      "مفيش بيانات للحساب.";

    return;
  }


  container.innerHTML = `

    <div class="profile-card">

      <h3>
        👤 ${escapeHtml(
          profile.name ||
          "بدون اسم"
        )}
      </h3>

      <p>
        📱 ${escapeHtml(
          profile.phone ||
          currentUser.phoneNumber ||
          ""
        )}
      </p>

      <p>
        النوع:
        ${
          profile.role ===
          "captain"
            ? "كابتن"
            : "راكب"
        }
      </p>

      ${
        profile.role ===
        "captain"
          ? `

            <p>
              🚗 نوع العربية:
              ${escapeHtml(
                profile.carType ||
                ""
              )}
            </p>

            <p>
              🚘 الموديل:
              ${escapeHtml(
                profile.carModel ||
                ""
              )}
            </p>

            <p>
              🔢 رقم العربية:
              ${escapeHtml(
                profile.carNumber ||
                ""
              )}
            </p>

          `
          : ""
      }

    </div>

  `;
}


/* =========================================================
   LOGOUT
   ========================================================= */

async function logout() {

  try {

    await signOut(
      auth
    );


    currentUser =
      null;

    currentRole =
      "customer";


    pickupLocation =
      null;

    destinationLocation =
      null;

    selectedDestination =
      null;


    if (
      unsubscribeCustomerRides
    ) {

      unsubscribeCustomerRides();

      unsubscribeCustomerRides =
        null;

    }


    if (
      unsubscribeCaptainRides
    ) {

      unsubscribeCaptainRides();

      unsubscribeCaptainRides =
        null;

    }


    showScreen(
      "authScreen"
    );


    showMessage(
      "تم تسجيل الخروج."
    );


  } catch (error) {

    console.error(
      error
    );

    showMessage(
      "تعذر تسجيل الخروج."
    );

  }
}


/* =========================================================
   SETUP EVENTS
   ========================================================= */

function setupEvents() {


  /* تحديد الموقع */

  document
    .getElementById(
      "currentLocationBtn"
    )
    ?.addEventListener(
      "click",
      async () => {

        await getDeviceLocation();

      }
    );


  /* فتح الخريطة */

  document
    .getElementById(
      "toPlace"
    )
    ?.addEventListener(
      "click",
      async () => {

        await openMap();

      }
    );


  /* إغلاق الخريطة */

  document
    .getElementById(
      "closeMapBtn"
    )
    ?.addEventListener(
      "click",
      () => {

        showScreen(
          "homeScreen"
        );

      }
    );


  /* البحث في الخريطة */

  const destinationSearch =
    document.getElementById(
      "destinationSearch"
    );


  if (destinationSearch) {

    let timer =
      null;


    destinationSearch.addEventListener(
      "input",
      () => {

        clearTimeout(
          timer
        );


        timer =
          setTimeout(
            () => {

              searchPlaces(
                destinationSearch.value
              );

            },
            600
          );

      }
    );

  }


  /* تأكيد المكان */

  document
    .getElementById(
      "confirmDestinationBtn"
    )
    ?.addEventListener(
      "click",
      async () => {

        if (
          !selectedDestination
        ) {

          showMessage(
            "اختار مكان النزول على الخريطة."
          );

          return;
        }


        destinationLocation = {

          lat:
            selectedDestination.lat,

          lng:
            selectedDestination.lng,

          name:
            selectedDestination.name ||
            "",

          address:
            selectedDestination.address ||
            ""

        };


        setText(
          "toPlace",
          "✅ تم تحديد مكان النزول"
        );


        showScreen(
          "homeScreen"
        );


        if (
          pickupLocation &&
          destinationLocation
        ) {

          await drawRoute();

        }

      }
    );


  /* طلب الرحلة */

  document
    .getElementById(
      "requestBtn"
    )
    ?.addEventListener(
      "click",
      createRide
    );


  /* تغيير نوع الحساب */

  document
    .getElementById(
      "authRole"
    )
    ?.addEventListener(
      "change",
      event => {

        const fields =
          document.getElementById(
            "captainFields"
          );


        if (!fields) return;


        fields.style.display =
          event.target.value ===
          "captain"
            ? "block"
            : "none";

      }
    );


  /* إرسال كود */

  document
    .getElementById(
      "sendCodeBtn"
    )
    ?.addEventListener(
      "click",
      sendPhoneCode
    );


  /* تأكيد الكود */

  document
    .getElementById(
      "verifyCodeBtn"
    )
    ?.addEventListener(
      "click",
      verifyPhoneCode
    );


  /* تسجيل الخروج */

  document
    .getElementById(
      "logoutBtn"
    )
    ?.addEventListener(
      "click",
      logout
    );


  /* رحلات الكابتن السابقة */

  document
    .getElementById(
      "captainHistoryBtn"
    )
    ?.addEventListener(
      "click",
      async () => {

        showScreen(
          "captainHistoryScreen"
        );

        await loadCaptainHistory();

      }
    );


  /* رجوع للكابتن */

  document
    .getElementById(
      "backCaptainBtn"
    )
    ?.addEventListener(
      "click",
      () => {

        showScreen(
          "captainScreen"
        );

      }
    );


  /* التنقل */

  document
    .querySelectorAll(
      "[data-screen]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          async () => {

            const screen =
              button.dataset.screen;


            if (
              screen ===
              "profileScreen"
            ) {

              showScreen(
                screen
              );

              await loadProfileScreen();

              return;

            }


            if (
              screen ===
              "customerRidesScreen"
            ) {

              if (!currentUser) {

                showScreen(
                  "authScreen"
                );

                return;

              }


              showScreen(
                screen
              );

              loadCustomerRides();

              return;

            }


            showScreen(
              screen
            );

          }
        );

      }
    );

}


/* =========================================================
   AUTH STATE
   ========================================================= */

onAuthStateChanged(
  auth,
  async user => {

    currentUser =
      user;


    if (!user) {

      currentRole =
        "customer";

      return;

    }


    try {

      const profile =
        await getUserProfile(
          user.uid
        );


      if (profile) {

        currentRole =
          profile.role ||
          "customer";

      }


      if (
        currentRole ===
        "captain"
      ) {

        showScreen(
          "captainScreen"
        );

        loadCaptainRides();

      } else {

        showScreen(
          "homeScreen"
        );

        loadCustomerRides();

        if (!pickupLocation) {

          getDeviceLocation();

        }

      }

    } catch (error) {

      console.error(
        error
      );

    }

  }
);


/* =========================================================
   START APP
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    renderApp();

  }
);
