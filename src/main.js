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

import {
  getCurrentPosition,
  requestPermissions,
  checkPermissions
} from "@capacitor/geolocation";


// ======================================================
// FIREBASE
// ======================================================

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const firebaseApp = initializeApp(firebaseConfig);

const auth = getAuth(firebaseApp);

const db = getFirestore(firebaseApp);

const storage = getStorage(firebaseApp);


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

let googleMapsPromise = null;

let searchTimer = null;


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

  if (
    googleMapsPromise
  ) {

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

        script.async = true;

        script.defer = true;

        script.onload = () => {

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

        script.onerror = () => {

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
// HTML
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


<!-- HOME -->

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
      placeholder="مثال: معايا شنطة كبيرة، محتاج عربية واسعة..."
    ></textarea>

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


<!-- MAP -->

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
          ابحث عن المكان أو حرّك الخريطة للنقطة المطلوبة.
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
    style="position:relative;z-index:30"
  >

    <label>
      🔎 ابحث عن المكان
    </label>

    <input
      id="destinationSearch"
      type="search"
      placeholder="اكتب اسم المكان أو الشارع أو المدينة..."
      autocomplete="off"
    />

    <div
      id="searchResults"
      style="
        display:none;
        max-height:250px;
        overflow:auto;
        margin-top:8px;
      "
    ></div>

  </div>


  <!-- MAP -->

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


    <!-- FIXED PIN -->

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


<!-- AUTH -->

<section
  id="authScreen"
  class="screen"
>

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

    <select
      id="accountRole"
    >

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
      placeholder="الاسم بالكامل"
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
        placeholder="رقم السيارة"
      />

    </div>


    <label>
      📷 الصورة الشخصية
    </label>

    <input
      id="profileImage"
      type="file"
      accept="image/*"
    />


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


<!-- CAPTAIN -->

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


<!-- PROFILE -->

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


<!-- NAV -->

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

function showScreen(screenId) {

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
// LOCATION DISPLAY
// ======================================================

function updateLocationFields() {

  $("#pickupInfo").innerHTML =
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


  $("#destinationInfo").innerHTML =
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


// ======================================================
// DEVICE GPS
// ======================================================

async function getDeviceLocation() {

  try {

    let permission;

    try {

      permission =
        await checkPermissions();

      if (
        permission.location !==
        "granted"
      ) {

        permission =
          await requestPermissions();

      }

    } catch (error) {

      console.warn(
        "Capacitor permission:",
        error
      );

    }


    try {

      const position =
        await getCurrentPosition({

          enableHighAccuracy:
            true,

          timeout:
            20000,

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

    } catch (nativeError) {

      if (
        !navigator.geolocation
      ) {

        throw nativeError;

      }


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

              reject,

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
      );

    }

  } catch (error) {

    throw error;

  }

}


// ======================================================
// PICKUP BUTTON
// ======================================================

$("#fromPlace")
  .addEventListener(
    "click",
    async () => {

      const button =
        $("#fromPlace");


      button.disabled =
        true;


      button.textContent =
        "📍 جاري تحديد موقعك بدقة...";


      showMessage(
        "جاري تحديد موقع جهازك الحالي...",
        "info"
      );


      try {

        const position =
          await getDeviceLocation();


        selectedPickupCoords = {

          lat:
            position.lat,

          lng:
            position.lng

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

          `تم تحديد موقع الانطلاق. دقة GPS حوالي ${Math.round(position.accuracy)} متر.`,

          "success"

        );


        button.textContent =
          "📍 تم تحديد موقعي";

      } catch (error) {

        console.error(
          error
        );


        showMessage(

          "التطبيق محتاج إذن الموقع من أندرويد عشان يقدر يعرف مكان الجهاز الحقيقي. وافق على الإذن مرة واحدة ثم اضغط مرة أخرى.",

          "error"

        );


        button.textContent =
          "📍 حاول مرة أخرى";

      }


      button.disabled =
        false;

    }
  );


// ======================================================
// DESTINATION MAP
// ======================================================

$("#toPlace")
  .addEventListener(
    "click",
    openDestinationMap
  );


async function openDestinationMap() {

  showScreen(
    "mapScreen"
  );


  $("#mapSelectedAddress")
    .textContent =
    "جاري تجهيز الخريطة...";


  $("#destinationSearch")
    .value =
    "";


  $("#searchResults")
    .style
    .display =
    "none";


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

        تأكد من مفتاح Google Maps.

      `;


    showMessage(
      "تعذر تحميل Google Maps.",
      "error"
    );

  }

}


// ======================================================
// INITIALIZE MAP
// ======================================================

function initializeDestinationMap() {

  const mapElement =
    $("#map");


  if (!mapElement) {

    return;

  }


  let center =
    selectedDestinationCoords ||
    selectedPickupCoords ||
    {

      lat:
        30.5526,

      lng:
        31.0106

    };


  map =
    new google.maps.Map(
      mapElement,
      {

        center,

        zoom:
          selectedDestinationCoords ||
          selectedPickupCoords
            ? 18
            : 12,

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


  selectedDestinationCoords = {

    lat:
      center.lat,

    lng:
      center.lng

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


      destinationMarker
        .setPosition({

          lat,
          lng

        });


      $("#mapSelectedAddress")
        .innerHTML = `

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
// MAP ADDRESS
// ======================================================

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


  $("#mapSelectedAddress")
    .innerHTML = `

      🏁

      <strong>
        المكان المحدد
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

        },

        language:
          "ar"

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
// SEARCH PLACES
// ======================================================

$("#destinationSearch")
  .addEventListener(
    "input",
    () => {

      clearTimeout(
        searchTimer
      );


      const value =
        $("#destinationSearch")
          .value
          .trim();


      if (
        value.length < 2
      ) {

        $("#searchResults")
          .style
          .display =
          "none";

        return;

      }


      searchTimer =
        setTimeout(
          () => {

            searchPlaces(
              value
            );

          },
          500
        );

    }
  );


async function searchPlaces(
  text
) {

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
      new google.maps
        .places
        .AutocompleteService();


    service.getPlacePredictions(

      {

        input:
          text,

        componentRestrictions:
          {
            country:
              "eg"
          },

        language:
          "ar"

      },

      (
        predictions,
        status
      ) => {

        if (
          status !==
          google.maps
            .places
            .PlacesServiceStatus.OK ||
          !predictions ||
          !predictions.length
        ) {

          resultsBox.innerHTML = `

            <div class="card">
              لا توجد نتائج.
              <br>
              جرّب اسم المكان بطريقة أخرى.
            </div>

          `;

          return;

        }


        resultsBox.innerHTML =
          predictions
            .slice(
              0,
              8
            )
            .map(
              prediction => `

                <button

                  type="button"

                  class="search-result"

                  data-place-id="${
                    escapeHtml(
                      prediction.place_id
                    )
                  }"

                  style="
                    display:block;
                    width:100%;
                    text-align:right;
                    padding:12px;
                    margin-bottom:6px;
                    border:1px solid #ddd;
                    border-radius:10px;
                    background:#fff;
                  "

                >

                  <strong>

                    ${
                      escapeHtml(
                        prediction
                          .structured_formatting
                          ?.main_text ||
                        prediction
                          .description
                      )
                    }

                  </strong>

                  <br>

                  <small>

                    ${
                      escapeHtml(
                        prediction
                          .structured_formatting
                          ?.secondary_text ||
                        ""
                      )
                    }

                  </small>

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

                  selectPlace(
                    button.dataset
                      .placeId
                  );

                }
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

      <div class="card">

        تعذر البحث.

        <br><br>

        تأكد من تفعيل
        Places API.

      </div>

    `;

  }

}


// ======================================================
// SELECT SEARCH RESULT
// ======================================================

async function selectPlace(
  placeId
) {

  try {

    await loadGoogleMaps();


    const temp =
      document.createElement(
        "div"
      );


    const service =
      new google.maps
        .places
        .PlacesService(
          temp
        );


    service.getDetails(

      {

        placeId,

        fields: [

          "geometry",

          "formatted_address",

          "name"

        ],

        language:
          "ar"

      },

      (
        place,
        status
      ) => {

        if (
          status !==
          google.maps
            .places
            .PlacesServiceStatus.OK ||
          !place ||
          !place.geometry ||
          !place.geometry.location
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

          lat:
            location.lat(),

          lng:
            location.lng()

        };


        selectedDestinationCoords =
          coords;


        selectedDestination =
          place.formatted_address ||
          place.name ||
          "المكان المحدد";


        if (map) {

          map.setCenter(
            coords
          );

          map.setZoom(
            18
          );

        }


        if (
          destinationMarker
        ) {

          destinationMarker
            .setPosition(
              coords
            );

        }


        $("#destinationSearch")
          .value =
          selectedDestination;


        $("#searchResults")
          .style
          .display =
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

    console.error(
      error
    );

    showMessage(
      "تعذر تحديد المكان.",
      "error"
    );

  }

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


        showMessage(
          "تم تحديد مكان النزول بدقة 📍",
          "success"
        );

      } finally {

        button.disabled =
          false;


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
