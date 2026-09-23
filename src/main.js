import "./style.css";
import "leaflet/dist/leaflet.css";

import L from "leaflet";

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
  getDocs,
  query,
  where,
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

import {
  getCurrentPosition,
  requestPermissions,
  checkPermissions
} from "@capacitor/geolocation";


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
const storage = getStorage(firebaseApp);


/* ======================================================
   GLOBAL VARIABLES
   ====================================================== */

let currentUser = null;
let currentRole = "customer";

let selectedPickup = "";
let selectedDestination = "";

let selectedPickupCoords = null;
let selectedDestinationCoords = null;

let map = null;
let pickupMarker = null;
let destinationMarker = null;
let routeLine = null;

let mapSearchTimer = null;

let recaptcha = null;
let confirmationResult = null;

let unsubscribeCaptainRides = null;
let unsubscribeCustomerOffers = null;


/* ======================================================
   HELPERS
   ====================================================== */

const $ = selector => document.querySelector(selector);

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

function formatDate(timestamp) {
  if (!timestamp) return "";

  try {
    const date = timestamp.toDate
      ? timestamp.toDate()
      : new Date(timestamp);

    return date.toLocaleString("ar-EG");
  } catch {
    return "";
  }
}


/* ======================================================
   MAIN HTML
   ====================================================== */

const app = $("#app");

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
      type="button">
      👤
    </button>
  </header>


  <div
    id="messageBox"
    class="message-box"
    style="display:none">
  </div>


  <!-- ================= HOME ================= -->

  <section
    id="homeScreen"
    class="screen active">

    <div class="hero">
      <h1>اطلب رحلتك بسهولة 🚕</h1>

      <p>
        حدد مكان الانطلاق والوصول
        واكتب السعر المناسب لك.
      </p>
    </div>


    <div class="card">

      <label>
        مكان الانطلاق
      </label>

      <button
        id="fromPlace"
        class="location-button"
        type="button">

        📍 تحديد موقعي الحالي

      </button>


      <div
        id="pickupInfo"
        class="location-info">

        لم يتم تحديد مكان الانطلاق

      </div>


      <label>
        مكان الوصول
      </label>

      <input
        id="destinationSearch"
        type="text"
        placeholder="اكتب اسم المكان أو الشارع أو القرية..."
        autocomplete="off"
      />


      <div
        id="searchResults"
        class="search-results"
        style="display:none">
      </div>


      <div
        id="map"
        class="map">
      </div>


      <div
        id="mapSelectedAddress"
        class="location-info">

        حدد مكان الوصول من البحث أو من الخريطة

      </div>


      <label>
        سعر الرحلة المقترح
      </label>

      <div class="input-row">

        <input
          id="price"
          type="number"
          min="1"
          placeholder="مثال: 100"
        />

        <span>جنيه</span>

      </div>


      <label>
        عدد الركاب
      </label>

      <select id="passengers">

        <option value="1">
          راكب واحد
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


      <label>
        ملاحظات
      </label>

      <textarea
        id="notes"
        rows="3"
        placeholder="مثال: معايا شنطة كبيرة أو محتاج مكان واسع...">
      </textarea>


      <button
        id="requestRideBtn"
        class="primary-button"
        type="button">

        🚕 اطلب الرحلة

      </button>

    </div>


    <div
      id="customerRideBox"
      class="card"
      style="display:none">

      <h3>
        رحلتك الحالية
      </h3>

      <div id="customerRideDetails"></div>

      <div id="offersBox"></div>

    </div>

  </section>


  <!-- ================= CAPTAIN ================= -->

  <section
    id="captainScreen"
    class="screen">

    <div class="hero">

      <h2>
        رحلات قريبة منك 🚕
      </h2>

      <p>
        اختار الرحلة واكتب السعر اللي يناسبك.
      </p>

    </div>


    <div
      id="captainStatusBox"
      class="card">
    </div>


    <div
      id="captainRides"
      class="list">
    </div>

  </section>


  <!-- ================= PROFILE ================= -->

  <section
    id="profileScreen"
    class="screen">

    <div class="hero">

      <h2>
        حسابي 👤
      </h2>

    </div>


    <div class="card">

      <div id="profileInfo">
        جاري تحميل البيانات...
      </div>

      <button
        id="logoutBtn"
        class="secondary-button"
        type="button">

        تسجيل الخروج

      </button>

    </div>

  </section>


  <!-- ================= AUTH ================= -->

  <section
    id="authScreen"
    class="screen">

    <div class="hero">

      <h2>
        تسجيل الدخول
      </h2>

      <p>
        سجل برقم الموبايل لإنشاء حسابك.
      </p>

    </div>


    <div class="card">

      <label>
        نوع الحساب
      </label>

      <select id="accountRole">

        <option value="customer">
          عميل
        </option>

        <option value="captain">
          كابتن
        </option>

      </select>


      <label>
        الاسم
      </label>

      <input
        id="accountName"
        type="text"
        placeholder="اكتب اسمك"
      />


      <div
        id="captainFields"
        style="display:none">

        <label>
          نوع العربية
        </label>

        <input
          id="captainCarType"
          type="text"
          placeholder="ملاكي / ميكروباص / نقل..."
        />


        <label>
          موديل العربية
        </label>

        <input
          id="captainCarModel"
          type="text"
          placeholder="مثال: تويوتا 2022"
        />


        <label>
          رقم السيارة
        </label>

        <input
          id="captainCarNumber"
          type="text"
          placeholder="رقم اللوحة"
        />


        <label>
          صورة العربية
        </label>

        <input
          id="carImage"
          type="file"
          accept="image/*"
        />

      </div>


      <label>
        رقم الموبايل
      </label>

      <input
        id="phone"
        type="tel"
        placeholder="+201xxxxxxxxx"
      />


      <div
        id="recaptcha"
        style="margin:15px 0">
      </div>


      <button
        id="sendCodeBtn"
        class="primary-button"
        type="button">

        إرسال كود التحقق

      </button>


      <div
        id="codeSection"
        style="display:none">

        <label>
          كود التحقق
        </label>

        <input
          id="verificationCode"
          type="number"
          placeholder="اكتب الكود"
        />


        <button
          id="verifyCodeBtn"
          class="primary-button"
          type="button">

          تأكيد الكود

        </button>

      </div>


      <div
        id="authMsg"
        class="message-box"
        style="display:none">
      </div>

    </div>

  </section>


  <!-- ================= NAV ================= -->

  <nav class="bottom-nav">

    <button
      id="homeNav"
      type="button">

      🏠
      <span>الرئيسية</span>

    </button>


    <button
      id="captainNav"
      type="button">

      🚕
      <span>الكابتن</span>

    </button>


    <button
      id="profileNav"
      type="button">

      👤
      <span>حسابي</span>

    </button>

  </nav>

</div>
`;


/* ======================================================
   SCREEN NAVIGATION
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

  if (screenId === "captainScreen") {
    loadCaptainRides();
  }

  if (screenId === "profileScreen") {
    loadProfile();
  }
}


$("#homeNav").addEventListener("click", () => {
  showScreen("homeScreen");
});


$("#captainNav").addEventListener("click", async () => {

  if (!currentUser) {
    await openAuth();
    return;
  }

  showScreen("captainScreen");
});


$("#profileNav").addEventListener("click", async () => {

  if (!currentUser) {
    await openAuth();
    return;
  }

  showScreen("profileScreen");
});


$("#profileBtn").addEventListener("click", async () => {

  if (!currentUser) {
    await openAuth();
    return;
  }

  showScreen("profileScreen");
});


/* ======================================================
   MAP
   ====================================================== */

function createMap() {

  if (map) return;

  const defaultCenter = [
    30.558,
    30.993
  ];

  map = L.map("map", {
    zoomControl: true
  }).setView(
    defaultCenter,
    10
  );


  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      attribution:
        '&copy; OpenStreetMap contributors',

      maxZoom: 19
    }
  ).addTo(map);


  map.on("click", async event => {

    const lat = event.latlng.lat;
    const lng = event.latlng.lng;

    selectedDestinationCoords = {
      lat,
      lng
    };


    setDestinationMarker(
      lat,
      lng
    );


    const address =
      await getAddressFromCoordinates(
        lat,
        lng
      );

    selectedDestination = address;


    $("#mapSelectedAddress").innerHTML = `
      📍 <strong>مكان الوصول</strong>
      <br>
      ${escapeHtml(address)}
    `;

    $("#destinationSearch").value =
      address;

    drawRouteIfReady();
  });


  setTimeout(() => {
    map.invalidateSize();
  }, 500);
}


function setPickupMarker(lat, lng) {

  if (pickupMarker) {
    pickupMarker.remove();
  }


  pickupMarker = L.marker(
    [lat, lng],
    {
      icon: L.divIcon({
        className: "custom-map-marker",
        html: "📍",
        iconSize: [35, 35],
        iconAnchor: [17, 34]
      })
    }
  ).addTo(map);


  pickupMarker.bindPopup(
    "مكان الانطلاق"
  );
}


function setDestinationMarker(lat, lng) {

  if (destinationMarker) {
    destinationMarker.remove();
  }


  destinationMarker = L.marker(
    [lat, lng],
    {
      icon: L.divIcon({
        className: "custom-map-marker",
        html: "🏁",
        iconSize: [35, 35],
        iconAnchor: [17, 34]
      })
    }
  ).addTo(map);


  destinationMarker.bindPopup(
    "مكان الوصول"
  );
}


function drawRouteIfReady() {

  if (
    !selectedPickupCoords ||
    !selectedDestinationCoords
  ) {
    return;
  }


  const start =
    selectedPickupCoords;

  const end =
    selectedDestinationCoords;


  const url =
    "https://router.project-osrm.org/route/v1/driving/" +
    `${start.lng},${start.lat};` +
    `${end.lng},${end.lat}` +
    "?overview=full&geometries=geojson";


  fetch(url)
    .then(response => response.json())
    .then(data => {

      if (
        !data.routes ||
        !data.routes.length
      ) {
        return;
      }


      const geometry =
        data.routes[0].geometry;


      if (routeLine) {
        routeLine.remove();
      }


      routeLine =
        L.geoJSON(geometry, {
          style: {
            weight: 5,
            opacity: 0.8
          }
        }).addTo(map);


      map.fitBounds(
        routeLine.getBounds(),
        {
          padding: [30, 30]
        }
      );

    })
    .catch(error => {
      console.error(
        "OSRM error:",
        error
      );
    });
}


/* ======================================================
   CURRENT LOCATION
   ====================================================== */

async function getDeviceLocation() {

  try {

    try {

      const permission =
        await checkPermissions();


      if (
        permission.location !==
        "granted"
      ) {

        const requested =
          await requestPermissions();


        if (
          requested.location !==
          "granted"
        ) {

          throw new Error(
            "LOCATION_PERMISSION_DENIED"
          );

        }

      }

    } catch (capacitorError) {

      if (
        !navigator.geolocation
      ) {
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
        lat:
          position.coords.latitude,

        lng:
          position.coords.longitude,

        accuracy:
          position.coords.accuracy
      };

    } catch (nativeError) {

      if (
        !navigator.geolocation
      ) {
        throw nativeError;
      }


      return await new Promise(
        (resolve, reject) => {

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
   GET ADDRESS FROM COORDINATES
   ====================================================== */

async function getAddressFromCoordinates(
  lat,
  lng
) {

  try {

    const response =
      await fetch(
        "https://nominatim.openstreetmap.org/reverse" +
        `?lat=${encodeURIComponent(lat)}` +
        `&lon=${encodeURIComponent(lng)}` +
        "&format=json" +
        "&accept-language=ar"
      );


    if (!response.ok) {
      throw new Error(
        "Reverse geocoding failed"
      );
    }


    const data =
      await response.json();


    return (
      data.display_name ||
      `${lat.toFixed(6)}, ${lng.toFixed(6)}`
    );

  } catch (error) {

    console.error(error);

    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

  }

}


/* ======================================================
   CURRENT LOCATION BUTTON
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
      "جاري تحديد موقعك الحالي...",
      "info"
    );


    try {

      const position =
        await getDeviceLocation();


      selectedPickupCoords = {
        lat: position.lat,
        lng: position.lng
      };


      setPickupMarker(
        position.lat,
        position.lng
      );


      map.setView(
        [
          position.lat,
          position.lng
        ],
        16
      );


      const address =
        await getAddressFromCoordinates(
          position.lat,
          position.lng
        );


      selectedPickup =
        address;


      $("#pickupInfo").innerHTML = `
        📍 <strong>مكان الانطلاق</strong>
        <br>
        ${escapeHtml(address)}
      `;


      button.textContent =
        "📍 تم تحديد موقعي";


      showMessage(
        `تم تحديد موقعك بدقة حوالي ${Math.round(position.accuracy)} متر`,
        "success"
      );


      drawRouteIfReady();

    } catch (error) {

      console.error(error);


      if (
        error?.message ===
        "LOCATION_PERMISSION_DENIED" ||
        error?.code === 1
      ) {

        showMessage(
          "اسمح للتطبيق باستخدام الموقع من إعدادات الهاتف ثم حاول مرة أخرى.",
          "error"
        );

      } else {

        showMessage(
          "تعذر تحديد موقعك. تأكد أن GPS شغال وحاول مرة أخرى.",
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
   SEARCH PLACES - NOMINATIM
   ====================================================== */

$("#destinationSearch").addEventListener(
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

      $("#searchResults").style.display =
        "none";

      $("#searchResults").innerHTML =
        "";

      return;

    }


    mapSearchTimer =
      setTimeout(
        () => searchPlaces(value),
        700
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

    const url =
      "https://nominatim.openstreetmap.org/search" +
      `?q=${encodeURIComponent(text)}` +
      "&format=json" +
      "&addressdetails=1" +
      "&limit=8" +
      "&countrycodes=eg" +
      "&accept-language=ar";


    const response =
      await fetch(url);


    if (!response.ok) {
      throw new Error(
        "Search failed"
      );
    }


    const results =
      await response.json();


    if (!results.length) {

      resultsBox.innerHTML = `
        <div class="card">
          لا توجد نتائج.
          جرّب اسم مكان مختلف.
        </div>
      `;

      return;
    }


    resultsBox.innerHTML =
      results
        .map(
          (place, index) => `
            <button
              type="button"
              class="search-result"
              data-index="${index}">

              📍
              <strong>
                ${escapeHtml(
                  place.display_name
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
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            const place =
              results[
                Number(
                  button.dataset.index
                )
              ];


            selectNominatimPlace(
              place
            );

          }
        );

      });

  } catch (error) {

    console.error(error);


    resultsBox.innerHTML = `
      <div class="card">
        تعذر البحث.
        تأكد من الإنترنت وحاول مرة أخرى.
      </div>
    `;

  }

}


function selectNominatimPlace(
  place
) {

  const lat =
    Number(place.lat);

  const lng =
    Number(place.lon);


  selectedDestinationCoords = {
    lat,
    lng
  };


  selectedDestination =
    place.display_name;


  setDestinationMarker(
    lat,
    lng
  );


  map.setView(
    [lat, lng],
    16
  );


  $("#destinationSearch").value =
    place.display_name;


  $("#mapSelectedAddress").innerHTML = `
    🏁 <strong>مكان الوصول</strong>
    <br>
    ${escapeHtml(
      place.display_name
    )}
  `;


  $("#searchResults").style.display =
    "none";


  drawRouteIfReady();

}


/* ======================================================
   REQUEST RIDE
   ====================================================== */

$("#requestRideBtn").addEventListener(
  "click",
  async () => {

    if (!currentUser) {

      await openAuth();

      showMessage(
        "سجل دخولك الأول علشان تطلب رحلة.",
        "error"
      );

      return;

    }


    if (
      !selectedPickupCoords
    ) {

      showMessage(
        "حدد مكان الانطلاق الأول.",
        "error"
      );

      return;

    }


    if (
      !selectedDestinationCoords
    ) {

      showMessage(
        "حدد مكان الوصول الأول.",
        "error"
      );

      return;

    }


    const price =
      Number(
        $("#price").value
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


    const passengers =
      Number(
        $("#passengers").value
      );


    const notes =
      $("#notes").value.trim();


    const button =
      $("#requestRideBtn");


    button.disabled = true;

    button.textContent =
      "جاري نشر الرحلة...";


    try {

      const rideData = {

        customerId:
          currentUser.uid,

        customerPhone:
          currentUser.phoneNumber ||
          "",

        pickup:
          selectedPickup,

        destination:
          selectedDestination,

        pickupCoords:
          selectedPickupCoords,

        destinationCoords:
          selectedDestinationCoords,

        price,

        passengers,

        notes,

        status:
          "open",

        acceptedOfferId:
          "",

        acceptedCaptainId:
          "",

        createdAt:
          serverTimestamp()

      };


      const rideRef =
        await addDoc(
          collection(
            db,
            "rides"
          ),
          rideData
        );


      showMessage(
        "تم نشر الرحلة للكباتن بنجاح 🚕",
        "success"
      );


      $("#customerRideBox").style.display =
        "block";


      $("#customerRideDetails").innerHTML = `
        <div class="ride-details">

          <p>
            📍 <strong>من:</strong>
            ${escapeHtml(
              selectedPickup
            )}
          </p>

          <p>
            🏁 <strong>إلى:</strong>
            ${escapeHtml(
              selectedDestination
            )}
          </p>

          <p>
            💰 <strong>السعر:</strong>
            ${price} جنيه
          </p>

          <p>
            👥 <strong>الركاب:</strong>
            ${passengers}
          </p>

          ${
            notes
              ? `
                <p>
                  📝 <strong>ملاحظات:</strong>
                  ${escapeHtml(notes)}
                </p>
              `
              : ""
          }

          <p>
            🆔 رقم الرحلة:
            ${rideRef.id}
          </p>

        </div>
      `;


      listenToCustomerOffers(
        rideRef.id
      );


    } catch (error) {

      console.error(error);

      showMessage(
        error.message ||
        "حصل خطأ أثناء نشر الرحلة.",
        "error"
      );

    } finally {

      button.disabled =
        false;

      button.textContent =
        "🚕 اطلب الرحلة";

    }

  }
);


/* ======================================================
   CUSTOMER OFFERS
   ====================================================== */

function listenToCustomerOffers(
  rideId
) {

  if (unsubscribeCustomerOffers) {
    unsubscribeCustomerOffers();
    unsubscribeCustomerOffers = null;
  }


  const offersRef =
    collection(
      db,
      "rides",
      rideId,
      "offers"
    );


  unsubscribeCustomerOffers =
    onSnapshot(
      offersRef,
      async snapshot => {

        const offers =
          snapshot.docs.map(
            docSnap => ({
              id:
                docSnap.id,

              ...docSnap.data()
            })
          );


        if (!offers.length) {

          $("#offersBox").innerHTML = `
            <div class="card">
              ⏳ في انتظار عروض الكباتن...
            </div>
          `;

          return;

        }


        const captainCards =
          await Promise.all(
            offers.map(
              async offer => {

                let captain =
                  null;


                try {

                  const captainSnap =
                    await getDoc(
                      doc(
                        db,
                        "users",
                        offer.captainId
                      )
                    );


                  if (
                    captainSnap.exists()
                  ) {

                    captain =
                      captainSnap.data();

                  }

                } catch {}



                return `
                  <div class="offer-card">

                    <div>
                      <strong>
                        🚕
                        ${escapeHtml(
                          captain?.name ||
                          "كابتن"
                        )}
                      </strong>
                    </div>

                    <div>
                      🚗
                      ${escapeHtml(
                        captain?.carType ||
                        ""
                      )}
                      ${escapeHtml(
                        captain?.carModel ||
                        ""
                      )}
                    </div>

                    <div>
                      💰
                      <strong>
                        ${offer.price}
                        جنيه
                      </strong>
                    </div>

                    <div>
                      ⭐
                      ${
                        captain?.rating ||
                        "جديد"
                      }
                    </div>

                    <button
                      type="button"
                      class="primary-button accept-offer"
                      data-ride="${rideId}"
                      data-offer="${offer.id}"
                      data-captain="${offer.captainId}">

                      قبول العرض

                    </button>

                  </div>
                `;

              }
            )
          );


        $("#offersBox").innerHTML = `
          <h3>
            عروض الكباتن
          </h3>

          ${captainCards.join("")}
        `;


        $("#offersBox")
          .querySelectorAll(
            ".accept-offer"
          )
          .forEach(button => {

            button.addEventListener(
              "click",
              () => {

                acceptCaptainOffer(
                  button.dataset.ride,
                  button.dataset.offer,
                  button.dataset.captain
                );

              }
            );

          });

      }
    );

}


/* ======================================================
   ACCEPT CAPTAIN OFFER
   ====================================================== */

async function acceptCaptainOffer(
  rideId,
  offerId,
  captainId
) {

  if (!currentUser) {
    return;
  }


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
        offerId
      );


    await updateDoc(
      rideRef,
      {
        status:
          "accepted",

        acceptedOfferId:
          offerId,

        acceptedCaptainId:
          captainId,

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
      "تم قبول عرض الكابتن بنجاح 🚕",
      "success"
    );


  } catch (error) {

    console.error(error);

    showMessage(
      error.message ||
      "تعذر قبول العرض.",
      "error"
    );

  }

}


/* ======================================================
   CAPTAIN RIDES
   ====================================================== */

async function loadCaptainRides() {

  if (!currentUser) {
    return;
  }


  if (unsubscribeCaptainRides) {
    unsubscribeCaptainRides();
    unsubscribeCaptainRides = null;
  }


  const statusBox =
    $("#captainStatusBox");


  statusBox.innerHTML = `
    جاري تحميل الرحلات...
  `;


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

      statusBox.innerHTML = `
        <strong>
          أكمل بيانات حسابك الأول.
        </strong>
      `;

      return;

    }


    const userData =
      userSnap.data();


    if (
      userData.role !==
      "captain"
    ) {

      statusBox.innerHTML = `
        <strong>
          حسابك مسجل كعميل.
        </strong>

        <br>

        لو أنت كابتن غير نوع الحساب من صفحة الحساب.
      `;

      return;

    }


    statusBox.innerHTML = `
      <strong>
        👋 أهلاً يا
        ${escapeHtml(
          userData.name ||
          "كابتن"
        )}
      </strong>

      <br>

      🚗
      ${escapeHtml(
        userData.carType ||
        ""
      )}

      ${escapeHtml(
        userData.carModel ||
        ""
      )}
    `;


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
                docSnap => ({
                  id:
                    docSnap.id,

                  ...docSnap.data()
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


          renderCaptainRides(
            rides
          );

        },

        error => {

          console.error(error);

          $("#captainRides").innerHTML = `
            <div class="card">
              تعذر تحميل الرحلات.
              <br>
              ${escapeHtml(
                error.message ||
                ""
              )}
            </div>
          `;

        }
      );


  } catch (error) {

    console.error(error);

    statusBox.innerHTML = `
      تعذر تحميل بيانات الكابتن.
    `;

  }

}


/* ======================================================
   RENDER CAPTAIN RIDES
   ====================================================== */

async function renderCaptainRides(
  rides
) {

  const container =
    $("#captainRides");


  if (!rides.length) {

    container.innerHTML = `
      <div class="card">
        🚕 لا توجد رحلات متاحة حالياً.
      </div>
    `;

    return;

  }


  const html =
    rides.map(
      ride => {

        return `
          <div class="ride-card">

            <div class="ride-title">
              🚕 طلب رحلة
            </div>


            <div>
              📍
              <strong>
                من:
              </strong>

              ${escapeHtml(
                ride.pickup ||
                ""
              )}
            </div>


            <div>
              🏁
              <strong>
                إلى:
              </strong>

              ${escapeHtml(
                ride.destination ||
                ""
              )}
            </div>


            <div>
              💰
              السعر المقترح:

              <strong>
                ${ride.price}
                جنيه
              </strong>
            </div>


            <div>
              👥
              عدد الركاب:

              <strong>
                ${ride.passengers || 1}
              </strong>
            </div>


            ${
              ride.notes
                ? `
                  <div>
                    📝
                    ${escapeHtml(
                      ride.notes
                    )}
                  </div>
                `
                : ""
            }


            <div class="offer-row">

              <input
                type="number"
                min="1"
                class="captain-offer-price"
                data-ride="${ride.id}"
                placeholder="اكتب سعرك"
              />


              <button
                type="button"
                class="primary-button send-offer"
                data-ride="${ride.id}">

                إرسال عرض

              </button>

            </div>

          </div>
        `;

      }
    );


  container.innerHTML =
    html.join("");


  container
    .querySelectorAll(
      ".send-offer"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const rideId =
            button.dataset.ride;


          const input =
            container.querySelector(
              `.captain-offer-price[data-ride="${rideId}"]`
            );


          sendCaptainOffer(
            rideId,
            input
          );

        }
      );

    });

}


/* ======================================================
   SEND CAPTAIN OFFER
   ====================================================== */

async function sendCaptainOffer(
  rideId,
  input
) {

  if (!currentUser) {

    showMessage(
      "سجل دخولك ككابتن الأول.",
      "error"
    );

    return;

  }


  const price =
    Number(
      input?.value
    );


  if (
    !price ||
    price <= 0
  ) {

    showMessage(
      "اكتب السعر اللي هتقبل بيه الرحلة.",
      "error"
    );

    return;

  }


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

      showMessage(
        "أكمل بيانات الكابتن الأول.",
        "error"
      );

      return;

    }


    const userData =
      userSnap.data();


    if (
      userData.role !==
      "captain"
    ) {

      showMessage(
        "لازم يكون الحساب كابتن علشان تبعت عرض.",
        "error"
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
          userData.name ||
          "",

        carType:
          userData.carType ||
          "",

        carModel:
          userData.carModel ||
          "",

        carNumber:
          userData.carNumber ||
          "",

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
      "تم إرسال عرضك للعميل بنجاح.",
      "success"
    );


    input.value = "";


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
   AUTH / RECAPTCHA
   ====================================================== */

function setupRecaptcha() {

  if (recaptcha) {
    return recaptcha;
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

    return recaptcha;

  } catch (error) {

    console.error(
      "Recaptcha error:",
      error
    );

    return null;

  }

}


/* ======================================================
   OPEN AUTH
   ====================================================== */

async function openAuth() {

  showScreen(
    "authScreen"
  );


  setupRecaptcha();


  if (!currentUser) {
    return;
  }


  try {

    const snap =
      await getDoc(
        doc(
          db,
          "users",
          currentUser.uid
        )
      );


    if (
      snap.exists()
    ) {

      const data =
        snap.data();


      $("#accountRole").value =
        data.role ||
        "customer";


      $("#accountName").value =
        data.name ||
        "";


      $("#captainCarType").value =
        data.carType ||
        "";


      $("#captainCarModel").value =
        data.carModel ||
        "";


      $("#captainCarNumber").value =
        data.carNumber ||
        "";


      updateCaptainFields();

    }

  } catch (error) {

    console.error(error);

  }

}


/* ======================================================
   ACCOUNT ROLE
   ====================================================== */

$("#accountRole").addEventListener(
  "change",
  updateCaptainFields
);


function updateCaptainFields() {

  const role =
    $("#accountRole").value;


  $("#captainFields").style.display =
    role === "captain"
      ? "block"
      : "none";

}


/* ======================================================
   SEND PHONE CODE
   ====================================================== */

$("#sendCodeBtn").addEventListener(
  "click",
  async () => {

    const phone =
      $("#phone").value.trim();


    const name =
      $("#accountName")
        .value
        .trim();


    if (!name) {

      $("#authMsg").style.display =
        "block";

      $("#authMsg").textContent =
        "اكتب اسمك الأول.";

      return;

    }


    if (
      !phone ||
      !phone.startsWith("+")
    ) {

      $("#authMsg").style.display =
        "block";

      $("#authMsg").textContent =
        "اكتب رقم الهاتف بصيغة دولية مثل +201xxxxxxxxx.";

      return;

    }


    try {

      setupRecaptcha();


      if (!recaptcha) {

        throw new Error(
          "تعذر تشغيل التحقق."
        );

      }


      $("#sendCodeBtn").disabled =
        true;


      $("#authMsg").style.display =
        "block";


      $("#authMsg").textContent =
        "جاري إرسال كود التحقق...";


      confirmationResult =
        await signInWithPhoneNumber(
          auth,
          phone,
          recaptcha
        );


      $("#codeSection").style.display =
        "block";


      $("#authMsg").textContent =
        "تم إرسال الكود على الموبايل.";

    } catch (error) {

      console.error(error);


      $("#authMsg").style.display =
        "block";


      $("#authMsg").textContent =
        error.message ||
        "تعذر إرسال الكود.";


      $("#sendCodeBtn").disabled =
        false;


      try {

        if (recaptcha) {
          recaptcha.clear();
        }

      } catch {}


      recaptcha = null;

    }

  }
);


/* ======================================================
   VERIFY CODE
   ====================================================== */

$("#verifyCodeBtn").addEventListener(
  "click",
  async () => {

    const code =
      $("#verificationCode")
        .value
        .trim();


    if (!confirmationResult) {

      $("#authMsg").style.display =
        "block";

      $("#authMsg").textContent =
        "اطلب الكود الأول.";

      return;

    }


    if (!code) {

      $("#authMsg").style.display =
        "block";

      $("#authMsg").textContent =
        "اكتب كود التحقق.";

      return;

    }


    try {

      $("#verifyCodeBtn").disabled =
        true;


      $("#authMsg").textContent =
        "جاري التحقق...";


      const result =
        await confirmationResult.confirm(
          code
        );


      currentUser =
        result.user;


      await saveUserProfile();


      const snap =
        await getDoc(
          doc(
            db,
            "users",
            currentUser.uid
          )
        );


      const data =
        snap.exists()
          ? snap.data()
          : {};


      currentRole =
        data.role ||
        "customer";


      $("#authMsg").textContent =
        "تم تسجيل الدخول بنجاح ✅";


      if (
        currentRole ===
        "captain"
      ) {

        showScreen(
          "captainScreen"
        );

      } else {

        showScreen(
          "homeScreen"
        );

      }

    } catch (error) {

      console.error(error);


      $("#authMsg").textContent =
        error.message ||
        "كود التحقق غير صحيح.";

    } finally {

      $("#verifyCodeBtn").disabled =
        false;

    }

  }
);


/* ======================================================
   SAVE USER PROFILE
   ====================================================== */

async function saveUserProfile() {

  if (!currentUser) {
    return;
  }


  const role =
    $("#accountRole").value;


  const name =
    $("#accountName")
      .value
      .trim();


  if (!name) {

    throw new Error(
      "اكتب الاسم الأول."
    );

  }


  const userRef =
    doc(
      db,
      "users",
      currentUser.uid
    );


  const oldSnap =
    await getDoc(
      userRef
    );


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
      oldData.photoURL ||
      "",

    updatedAt:
      serverTimestamp()

  };


  if (
    role === "captain"
  ) {

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
        "الكابتن لازم يدخل نوع العربية والموديل ورقم السيارة."
      );

    }


    userData.carType =
      carType;


    userData.carModel =
      carModel;


    userData.carNumber =
      carNumber;


    if (
      !oldSnap.exists()
    ) {

      userData.captainStatus =
        "pending";

    }

  } else {

    userData.carType =
      "";

    userData.carModel =
      "";

    userData.carNumber =
      "";

  }


  if (
    !oldSnap.exists()
  ) {

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


  currentRole =
    role;

}


/* ======================================================
   PROFILE
   ====================================================== */

async function loadProfile() {

  const box =
    $("#profileInfo");


  if (!currentUser) {

    box.innerHTML = `
      <p>
        لم يتم تسجيل الدخول.
      </p>
    `;

    return;

  }


  try {

    const snap =
      await getDoc(
        doc(
          db,
          "users",
          currentUser.uid
        )
      );


    if (
      !snap.exists()
    ) {

      box.innerHTML = `
        <p>
          لم يتم إنشاء بيانات الحساب بعد.
        </p>
      `;

      return;

    }


    const data =
      snap.data();


    box.innerHTML = `

      <div class="profile-card">

        <h3>
          👤
          ${escapeHtml(
            data.name ||
            "مستخدم"
          )}
        </h3>

        <p>
          📱
          ${escapeHtml(
            data.phone ||
            currentUser.phoneNumber ||
            ""
          )}
        </p>

        <p>
          نوع الحساب:
          <strong>
            ${
              data.role ===
              "captain"
                ? "🚕 كابتن"
                : "👤 عميل"
            }
          </strong>
        </p>

        ${
          data.role ===
          "captain"
            ? `
              <p>
                🚗
                ${escapeHtml(
                  data.carType ||
                  ""
                )}
              </p>

              <p>
                موديل:
                ${escapeHtml(
                  data.carModel ||
                  ""
                )}
              </p>

              <p>
                رقم السيارة:
                ${escapeHtml(
                  data.carNumber ||
                  ""
                )}
              </p>
            `
            : ""
        }

      </div>

    `;

  } catch (error) {

    console.error(error);

    box.innerHTML = `
      تعذر تحميل الحساب.
    `;

  }

}


/* ======================================================
   LOGOUT
   ====================================================== */

$("#logoutBtn").addEventListener(
  "click",
  async () => {

    try {

      await signOut(auth);

      currentUser =
        null;

      currentRole =
        "customer";


      if (
        unsubscribeCaptainRides
      ) {

        unsubscribeCaptainRides();

        unsubscribeCaptainRides =
          null;

      }


      if (
        unsubscribeCustomerOffers
      ) {

        unsubscribeCustomerOffers();

        unsubscribeCustomerOffers =
          null;

      }


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

      return;

    }


    try {

      const snap =
        await getDoc(
          doc(
            db,
            "users",
            user.uid
          )
        );


      if (
        snap.exists()
      ) {

        const data =
          snap.data();


        currentRole =
          data.role ||
          "customer";

      }

    } catch (error) {

      console.error(error);

    }

  }
);


/* ======================================================
   INITIALIZE
   ====================================================== */

createMap();

showScreen(
  "homeScreen"
);
