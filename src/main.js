/* ======================================================
   WASALNI MONUFIA
   MAIN.JS
   ====================================================== */

import "./style.css";

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

import {
  getCurrentPosition,
  requestPermissions,
  checkPermissions
} from "@capacitor/geolocation";


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

const auth = getAuth(firebaseApp);

const db = getFirestore(firebaseApp);

const storage = getStorage(firebaseApp);


/* ======================================================
   GLOBAL VARIABLES
   ====================================================== */

let currentUser = null;
let currentProfile = null;

let selectedRole = "customer";

let confirmationResult = null;
let recaptchaVerifier = null;

let pickupLocation = null;
let destinationLocation = null;

let pickupCoords = null;
let destinationCoords = null;

let googleMap = null;
let pickupMarker = null;
let destinationMarker = null;

let ridesUnsubscribe = null;
let offersUnsubscribe = null;

let currentRideId = null;

let googleMapsLoaded = false;


/* ======================================================
   APP ELEMENT
   ====================================================== */

const appElement = document.getElementById("app");

if (!appElement) {
  throw new Error("لم يتم العثور على عنصر #app");
}


/* ======================================================
   HELPERS
   ====================================================== */

function showMessage(message, type = "info") {
  const box = document.getElementById("messageBox");

  if (!box) return;

  box.textContent = message;

  box.className = `message-box ${type}`;

  box.style.display = "block";

  setTimeout(() => {
    box.style.display = "none";
  }, 4000);
}


function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function formatPrice(price) {
  const number = Number(price || 0);

  return `${number.toLocaleString("ar-EG")} جنيه`;
}


function formatDate(timestamp) {
  if (!timestamp) return "غير محدد";

  try {
    const date = timestamp.toDate
      ? timestamp.toDate()
      : new Date(timestamp);

    return date.toLocaleString("ar-EG");
  } catch {
    return "غير محدد";
  }
}


/* ======================================================
   MAIN HTML
   ====================================================== */

appElement.innerHTML = `

<div id="messageBox" class="message-box"></div>

<header class="top-header">
  <div class="logo-area">
    <div class="logo-circle">و</div>

    <div>
      <h1>وصلني المنوفية</h1>
      <span>مشوارك أسهل وأسرع</span>
    </div>
  </div>

  <button id="profileBtn" class="icon-btn">
    👤
  </button>
</header>


<!-- ==================================================
     AUTH SCREEN
     ================================================== -->

<section id="authScreen" class="screen">

  <div class="auth-card">

    <h2>أهلاً بيك في وصلني المنوفية</h2>

    <p>
      سجل دخولك برقم الموبايل
    </p>


    <div class="role-buttons">

      <button
        id="customerRoleBtn"
        class="role-btn active"
      >
        👤 راكب
      </button>

      <button
        id="captainRoleBtn"
        class="role-btn"
      >
        🚕 كابتن
      </button>

    </div>


    <input
      id="nameInput"
      type="text"
      placeholder="الاسم"
      autocomplete="name"
    />


    <input
      id="phoneInput"
      type="tel"
      placeholder="رقم الموبايل مثال 010..."
      autocomplete="tel"
    />


    <div id="captainFields" style="display:none">

      <input
        id="carTypeInput"
        type="text"
        placeholder="نوع العربية"
      />

      <input
        id="carModelInput"
        type="text"
        placeholder="موديل العربية"
      />

      <input
        id="carNumberInput"
        type="text"
        placeholder="رقم العربية"
      />

    </div>


    <div id="recaptcha-container"></div>


    <button
      id="sendCodeBtn"
      class="primary-btn"
    >
      إرسال كود التحقق
    </button>


    <div
      id="verifySection"
      style="display:none"
    >

      <input
        id="codeInput"
        type="number"
        placeholder="اكتب كود التحقق"
      />

      <button
        id="verifyCodeBtn"
        class="primary-btn"
      >
        تأكيد الرقم
      </button>

    </div>

  </div>

</section>


<!-- ==================================================
     CUSTOMER HOME
     ================================================== -->

<section id="homeScreen" class="screen" style="display:none">

  <div class="welcome-card">

    <h2 id="welcomeText">
      أهلاً بيك 👋
    </h2>

    <p>
      اطلب رحلتك بسهولة
    </p>

  </div>


  <div class="ride-card">

    <h3>🚗 اطلب رحلة</h3>


    <button
      id="pickupBtn"
      class="location-btn"
    >
      📍 تحديد مكان الانطلاق
    </button>


    <div id="pickupText" class="location-text">
      لم يتم تحديد الانطلاق
    </div>


    <button
      id="destinationBtn"
      class="location-btn"
    >
      🏁 تحديد مكان الوصول
    </button>


    <div id="destinationText" class="location-text">
      لم يتم تحديد الوصول
    </div>


    <input
      id="priceInput"
      type="number"
      placeholder="السعر المقترح للرحلة"
    />


    <input
      id="passengerCountInput"
      type="number"
      min="1"
      value="1"
      placeholder="عدد الركاب"
    />


    <textarea
      id="notesInput"
      placeholder="ملاحظات؟ مثال: شنطة كبيرة أو طفل..."
    ></textarea>


    <button
      id="requestRideBtn"
      class="primary-btn"
    >
      🚕 اطلب الرحلة
    </button>

  </div>


  <div id="mapContainer" class="map-container"></div>

</section>


<!-- ==================================================
     DESTINATION SCREEN
     ================================================== -->

<section
  id="destinationScreen"
  class="screen"
  style="display:none"
>

  <div class="destination-card">

    <h2>حدد مكان الوصول</h2>

    <input
      id="placeSearchInput"
      type="text"
      placeholder="ابحث عن المكان..."
    />

    <div
      id="destinationMap"
      class="destination-map"
    ></div>

    <button
      id="confirmDestinationBtn"
      class="primary-btn"
    >
      تأكيد مكان الوصول
    </button>

  </div>

</section>


<!-- ==================================================
     CUSTOMER RIDES
     ================================================== -->

<section
  id="customerRidesScreen"
  class="screen"
  style="display:none"
>

  <div class="section-title">
    <h2>رحلاتي</h2>
  </div>

  <div id="customerRidesList"></div>

</section>


<!-- ==================================================
     CAPTAIN HOME
     ================================================== -->

<section
  id="captainScreen"
  class="screen"
  style="display:none"
>

  <div class="welcome-card">

    <h2>منصة الكابتن 🚕</h2>

    <p>
      الرحلات المتاحة حالياً
    </p>

  </div>


  <div id="captainRidesList"></div>

</section>


<!-- ==================================================
     CAPTAIN HISTORY
     ================================================== -->

<section
  id="captainHistoryScreen"
  class="screen"
  style="display:none"
>

  <div class="section-title">
    <h2>رحلاتي السابقة</h2>
  </div>

  <div id="captainHistoryList"></div>

</section>


<!-- ==================================================
     PROFILE
     ================================================== -->

<section
  id="profileScreen"
  class="screen"
  style="display:none"
>

  <div class="profile-card">

    <div id="profilePhoto" class="profile-photo">
      👤
    </div>

    <h2 id="profileName">-</h2>

    <p id="profilePhone">-</p>

    <div id="captainProfileData"></div>


    <button
      id="logoutBtn"
      class="danger-btn"
    >
      تسجيل الخروج
    </button>

  </div>

</section>


<!-- ==================================================
     BOTTOM NAV
     ================================================== -->

<nav class="bottom-nav">

  <button id="navHomeBtn">
    🏠
    <span>الرئيسية</span>
  </button>

  <button id="navRidesBtn">
    🚕
    <span>رحلاتي</span>
  </button>

  <button id="navHistoryBtn">
    📋
    <span>السجل</span>
  </button>

  <button id="navProfileBtn">
    👤
    <span>حسابي</span>
  </button>

</nav>

`;


/* ======================================================
   SCREEN CONTROL
   ====================================================== */

function showScreen(screenId) {

  document.querySelectorAll(".screen").forEach(screen => {
    screen.style.display = "none";
  });

  const screen = document.getElementById(screenId);

  if (screen) {
    screen.style.display = "block";
  }

  const nav = document.querySelector(".bottom-nav");

  if (nav) {
    nav.style.display =
      screenId === "authScreen"
        ? "none"
        : "flex";
  }
}


/* ======================================================
   ROLE BUTTONS
   ====================================================== */

const customerRoleBtn =
  document.getElementById("customerRoleBtn");

const captainRoleBtn =
  document.getElementById("captainRoleBtn");

const captainFields =
  document.getElementById("captainFields");


customerRoleBtn.onclick = () => {

  selectedRole = "customer";

  customerRoleBtn.classList.add("active");

  captainRoleBtn.classList.remove("active");

  captainFields.style.display = "none";
};


captainRoleBtn.onclick = () => {

  selectedRole = "captain";

  captainRoleBtn.classList.add("active");

  customerRoleBtn.classList.remove("active");

  captainFields.style.display = "block";
};


/* ======================================================
   PHONE NORMALIZATION
   ====================================================== */

function normalizeEgyptianPhone(phone) {

  let value = String(phone || "").trim();

  value = value.replace(/\s+/g, "");

  if (value.startsWith("+20")) {
    return value;
  }

  if (value.startsWith("20")) {
    return `+${value}`;
  }

  if (value.startsWith("0")) {
    return `+20${value.substring(1)}`;
  }

  return `+20${value}`;
}


/* ======================================================
   RECAPTCHA
   ====================================================== */

function setupRecaptcha() {

  if (recaptchaVerifier) {
    return;
  }

  recaptchaVerifier = new RecaptchaVerifier(
    auth,
    "recaptcha-container",
    {
      size: "normal"
    }
  );
}


/* ======================================================
   SEND PHONE CODE
   ====================================================== */

async function sendPhoneCode() {

  try {

    const name =
      document.getElementById("nameInput").value.trim();

    const phone =
      document.getElementById("phoneInput").value.trim();


    if (!name) {
      showMessage("اكتب اسمك أولاً", "error");
      return;
    }


    if (!phone) {
      showMessage("اكتب رقم الموبايل", "error");
      return;
    }


    if (selectedRole === "captain") {

      const carType =
        document.getElementById("carTypeInput").value.trim();

      const carModel =
        document.getElementById("carModelInput").value.trim();

      const carNumber =
        document.getElementById("carNumberInput").value.trim();


      if (!carType || !carModel || !carNumber) {

        showMessage(
          "اكتب بيانات العربية كاملة",
          "error"
        );

        return;
      }
    }


    setupRecaptcha();


    const formattedPhone =
      normalizeEgyptianPhone(phone);


    confirmationResult =
      await signInWithPhoneNumber(
        auth,
        formattedPhone,
        recaptchaVerifier
      );


    document.getElementById(
      "verifySection"
    ).style.display = "block";


    showMessage(
      "تم إرسال كود التحقق للموبايل",
      "success"
    );

  } catch (error) {

    console.error(error);

    showMessage(
      error.message || "حدث خطأ أثناء إرسال الكود",
      "error"
    );
  }
}


/* ======================================================
   SAVE PROFILE
   ====================================================== */

async function saveUserProfile(user) {

  if (!user) return;

  const name =
    document.getElementById("nameInput")?.value.trim()
    || currentProfile?.name
    || "مستخدم";


  const phone =
    user.phoneNumber
    || currentProfile?.phone
    || "";


  const profileData = {

    uid: user.uid,

    name,

    phone,

    role: selectedRole,

    updatedAt: serverTimestamp()
  };


  if (selectedRole === "captain") {

    profileData.carType =
      document.getElementById("carTypeInput")?.value.trim()
      || currentProfile?.carType
      || "";

    profileData.carModel =
      document.getElementById("carModelInput")?.value.trim()
      || currentProfile?.carModel
      || "";

    profileData.carNumber =
      document.getElementById("carNumberInput")?.value.trim()
      || currentProfile?.carNumber
      || "";
  }


  const userRef =
    doc(db, "users", user.uid);


  const oldProfile =
    await getDoc(userRef);


  if (!oldProfile.exists()) {

    profileData.createdAt =
      serverTimestamp();
  }


  await setDoc(
    userRef,
    profileData,
    { merge: true }
  );


  currentProfile = {
    ...currentProfile,
    ...profileData,
    uid: user.uid
  };
}


/* ======================================================
   VERIFY CODE
   ====================================================== */

async function verifyPhoneCode() {

  try {

    const code =
      document.getElementById("codeInput").value.trim();


    if (!confirmationResult) {

      showMessage(
        "اطلب كود التحقق الأول",
        "error"
      );

      return;
    }


    if (!code) {

      showMessage(
        "اكتب كود التحقق",
        "error"
      );

      return;
    }


    const result =
      await confirmationResult.confirm(code);


    currentUser = result.user;


    await saveUserProfile(currentUser);


    showMessage(
      "تم تسجيل الدخول بنجاح 🎉",
      "success"
    );


    await loadCurrentUser();


  } catch (error) {

    console.error(error);

    showMessage(
      "كود التحقق غير صحيح أو انتهت صلاحيته",
      "error"
    );
  }
}


/* ======================================================
   LOAD CURRENT USER
   ====================================================== */

async function loadCurrentUser() {

  if (!currentUser) return;


  const userRef =
    doc(db, "users", currentUser.uid);


  const snapshot =
    await getDoc(userRef);


  if (snapshot.exists()) {

    currentProfile =
      snapshot.data();

  } else {

    currentProfile = {
      uid: currentUser.uid,
      phone: currentUser.phoneNumber || "",
      name: "مستخدم",
      role: "customer"
    };
  }


  selectedRole =
    currentProfile.role || "customer";


  updateProfileUI();


  if (selectedRole === "captain") {

    showScreen("captainScreen");

    loadCaptainRides();

  } else {

    showScreen("homeScreen");

    loadCustomerRides();
  }
}


/* ======================================================
   UPDATE PROFILE UI
   ====================================================== */

function updateProfileUI() {

  const nameElement =
    document.getElementById("profileName");

  const phoneElement =
    document.getElementById("profilePhone");


  if (nameElement) {
    nameElement.textContent =
      currentProfile?.name || "مستخدم";
  }


  if (phoneElement) {
    phoneElement.textContent =
      currentProfile?.phone || "";
  }


  const captainData =
    document.getElementById("captainProfileData");


  if (captainData) {

    if (currentProfile?.role === "captain") {

      captainData.innerHTML = `

        <div class="profile-info">
          <strong>نوع العربية:</strong>
          ${escapeHTML(currentProfile.carType || "-")}
        </div>

        <div class="profile-info">
          <strong>الموديل:</strong>
          ${escapeHTML(currentProfile.carModel || "-")}
        </div>

        <div class="profile-info">
          <strong>رقم العربية:</strong>
          ${escapeHTML(currentProfile.carNumber || "-")}
        </div>

      `;

    } else {

      captainData.innerHTML = "";
    }
  }
}


/* ======================================================
   LOCATION PERMISSION
   ====================================================== */

async function requestLocationPermission() {

  try {

    const permission =
      await checkPermissions();


    if (
      permission.location !== "granted"
    ) {

      await requestPermissions();
    }


    return true;

  } catch (error) {

    console.error(error);

    return false;
  }
}


/* ======================================================
   GET CURRENT LOCATION
   ====================================================== */

async function getUserLocation() {

  try {

    await requestLocationPermission();


    const position =
      await getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000
      });


    return {

      lat: position.coords.latitude,

      lng: position.coords.longitude

    };

  } catch (error) {

    console.error(
      "Capacitor location error:",
      error
    );


    return new Promise((resolve, reject) => {

      if (!navigator.geolocation) {

        reject(
          new Error("الموقع غير متاح")
        );

        return;
      }


      navigator.geolocation.getCurrentPosition(

        position => {

          resolve({

            lat: position.coords.latitude,

            lng: position.coords.longitude

          });

        },

        error => {

          reject(error);
        },

        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        }
      );

    });
  }
}


/* ======================================================
   REVERSE GEOCODING
   ====================================================== */

async function reverseGeocode(lat, lng) {

  try {

    const response =
      await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=ar&region=eg`
      );


    const data =
      await response.json();


    if (
      data.status === "OK" &&
      data.results?.length
    ) {

      return data.results[0].formatted_address;
    }


    return `${lat}, ${lng}`;

  } catch {

    return `${lat}, ${lng}`;
  }
}


/* ======================================================
   PICKUP
   ====================================================== */

document.getElementById(
  "pickupBtn"
).onclick = async () => {

  try {

    showMessage(
      "جاري تحديد موقعك...",
      "info"
    );


    const coords =
      await getUserLocation();


    pickupCoords = coords;


    pickupLocation =
      await reverseGeocode(
        coords.lat,
        coords.lng
      );


    document.getElementById(
      "pickupText"
    ).textContent =
      pickupLocation;


    showMessage(
      "تم تحديد مكان الانطلاق ✅",
      "success"
    );

  } catch (error) {

    console.error(error);

    showMessage(
      "مش قادر أوصل لموقعك. اسمح للتطبيق باستخدام الموقع.",
      "error"
    );
  }
};


/* ======================================================
   GOOGLE MAPS LOADER
   ====================================================== */

function loadGoogleMaps() {

  if (googleMapsLoaded) {
    return Promise.resolve();
  }


  return new Promise((resolve, reject) => {

    if (window.google?.maps) {

      googleMapsLoaded = true;

      resolve();

      return;
    }


    const existing =
      document.getElementById(
        "googleMapsScript"
      );


    if (existing) {

      existing.addEventListener(
        "load",
        () => {

          googleMapsLoaded = true;

          resolve();

        }
      );

      existing.addEventListener(
        "error",
        reject
      );

      return;
    }


    /*
      ضع مفتاح Google Maps الخاص بك هنا
    */

    const GOOGLE_MAPS_API_KEY =
      "ضع_مفتاح_GOOGLE_MAPS_هنا";


    const script =
      document.createElement("script");


    script.id =
      "googleMapsScript";


    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&language=ar&region=EG`;


    script.async = true;

    script.defer = true;


    script.onload = () => {

      googleMapsLoaded = true;

      resolve();

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
}


/* ======================================================
   DESTINATION BUTTON
   ====================================================== */

document.getElementById(
  "destinationBtn"
).onclick = async () => {

  try {

    await loadGoogleMaps();

    showScreen(
      "destinationScreen"
    );

    setTimeout(
      initializeDestinationMap,
      300
    );

  } catch (error) {

    console.error(error);

    showMessage(
      "تأكد من مفتاح Google Maps",
      "error"
    );
  }
};


/* ======================================================
   DESTINATION MAP
   ====================================================== */

async function initializeDestinationMap() {

  if (!window.google?.maps) {
    return;
  }


  const mapElement =
    document.getElementById(
      "destinationMap"
    );


  if (!mapElement) return;


  let center = {
    lat: 30.5978,
    lng: 30.9876
  };


  try {

    if (pickupCoords) {
      center = pickupCoords;
    }

  } catch {}


  googleMap =
    new google.maps.Map(
      mapElement,
      {
        center,
        zoom: 14,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
      }
    );


  destinationMarker =
    new google.maps.Marker({
      position: center,
      map: googleMap,
      draggable: true
    });


  google.maps.event.addListener(
    googleMap,
    "click",
    event => {

      setDestinationFromCoords(
        event.latLng.lat(),
        event.latLng.lng()
      );
    }
  );


  destinationMarker.addListener(
    "dragend",
    event => {

      setDestinationFromCoords(
        event.latLng.lat(),
        event.latLng.lng()
      );
    }
  );


  const input =
    document.getElementById(
      "placeSearchInput"
    );


  if (input) {

    const autocomplete =
      new google.maps.places.Autocomplete(
        input,
        {
          componentRestrictions: {
            country: "eg"
          }
        }
      );


    autocomplete.addListener(
      "place_changed",
      () => {

        const place =
          autocomplete.getPlace();


        if (
          !place.geometry ||
          !place.geometry.location
        ) {
          return;
        }


        const lat =
          place.geometry.location.lat();


        const lng =
          place.geometry.location.lng();


        googleMap.setCenter({
          lat,
          lng
        });


        destinationMarker.setPosition({
          lat,
          lng
        });


        setDestinationFromCoords(
          lat,
          lng,
          place.formatted_address
        );
      }
    );
  }
}


/* ======================================================
   SET DESTINATION
   ====================================================== */

async function setDestinationFromCoords(
  lat,
  lng,
  address = null
) {

  destinationCoords = {
    lat,
    lng
  };


  destinationLocation =
    address ||
    await reverseGeocode(
      lat,
      lng
    );
}


/* ======================================================
   CONFIRM DESTINATION
   ====================================================== */

document.getElementById(
  "confirmDestinationBtn"
).onclick = () => {

  if (!destinationCoords) {

    showMessage(
      "حدد مكان الوصول الأول",
      "error"
    );

    return;
  }


  document.getElementById(
    "destinationText"
  ).textContent =
    destinationLocation ||
    "تم تحديد المكان";


  showScreen("homeScreen");


  showMessage(
    "تم تحديد مكان الوصول ✅",
    "success"
  );
};


/* ======================================================
   CREATE RIDE
   ====================================================== */

document.getElementById(
  "requestRideBtn"
).onclick = async () => {

  try {

    if (!currentUser) {

      showMessage(
        "سجل دخولك الأول",
        "error"
      );

      showScreen("authScreen");

      return;
    }


    if (!pickupCoords) {

      showMessage(
        "حدد مكان الانطلاق",
        "error"
      );

      return;
    }


    if (!destinationCoords) {

      showMessage(
        "حدد مكان الوصول",
        "error"
      );

      return;
    }


    const price =
      Number(
        document.getElementById(
          "priceInput"
        ).value
      );


    if (!price || price <= 0) {

      showMessage(
        "اكتب سعر الرحلة",
        "error"
      );

      return;
    }


    const passengerCount =
      Number(
        document.getElementById(
          "passengerCountInput"
        ).value
      ) || 1;


    const notes =
      document.getElementById(
        "notesInput"
      ).value.trim();


    const rideData = {

      customerId:
        currentUser.uid,

      customerName:
        currentProfile?.name || "راكب",

      customerPhone:
        currentProfile?.phone ||
        currentUser.phoneNumber ||
        "",


      pickup:
        pickupLocation || "",

      pickupLat:
        pickupCoords.lat,

      pickupLng:
        pickupCoords.lng,


      destination:
        destinationLocation || "",

      destinationLat:
        destinationCoords.lat,

      destinationLng:
        destinationCoords.lng,


      price,

      passengerCount,

      notes,


      status: "open",

      captainId: null,

      captainName: null,

      captainPhone: null,

      acceptedOfferId: null,


      createdAt:
        serverTimestamp(),

      updatedAt:
        serverTimestamp()
    };


    const rideRef =
      await addDoc(
        collection(db, "rides"),
        rideData
      );


    currentRideId =
      rideRef.id;


    showMessage(
      "تم نشر الرحلة للسائقين 🚕",
      "success"
    );


    document.getElementById(
      "priceInput"
    ).value = "";


    document.getElementById(
      "notesInput"
    ).value = "";


    loadCustomerRides();


  } catch (error) {

    console.error(error);

    showMessage(
      "حدث خطأ أثناء إنشاء الرحلة",
      "error"
    );
  }
};


/* ======================================================
   CUSTOMER RIDES
   ====================================================== */

async function loadCustomerRides() {

  if (!currentUser) return;


  const list =
    document.getElementById(
      "customerRidesList"
    );


  if (!list) return;


  list.innerHTML =
    "<p>جاري تحميل الرحلات...</p>";


  try {

    const q =
      query(
        collection(db, "rides"),
        where(
          "customerId",
          "==",
          currentUser.uid
        ),
        limit(30)
      );


    const snapshot =
      await getDocs(q);


    if (snapshot.empty) {

      list.innerHTML =
        "<p>مفيش رحلات لسه.</p>";

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
            (b.createdAt?.seconds || 0) -
            (a.createdAt?.seconds || 0)
        );


    list.innerHTML =
      rides.map(
        ride => `

        <div class="ride-item">

          <h3>
            🚕 ${escapeHTML(
              ride.pickup || "الانطلاق"
            )}
          </h3>

          <p>
            🏁 ${escapeHTML(
              ride.destination || "الوصول"
            )}
          </p>

          <p>
            💰 ${formatPrice(ride.price)}
          </p>

          <p>
            👥 عدد الركاب:
            ${ride.passengerCount || 1}
          </p>

          ${
            ride.notes
              ? `<p>📝 ${escapeHTML(ride.notes)}</p>`
              : ""
          }

          <p>
            الحالة:
            ${getRideStatusText(ride.status)}
          </p>

          <button
            class="secondary-btn"
            data-ride-id="${ride.id}"
          >
            👀 عروض السائقين
          </button>

          <div
            id="offers-${ride.id}"
            class="offers-container"
          ></div>

        </div>

      `
      ).join("");


    list
      .querySelectorAll(
        "[data-ride-id]"
      )
      .forEach(button => {

        button.onclick = () => {

          loadRideOffers(
            button.dataset.rideId
          );

        };

      });


  } catch (error) {

    console.error(error);

    list.innerHTML =
      "<p>حدث خطأ أثناء تحميل الرحلات.</p>";
  }
}


/* ======================================================
   RIDE STATUS
   ====================================================== */

function getRideStatusText(status) {

  const statuses = {

    open: "🟢 في انتظار كابتن",

    accepted: "✅ تم قبول الرحلة",

    completed: "🏁 مكتملة",

    cancelled: "❌ ملغاة"

  };


  return statuses[status] || status || "غير معروف";
}


/* ======================================================
   LOAD OFFERS
   ====================================================== */

async function loadRideOffers(rideId) {

  const container =
    document.getElementById(
      `offers-${rideId}`
    );


  if (!container) return;


  container.innerHTML =
    "<p>جاري تحميل العروض...</p>";


  try {

    const q =
      query(
        collection(
          db,
          "rides",
          rideId,
          "offers"
        ),
        limit(30)
      );


    const snapshot =
      await getDocs(q);


    if (snapshot.empty) {

      container.innerHTML =
        "<p>مفيش عروض من السائقين لسه.</p>";

      return;
    }


    container.innerHTML =
      snapshot.docs
        .map(item => {

          const offer =
            item.data();


          return `

            <div class="offer-item">

              <strong>
                🚕 ${escapeHTML(
                  offer.captainName ||
                  "كابتن"
                )}
              </strong>

              <p>
                💰 ${formatPrice(
                  offer.price
                )}
              </p>

              <p>
                🚗 ${escapeHTML(
                  offer.carType || ""
                )}
              </p>

              <p>
                ${escapeHTML(
                  offer.carModel || ""
                )}
              </p>


              ${
                offer.status === "pending"
                  ? `

                    <button
                      class="accept-offer-btn"
                      data-ride-id="${rideId}"
                      data-offer-id="${item.id}"
                    >
                      قبول العرض
                    </button>

                  `
                  : `

                    <p>
                      ${offer.status || ""}
                    </p>

                  `
              }

            </div>

          `;

        })
        .join("");


    container
      .querySelectorAll(
        ".accept-offer-btn"
      )
      .forEach(button => {

        button.onclick = () => {

          acceptCaptainOffer(
            button.dataset.rideId,
            button.dataset.offerId
          );

        };

      });


  } catch (error) {

    console.error(error);

    container.innerHTML =
      "<p>حدث خطأ أثناء تحميل العروض.</p>";
  }
}


/* ======================================================
   ACCEPT CAPTAIN OFFER
   ====================================================== */

async function acceptCaptainOffer(
  rideId,
  offerId
) {

  try {

    const offerRef =
      doc(
        db,
        "rides",
        rideId,
        "offers",
        offerId
      );


    const offerSnapshot =
      await getDoc(offerRef);


    if (!offerSnapshot.exists()) {

      showMessage(
        "العرض غير موجود",
        "error"
      );

      return;
    }


    const offer =
      offerSnapshot.data();


    const rideRef =
      doc(db, "rides", rideId);


    await updateDoc(
      rideRef,
      {

        status: "accepted",

        captainId:
          offer.captainId,

        captainName:
          offer.captainName,

        captainPhone:
          offer.captainPhone,

        acceptedOfferId:
          offerId,

        finalPrice:
          offer.price,

        updatedAt:
          serverTimestamp()

      }
    );


    await updateDoc(
      offerRef,
      {
        status: "accepted",
        updatedAt: serverTimestamp()
      }
    );


    showMessage(
      "تم قبول الكابتن ✅",
      "success"
    );


    loadCustomerRides();


  } catch (error) {

    console.error(error);

    showMessage(
      "حدث خطأ أثناء قبول العرض",
      "error"
    );
  }
}


/* ======================================================
   CAPTAIN RIDES
   ====================================================== */

function loadCaptainRides() {

  if (!currentUser) return;


  const list =
    document.getElementById(
      "captainRidesList"
    );


  if (!list) return;


  if (ridesUnsubscribe) {

    ridesUnsubscribe();

    ridesUnsubscribe = null;
  }


  const q =
    query(
      collection(db, "rides"),
      where("status", "==", "open"),
      limit(50)
    );


  ridesUnsubscribe =
    onSnapshot(
      q,
      snapshot => {

        if (snapshot.empty) {

          list.innerHTML =
            "<p>مفيش رحلات متاحة حاليًا.</p>";

          return;
        }


        list.innerHTML =
          snapshot.docs
            .map(item => {

              const ride =
                item.data();


              return `

                <div class="ride-item">

                  <h3>
                    🚕 رحلة جديدة
                  </h3>

                  <p>
                    📍 ${escapeHTML(
                      ride.pickup || ""
                    )}
                  </p>

                  <p>
                    🏁 ${escapeHTML(
                      ride.destination || ""
                    )}
                  </p>

                  <p>
                    💰 سعر الراكب:
                    ${formatPrice(
                      ride.price
                    )}
                  </p>

                  <p>
                    👥 الركاب:
                    ${ride.passengerCount || 1}
                  </p>

                  ${
                    ride.notes
                      ? `<p>📝 ${escapeHTML(ride.notes)}</p>`
                      : ""
                  }


                  <input
                    class="offer-price-input"
                    data-ride-id="${item.id}"
                    type="number"
                    placeholder="اكتب سعرك"
                  />


                  <button
                    class="offer-ride-btn"
                    data-ride-id="${item.id}"
                  >
                    💰 تقديم عرض
                  </button>

                </div>

              `;

            })
            .join("");


        list
          .querySelectorAll(
            ".offer-ride-btn"
          )
          .forEach(button => {

            button.onclick = () => {

              const rideId =
                button.dataset.rideId;


              const input =
                list.querySelector(
                  `.offer-price-input[data-ride-id="${rideId}"]`
                );


              submitCaptainOffer(
                rideId,
                input?.value
              );

            };

          });

      },

      error => {

        console.error(error);

        list.innerHTML =
          "<p>حدث خطأ في تحميل الرحلات.</p>";
      }
    );
}


/* ======================================================
   CAPTAIN OFFER
   ====================================================== */

async function submitCaptainOffer(
  rideId,
  price
) {

  try {

    if (!currentUser) {

      showMessage(
        "سجل دخولك ككابتن أولاً",
        "error"
      );

      return;
    }


    const amount =
      Number(price);


    if (!amount || amount <= 0) {

      showMessage(
        "اكتب السعر المقترح",
        "error"
      );

      return;
    }


    if (
      currentProfile?.role !==
      "captain"
    ) {

      showMessage(
        "الحساب ده مش حساب كابتن",
        "error"
      );

      return;
    }


    const existingQuery =
      query(
        collection(
          db,
          "rides",
          rideId,
          "offers"
        ),
        where(
          "captainId",
          "==",
          currentUser.uid
        ),
        limit(1)
      );


    const existing =
      await getDocs(existingQuery);


    if (!existing.empty) {

      showMessage(
        "إنت قدمت عرض للرحلة دي بالفعل",
        "error"
      );

      return;
    }


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
          currentProfile.name || "كابتن",

        captainPhone:
          currentProfile.phone ||
          currentUser.phoneNumber ||
          "",

        carType:
          currentProfile.carType || "",

        carModel:
          currentProfile.carModel || "",

        carNumber:
          currentProfile.carNumber || "",

        price: amount,

        status: "pending",

        createdAt:
          serverTimestamp(),

        updatedAt:
          serverTimestamp()

      }
    );


    showMessage(
      "تم إرسال عرضك للراكب ✅",
      "success"
    );


  } catch (error) {

    console.error(error);

    showMessage(
      "حدث خطأ أثناء إرسال العرض",
      "error"
    );
  }
}


/* ======================================================
   CAPTAIN HISTORY
   ====================================================== */

async function loadCaptainHistory() {

  if (!currentUser) return;


  const list =
    document.getElementById(
      "captainHistoryList"
    );


  if (!list) return;


  list.innerHTML =
    "<p>جاري تحميل السجل...</p>";


  try {

    const q =
      query(
        collection(db, "rides"),
        where(
          "captainId",
          "==",
          currentUser.uid
        ),
        limit(50)
      );


    const snapshot =
      await getDocs(q);


    if (snapshot.empty) {

      list.innerHTML =
        "<p>مفيش رحلات في السجل.</p>";

      return;
    }


    list.innerHTML =
      snapshot.docs
        .map(item => {

          const ride =
            item.data();


          return `

            <div class="ride-item">

              <h3>
                🚕 ${escapeHTML(
                  ride.destination || ""
                )}
              </h3>

              <p>
                📍 ${escapeHTML(
                  ride.pickup || ""
                )}
              </p>

              <p>
                💰 ${formatPrice(
                  ride.finalPrice ||
                  ride.price
                )}
              </p>

              <p>
                👥 ${ride.passengerCount || 1}
              </p>

              <p>
                ${getRideStatusText(
                  ride.status
                )}
              </p>

              <small>
                ${formatDate(
                  ride.createdAt
                )}
              </small>

            </div>

          `;

        })
        .join("");


  } catch (error) {

    console.error(error);

    list.innerHTML =
      "<p>حدث خطأ أثناء تحميل السجل.</p>";
  }
}


/* ======================================================
   LOGOUT
   ====================================================== */

document.getElementById(
  "logoutBtn"
).onclick = async () => {

  try {

    await signOut(auth);

    currentUser = null;

    currentProfile = null;

    selectedRole = "customer";

    pickupLocation = null;

    destinationLocation = null;

    pickupCoords = null;

    destinationCoords = null;


    if (ridesUnsubscribe) {

      ridesUnsubscribe();

      ridesUnsubscribe = null;
    }


    showScreen("authScreen");


    showMessage(
      "تم تسجيل الخروج",
      "success"
    );

  } catch (error) {

    console.error(error);

    showMessage(
      "حدث خطأ أثناء تسجيل الخروج",
      "error"
    );
  }
};


/* ======================================================
   NAVIGATION
   ====================================================== */

document.getElementById(
  "profileBtn"
).onclick = () => {

  if (!currentUser) {

    showScreen("authScreen");

    return;
  }

  showScreen("profileScreen");
};


document.getElementById(
  "navHomeBtn"
).onclick = () => {

  if (
    currentProfile?.role ===
    "captain"
  ) {

    showScreen(
      "captainScreen"
    );

  } else {

    showScreen("homeScreen");
  }
};


document.getElementById(
  "navRidesBtn"
).onclick = () => {

  if (
    currentProfile?.role ===
    "captain"
  ) {

    showScreen(
      "captainScreen"
    );

    loadCaptainRides();

  } else {

    showScreen(
      "customerRidesScreen"
    );

    loadCustomerRides();
  }
};


document.getElementById(
  "navHistoryBtn"
).onclick = () => {

  if (
    currentProfile?.role ===
    "captain"
  ) {

    showScreen(
      "captainHistoryScreen"
    );

    loadCaptainHistory();

  } else {

    showScreen(
      "customerRidesScreen"
    );

    loadCustomerRides();
  }
};


document.getElementById(
  "navProfileBtn"
).onclick = () => {

  showScreen("profileScreen");

};


/* ======================================================
   AUTH BUTTONS
   ====================================================== */

document.getElementById(
  "sendCodeBtn"
).onclick = sendPhoneCode;


document.getElementById(
  "verifyCodeBtn"
).onclick = verifyPhoneCode;


/* ======================================================
   FIREBASE AUTH STATE
   ====================================================== */

onAuthStateChanged(
  auth,
  async user => {

    if (user) {

      currentUser = user;

      try {

        const userRef =
          doc(
            db,
            "users",
            user.uid
          );


        const snapshot =
          await getDoc(userRef);


        if (snapshot.exists()) {

          currentProfile =
            snapshot.data();

          selectedRole =
            currentProfile.role ||
            "customer";

          updateProfileUI();

          if (
            currentProfile.role ===
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
          }

        } else {

          showScreen(
            "authScreen"
          );
        }


      } catch (error) {

        console.error(error);

        showScreen(
          "authScreen"
        );
      }

    } else {

      currentUser = null;

      currentProfile = null;

      showScreen(
        "authScreen"
      );
    }
  }
);


/* ======================================================
   START APP
   ====================================================== */

showScreen("authScreen");
