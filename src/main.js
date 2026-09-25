import "./style.css";

import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { initializeApp } from "firebase/app";

import {
  getAuth,
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithEmailAndPassword,
  linkWithCredential,
  EmailAuthProvider,
  setPersistence,
  browserLocalPersistence,
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
  serverTimestamp,
  runTransaction
} from "firebase/firestore";

import { Geolocation } from "@capacitor/geolocation";


/* ======================================================
   FIREBASE
   ====================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyAZVXuhTTiGKfDflIZUm_8IgzhRjjWsfIc",
  authDomain: "wasselni-monufia-13f28.firebaseapp.com",
  projectId: "wasselni-monufia-13f28",
  storageBucket: "wasselni-monufia-13f28.firebasestorage.app",
  messagingSenderId: "1007737426615",
  appId: "1:1007737426615:web:76492206c1cd5f3fcef332",
  measurementId: "G-GGBSNFP0MS"
};

const firebaseApp = initializeApp(firebaseConfig);

const auth = getAuth(firebaseApp);

const db = getFirestore(firebaseApp);

setPersistence(auth, browserLocalPersistence).catch(console.error);


/* ======================================================
   GLOBAL VARIABLES
   ====================================================== */

let user = null;
let profile = null;

let map = null;

let pickupMarker = null;
let destMarker = null;
let routeLayer = null;
let accuracyCircle = null;

let pickup = null;
let destination = null;

let confirmationResult = null;
let recaptcha = null;

let watchCustomer = null;
let watchCaptain = null;


/* ======================================================
   HELPERS
   ====================================================== */

const $ = (selector) => document.querySelector(selector);

function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[m]
  );
}


/* ======================================================
   PHONE
   ====================================================== */

function phone(value) {

  let v = String(value || "")
    .trim()
    .replace(/[\s()-]/g, "");

  if (v.startsWith("00")) {
    v = "+" + v.slice(2);
  }

  if (v.startsWith("01")) {
    v = "+20" + v;
  }

  if (v.startsWith("20") && !v.startsWith("+")) {
    v = "+" + v;
  }

  return v;
}


/* ======================================================
   EMAIL USED FOR LOGIN
   ====================================================== */

function loginEmail(phoneNumber) {

  return (
    phone(phoneNumber).replace(/\D/g, "") +
    "@phone.wasselni.app"
  );

}


/* ======================================================
   ACCOUNT NUMBER
   ====================================================== */

function accountNo() {

  return String(
    Math.floor(
      10000000 +
      Math.random() * 90000000
    )
  );

}


/* ======================================================
   MESSAGE
   ====================================================== */

function msg(text, type = "info") {

  const box = $("#message");

  if (!box) return;

  box.replaceChildren(
    document.createTextNode(text)
  );

  box.className =
    "message-box " + type;

  box.style.display = "block";

  setTimeout(() => {

    box.style.display = "none";

  }, 4500);

}


/* ======================================================
   SCREEN
   ====================================================== */

function screen(id) {

  document
    .querySelectorAll(".screen")
    .forEach((x) =>
      x.classList.remove("active")
    );

  $("#" + id)?.classList.add("active");

  const nav = $("#nav");

  if (nav) {

    nav.style.display =
      ["login", "register"].includes(id)
        ? "none"
        : "grid";

  }

}


/* ======================================================
   HTML
   ====================================================== */

$("#app").innerHTML = `

<div class="app">

  <header class="header">

    <div class="logo">
      🚕 وصلني
      <span>المنوفية</span>
    </div>

    <button
      id="profileTop"
      class="icon-button">
      👤
    </button>

  </header>


  <div
    id="message"
    class="message-box"
    style="display:none">
  </div>


  <!-- ==================================================
       LOGIN
  ================================================== -->

  <section
    id="login"
    class="screen active">

    <div class="auth-card">

      <div class="auth-logo">
        🚕
      </div>

      <h1>
        وصلني المنوفية
      </h1>

      <p class="muted">
        تسجيل الدخول برقم الموبايل وكلمة المرور
      </p>


      <label>
        📱 رقم الموبايل
      </label>

      <input
        id="loginPhone"
        type="tel"
        inputmode="tel"
        placeholder="010xxxxxxxx"
      />


      <label>
        🔐 كلمة المرور
      </label>

      <input
        id="loginPass"
        type="password"
        placeholder="كلمة المرور"
      />


      <button
        id="loginBtn"
        class="btn primary">

        تسجيل الدخول

      </button>


      <button
        id="registerOpen"
        class="btn outline">

        إنشاء حساب جديد

      </button>


      <div
        id="loginMsg"
        class="status">
      </div>

    </div>

  </section>


  <!-- ==================================================
       REGISTER
  ================================================== -->

  <section
    id="register"
    class="screen">

    <div class="auth-card">

      <button
        id="backLogin"
        class="back-btn">

        ← رجوع

      </button>


      <h2>
        إنشاء حساب
      </h2>


      <label>
        نوع الحساب
      </label>

      <select id="role">

        <option value="customer">
          👤 عميل
        </option>

        <option value="captain">
          🚗 كابتن
        </option>

      </select>


      <label>
        الاسم بالكامل
      </label>

      <input
        id="name"
        placeholder="الاسم"
      />


      <label>
        📱 رقم الموبايل
      </label>

      <input
        id="regPhone"
        type="tel"
        inputmode="tel"
        placeholder="010xxxxxxxx"
      />


      <label>
        🔐 كلمة المرور
      </label>

      <input
        id="regPass"
        type="password"
        placeholder="6 أحرف أو أرقام على الأقل"
      />


      <label>
        🔐 تأكيد كلمة المرور
      </label>

      <input
        id="regPass2"
        type="password"
        placeholder="تأكيد كلمة المرور"
      />


      <!-- CAPTAIN ONLY -->

      <div
        id="captainFields"
        style="display:none">

        <label>
          🎂 السن
        </label>

        <input
          id="age"
          type="number"
          min="18"
          placeholder="السن"
        />


        <label>
          🚗 نوع العربية
        </label>

        <input
          id="carType"
          placeholder="سيدان / ميكروباص / نص نقل"
        />


        <label>
          🚘 موديل العربية
        </label>

        <input
          id="carModel"
          placeholder="مثال: لانسر 2018"
        />


        <label>
          🔢 رقم اللوحة
        </label>

        <input
          id="plate"
          placeholder="رقم اللوحة"
        />

      </div>


      <div id="regRecaptcha"></div>


      <button
        id="sendCode"
        class="btn primary">

        إرسال كود التحقق

      </button>


      <div
        id="codeBox"
        style="display:none">

        <label>
          🔢 كود التحقق
        </label>

        <input
          id="code"
          inputmode="numeric"
          placeholder="الكود"
        />


        <button
          id="finishReg"
          class="btn green">

          تأكيد وإنشاء الحساب

        </button>

      </div>


      <div
        id="regMsg"
        class="status">
      </div>

    </div>

  </section>


  <!-- ==================================================
       CUSTOMER HOME
  ================================================== -->

  <section
    id="home"
    class="screen">

    <div class="hero">

      <h2>
        أهلاً بيك 👋
      </h2>

      <p>
        اطلب رحلتك وحدد كل تفاصيلها.
      </p>

    </div>


    <!-- PICKUP -->

    <div class="card">

      <label>
        📍 مكان الانطلاق
      </label>

      <button
        id="myLocation"
        class="btn outline">

        🎯 تحديد موقعي بدقة

      </button>

      <div
        id="pickupText"
        class="status">

        لم يتم تحديد موقع الانطلاق

      </div>

    </div>


    <!-- DESTINATION -->

    <div class="card">

      <label>
        🏁 مكان الوصول
      </label>

      <button
        id="chooseDest"
        class="btn outline">

        🗺️ تحديد مكان النزول على الخريطة

      </button>

      <div
        id="destText"
        class="status">

        لم يتم تحديد مكان الوصول

      </div>

    </div>


    <!-- RIDE DETAILS -->

    <div class="card">

      <label>
        📅 تاريخ الرحلة
      </label>

      <input
        id="rideDate"
        type="date"
      />


      <label>
        ⏰ وقت الرحلة
      </label>

      <input
        id="rideTime"
        type="time"
      />


      <div
        id="dayName"
        class="status">

        اسم اليوم سيظهر هنا

      </div>


      <label>
        👥 عدد الركاب
      </label>

      <select id="passengers">

        <option value="1">1</option>
        <option value="2">2</option>
        <option value="3">3</option>
        <option value="4">4</option>
        <option value="5">5</option>
        <option value="6">6</option>
        <option value="7">7</option>
        <option value="8">8</option>

      </select>


      <label>
        💰 سعر الرحلة
      </label>

      <input
        id="price"
        type="number"
        min="1"
        placeholder="مثال: 150"
      />


      <label>
        📝 ملاحظات
      </label>

      <textarea
        id="notes"
        rows="4"
        placeholder="شنطة كبيرة، طفل، كرسي، ملاحظة للكابتن..."
      ></textarea>


      <button
        id="request"
        class="btn primary">

        🚕 نشر الرحلة للكباتن

      </button>

    </div>

  </section>


  <!-- ==================================================
       MAP
  ================================================== -->

  <section
    id="mapScreen"
    class="screen">

    <div class="card">

      <div class="map-head">

        <div>

          <h2>
            🗺️ تحديد المكان
          </h2>

          <small>
            حرّك الخريطة حتى يكون الدبوس فوق المكان المطلوب.
          </small>

        </div>


        <button
          id="closeMap"
          class="btn danger small-btn">

          إلغاء

        </button>

      </div>


      <input
        id="search"
        placeholder="🔎 ابحث عن شارع، قرية، منزل أو مكان"
      />


      <div
        id="results"
        class="search-results">
      </div>

    </div>


    <div class="map-wrapper">

      <div id="map"></div>

      <div class="map-center-pin">
        📍
      </div>

      <button
        id="mapLocation"
        class="map-control">

        🎯

      </button>

    </div>


    <div class="card">

      <div
        id="address"
        class="status">

        حرّك الخريطة حتى يصبح الدبوس فوق المكان المطلوب.

      </div>


      <div
        id="coords"
        class="coords">
      </div>


      <button
        id="confirmDest"
        class="btn primary">

        ✅ تأكيد المكان

      </button>

    </div>

  </section>


  <!-- ==================================================
       CUSTOMER RIDES
  ================================================== -->

  <section
    id="rides"
    class="screen">

    <div class="hero">

      <h2>
        📋 رحلاتي
      </h2>

      <p>
        تابع حالة رحلاتك وتفاصيل التواصل بعد القبول.
      </p>

    </div>


    <div id="ridesList"></div>

  </section>


  <!-- ==================================================
       CAPTAIN
  ================================================== -->

  <section
    id="captain"
    class="screen">

    <div class="hero">

      <h2>
        🚗 منصة الكابتن
      </h2>

      <p>
        الرحلات التي نشرها العملاء تظهر هنا.
      </p>

    </div>


    <div
      id="captainList">
    </div>

  </section>


  <!-- ==================================================
       PROFILE
  ================================================== -->

  <section
    id="profile"
    class="screen">

    <div class="card">

      <div class="avatar">
        👤
      </div>

      <h2>
        حسابي
      </h2>


      <div
        id="profileInfo">
      </div>


      <button
        id="logout"
        class="btn danger">

        تسجيل الخروج

      </button>

    </div>

  </section>


  <!-- ==================================================
       NAVIGATION
  ================================================== -->

  <nav
    id="nav"
    class="nav">

    <button id="navHome">
      🏠
      <br>
      الرئيسية
    </button>


    <button id="navRides">
      📋
      <br>
      رحلاتي
    </button>


    <button id="navCaptain">
      🚗
      <br>
      الكابتن
    </button>


    <button id="navProfile">
      👤
      <br>
      حسابي
    </button>

  </nav>

</div>
`;


/* ======================================================
   LOCATION
   ====================================================== */

async function exactLocation() {

  const permission =
    await Geolocation.checkPermissions();

  if (permission.location !== "granted") {

    const result =
      await Geolocation.requestPermissions();

    if (result.location !== "granted") {
      throw new Error("LOCATION_DENIED");
    }

  }


  const position =
    await Geolocation.getCurrentPosition({

      enableHighAccuracy: true,

      timeout: 20000,

      maximumAge: 0

    });


  return {

    lat: position.coords.latitude,

    lng: position.coords.longitude,

    accuracy: position.coords.accuracy

  };

}


/* ======================================================
   REVERSE GEOCODING
   ====================================================== */

async function reverse(lat, lng) {

  try {

    const url =
      `https://nominatim.openstreetmap.org/reverse` +
      `?format=jsonv2` +
      `&lat=${lat}` +
      `&lon=${lng}` +
      `&zoom=18` +
      `&addressdetails=1` +
      `&accept-language=ar`;

    const response =
      await fetch(url);

    const data =
      await response.json();

    return (
      data.display_name ||
      `موقع ${lat.toFixed(6)}, ${lng.toFixed(6)}`
    );

  } catch {

    return `موقع ${lat.toFixed(6)}, ${lng.toFixed(6)}`;

  }

}


/* ======================================================
   MARKER
   ====================================================== */

function marker(type, point) {

  const icon =
    L.divIcon({

      className:
        "custom-marker",

      html:
        `<div class="${type}-marker">
          ${type === "pickup" ? "🚕" : "📍"}
        </div>`,

      iconSize: [48, 48],

      iconAnchor: [24, 42]

    });


  return L.marker(
    [point.lat, point.lng],
    { icon }
  ).addTo(map);

}


/* ======================================================
   MAP CENTER
   ====================================================== */

async function centerChanged() {

  if (!map) return;


  const center =
    map.getCenter();


  destination = {

    lat: center.lat,

    lng: center.lng

  };


  if (destMarker) {

    destMarker.setLatLng([
      center.lat,
      center.lng
    ]);

  } else {

    destMarker =
      marker(
        "destination",
        destination
      );

  }


  $("#coords").textContent =
    `${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`;


  $("#address").textContent =
    "جاري تحديد العنوان...";


  const address =
    await reverse(
      center.lat,
      center.lng
    );


  $("#address").innerHTML =
    `🏁 <strong>${esc(address)}</strong>`;


  drawRoute();

}


/* ======================================================
   INIT MAP
   ====================================================== */

function initMap() {

  if (map) {

    setTimeout(() => {

      map.invalidateSize();

    }, 200);

    return;

  }


  map =
    L.map("map", {

      zoomControl: false

    }).setView(

      pickup
        ? [pickup.lat, pickup.lng]
        : [30.5526, 31.0106],

      pickup ? 18 : 13

    );


  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {

      maxZoom: 20,

      attribution:
        "© OpenStreetMap contributors"

    }
  ).addTo(map);


  L.control.zoom({

    position: "bottomright"

  }).addTo(map);


  map.on(
    "moveend",
    centerChanged
  );


  if (pickup) {

    pickupMarker =
      marker(
        "pickup",
        pickup
      );

  }


  if (destination) {

    destMarker =
      marker(
        "destination",
        destination
      );

  }

}


/* ======================================================
   SET PICKUP
   ====================================================== */

async function setPickup() {

  try {

    const p =
      await exactLocation();


    pickup = {

      lat: p.lat,

      lng: p.lng

    };


    if (pickupMarker) {

      pickupMarker.setLatLng([
        p.lat,
        p.lng
      ]);

    } else if (map) {

      pickupMarker =
        marker(
          "pickup",
          pickup
        );

    }


    if (accuracyCircle) {

      accuracyCircle.remove();

    }


    if (map) {

      accuracyCircle =
        L.circle(
          [p.lat, p.lng],
          {

            radius:
              Math.max(
                10,
                p.accuracy
              ),

            weight: 2,

            fillOpacity: 0.08

          }
        ).addTo(map);

    }


    const address =
      await reverse(
        p.lat,
        p.lng
      );


    $("#pickupText").innerHTML =

      `📍 <strong>${esc(address)}</strong>
       <br>
       <small>
       دقة GPS تقريباً
       ${Math.round(p.accuracy)}
       متر
       </small>`;


    if (map) {

      map.setView(
        [p.lat, p.lng],
        19
      );

    }


    msg(
      "تم تحديد موقعك بدقة 📍",
      "success"
    );

  } catch (error) {

    console.error(error);

    msg(
      "اسمح للتطبيق بالموقع وشغّل GPS ثم حاول مرة أخرى.",
      "error"
    );

  }

}


/* ======================================================
   ROUTE
   ====================================================== */

async function drawRoute() {

  if (!pickup || !destination) {
    return;
  }


  try {

    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${pickup.lng},${pickup.lat};` +
      `${destination.lng},${destination.lat}` +
      `?overview=full&geometries=geojson&steps=true`;


    const response =
      await fetch(url);


    const data =
      await response.json();


    if (!data.routes?.length) {
      return;
    }


    if (routeLayer) {

      routeLayer.remove();

    }


    routeLayer =
      L.geoJSON(
        data.routes[0].geometry,
        {

          style: {

            weight: 6,

            opacity: 0.85

          }

        }
      ).addTo(map);

  } catch (error) {

    console.error(error);

  }

}


/* ======================================================
   SEARCH PLACES
   ====================================================== */

async function searchPlaces(queryText) {

  const box =
    $("#results");


  if (queryText.length < 3) {

    box.innerHTML = "";

    return;

  }


  box.innerHTML =
    "<div class='status'>🔎 جاري البحث...</div>";


  try {

    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?format=jsonv2` +
      `&q=${encodeURIComponent(queryText + ", Egypt")}` +
      `&limit=8` +
      `&addressdetails=1` +
      `&accept-language=ar` +
      `&countrycodes=eg`;


    const response =
      await fetch(url);


    const data =
      await response.json();


    box.innerHTML =

      data.length

        ? data.map(item => `

            <button
              class="search-result"
              data-lat="${item.lat}"
              data-lon="${item.lon}"
              data-name="${esc(item.display_name)}">

              📍
              ${esc(item.display_name)}

            </button>

          `).join("")

        : "<div class='status'>لا توجد نتائج.</div>";


    box
      .querySelectorAll(".search-result")
      .forEach(button => {

        button.onclick = () => {

          destination = {

            lat:
              Number(button.dataset.lat),

            lng:
              Number(button.dataset.lon)

          };


          map.setView(
            [
              destination.lat,
              destination.lng
            ],
            19
          );


          $("#search").value =
            button.dataset.name;


          box.innerHTML = "";

        };

      });

  } catch {

    box.innerHTML =
      "<div class='status'>تعذر البحث.</div>";

  }

}


/* ======================================================
   DAY NAME
   ====================================================== */

function updateDayName() {

  const date =
    $("#rideDate").value;


  if (!date) {

    $("#dayName").textContent =
      "اسم اليوم سيظهر هنا";

    return;

  }


  const d =
    new Date(
      `${date}T12:00:00`
    );


  const days = [

    "الأحد",

    "الإثنين",

    "الثلاثاء",

    "الأربعاء",

    "الخميس",

    "الجمعة",

    "السبت"

  ];


  $("#dayName").innerHTML =
    `📅 يوم الرحلة: <strong>${days[d.getDay()]}</strong>`;

}


/* ======================================================
   CUSTOMER - CREATE RIDE
   ====================================================== */

$("#request").onclick = async () => {

  if (!user) {

    screen("login");

    return;

  }


  if (profile?.role !== "customer") {

    msg(
      "حساب الكابتن لا يستطيع طلب رحلة.",
      "error"
    );

    return;

  }


  if (!pickup || !destination) {

    msg(
      "حدد مكان الانطلاق والوصول أولاً.",
      "error"
    );

    return;

  }


  const rideDate =
    $("#rideDate").value;


  const rideTime =
    $("#rideTime").value;


  if (!rideDate) {

    msg(
      "اختار تاريخ الرحلة.",
      "error"
    );

    return;

  }


  if (!rideTime) {

    msg(
      "اختار وقت الرحلة.",
      "error"
    );

    return;

  }


  const price =
    Number($("#price").value);


  if (!price || price <= 0) {

    msg(
      "اكتب سعر الرحلة.",
      "error"
    );

    return;

  }


  try {

    const fromPlace =
      await reverse(
        pickup.lat,
        pickup.lng
      );


    const toPlace =
      await reverse(
        destination.lat,
        destination.lng
      );


    const dateObject =
      new Date(
        `${rideDate}T12:00:00`
      );


    const days = [

      "الأحد",

      "الإثنين",

      "الثلاثاء",

      "الأربعاء",

      "الخميس",

      "الجمعة",

      "السبت"

    ];


    const dayName =
      days[dateObject.getDay()];


    const rideRef =
      await addDoc(
        collection(db, "rides"),
        {

          customerId: user.uid,

          customerName:
            profile.name || "",


          fromPlace,

          toPlace,


          pickupCoords: pickup,

          destinationCoords:
            destination,


          price,

          passengers:
            Number(
              $("#passengers").value
            ),


          notes:
            $("#notes").value.trim(),


          rideDate,

          rideTime,

          dayName,


          status: "open",


          createdAt:
            serverTimestamp()

        }
      );


    /*
      رقم العميل لا يوضع داخل الرحلة المفتوحة.
      يتم وضعه في contact/info بحيث لا يظهر للكابتن
      إلا بعد قبول الرحلة.
    */

    await setDoc(

      doc(
        db,
        "rides",
        rideRef.id,
        "contact",
        "info"
      ),

      {

        customerPhone:
          profile.phone ||
          user.phoneNumber ||
          "",

        captainPhone: "",

        createdAt:
          serverTimestamp()

      }

    );


    localStorage.setItem(
      "lastRide",
      rideRef.id
    );


    msg(
      "تم نشر الرحلة للكباتن 🚕",
      "success"
    );


    /*
      تفريغ الحقول بعد النشر
    */

    $("#price").value = "";

    $("#notes").value = "";

    $("#rideDate").value = "";

    $("#rideTime").value = "";

    $("#dayName").textContent =
      "اسم اليوم سيظهر هنا";


    screen("rides");

    loadCustomerRides();

  } catch (error) {

    console.error(error);

    msg(
      "تعذر نشر الرحلة: " +
      (error.message || ""),
      "error"
    );

  }

};


/* ======================================================
   DATE
   ====================================================== */

$("#rideDate").onchange =
  updateDayName;


/* ======================================================
   REGISTER ROLE
   ====================================================== */

$("#role").onchange = () => {

  $("#captainFields").style.display =
    $("#role").value === "captain"
      ? "block"
      : "none";

};


/* ======================================================
   OPEN REGISTER
   ====================================================== */

$("#registerOpen").onclick = () => {

  screen("register");


  if (!recaptcha) {

    recaptcha =
      new RecaptchaVerifier(
        auth,
        "regRecaptcha",
        {

          size: "normal"

        }
      );


    recaptcha
      .render()
      .catch(console.error);

  }

};


/* ======================================================
   BACK LOGIN
   ====================================================== */

$("#backLogin").onclick =
  () => screen("login");


/* ======================================================
   SEND OTP
   ====================================================== */

$("#sendCode").onclick =
  async () => {

    const p =
      phone(
        $("#regPhone").value
      );


    const pass =
      $("#regPass").value;


    const name =
      $("#name").value.trim();


    if (!name) {

      $("#regMsg").textContent =
        "اكتب الاسم بالكامل.";

      return;

    }


    if (!/^\+20\d{10}$/.test(p)) {

      $("#regMsg").textContent =
        "اكتب رقم موبايل مصري صحيح.";

      return;

    }


    if (pass.length < 6) {

      $("#regMsg").textContent =
        "كلمة المرور لازم تكون 6 أحرف أو أرقام على الأقل.";

      return;

    }


    if (
      pass !==
      $("#regPass2").value
    ) {

      $("#regMsg").textContent =
        "تأكيد كلمة المرور غير مطابق.";

      return;

    }


    if (
      $("#role").value ===
      "captain"
    ) {

      const age =
        Number($("#age").value);


      if (!age || age < 18) {

        $("#regMsg").textContent =
          "الكابتن لازم يكون عمره 18 سنة أو أكثر.";

        return;

      }


      if (
        !$("#carType").value.trim() ||
        !$("#carModel").value.trim() ||
        !$("#plate").value.trim()
      ) {

        $("#regMsg").textContent =
          "كمل بيانات العربية ورقم اللوحة.";

        return;

      }

    }


    try {

      $("#sendCode").disabled =
        true;


      confirmationResult =
        await signInWithPhoneNumber(
          auth,
          p,
          recaptcha
        );


      $("#codeBox").style.display =
        "block";


      $("#regMsg").textContent =
        "تم إرسال كود التحقق إلى الموبايل.";


    } catch (error) {

      console.error(error);

      $("#regMsg").textContent =
        error.message ||
        "تعذر إرسال كود التحقق.";


      $("#sendCode").disabled =
        false;

    }

};


/* ======================================================
   FINISH REGISTER
   ====================================================== */

$("#finishReg").onclick =
  async () => {

    try {

      if (!confirmationResult) {

        $("#regMsg").textContent =
          "اطلب كود التحقق أولاً.";

        return;

      }


      const code =
        $("#code").value.trim();


      if (!code) {

        $("#regMsg").textContent =
          "اكتب كود التحقق.";

        return;

      }


      const p =
        phone(
          $("#regPhone").value
        );


      const pass =
        $("#regPass").value;


      /*
        تأكيد رقم الهاتف
      */

      const credentialResult =
        await confirmationResult.confirm(
          code
        );


      const firebaseUser =
        credentialResult.user;


      /*
        ربط رقم الهاتف بحساب
        Email/Password داخلي
        حتى يكون الدخول لاحقاً
        بالموبايل + الباسورد.
      */

      try {

        await linkWithCredential(

          firebaseUser,

          EmailAuthProvider.credential(
            loginEmail(p),
            pass
          )

        );

      } catch (error) {

        if (
          error.code !==
          "auth/provider-already-linked"
        ) {

          throw error;

        }

      }


      const role =
        $("#role").value;


      /*
        مهم:
        مفيش role اسمه both
      */

      const data = {

        uid:
          firebaseUser.uid,

        name:
          $("#name").value.trim(),

        phone: p,

        role,

        accountNumber:
          accountNo(),

        createdAt:
          serverTimestamp()

      };


      if (role === "captain") {

        data.age =
          Number(
            $("#age").value
          );


        data.carType =
          $("#carType")
            .value
            .trim();


        data.carModel =
          $("#carModel")
            .value
            .trim();


        data.plateNumber =
          $("#plate")
            .value
            .trim();

      }


      await setDoc(

        doc(
          db,
          "users",
          firebaseUser.uid
        ),

        data,

        {
          merge: true
        }

      );


      user =
        firebaseUser;


      profile =
        data;


      msg(
        "تم إنشاء الحساب بنجاح ✅",
        "success"
      );


      if (
        role ===
        "captain"
      ) {

        screen("captain");

        loadCaptain();

      } else {

        screen("home");

      }

    } catch (error) {

      console.error(error);

      $("#regMsg").textContent =
        error.message ||
        "تعذر إنشاء الحساب.";

    }

  };


/* ======================================================
   LOGIN
   ====================================================== */

$("#loginBtn").onclick =
  async () => {

    const p =
      phone(
        $("#loginPhone").value
      );


    const pass =
      $("#loginPass").value;


    if (
      !/^\+20\d{10}$/.test(p)
    ) {

      $("#loginMsg").textContent =
        "اكتب رقم موبايل مصري صحيح.";

      return;

    }


    if (!pass) {

      $("#loginMsg").textContent =
        "اكتب كلمة المرور.";

      return;

    }


    try {

      await signInWithEmailAndPassword(

        auth,

        loginEmail(p),

        pass

      );


      $("#loginMsg").textContent =
        "تم الدخول ✅";

    } catch (error) {

      console.error(error);

      $("#loginMsg").textContent =
        "رقم الموبايل أو كلمة المرور غير صحيحة.";

    }

  };


/* ======================================================
   LOAD PROFILE
   ====================================================== */

async function loadProfile() {

  if (!user) return;


  const snapshot =
    await getDoc(
      doc(
        db,
        "users",
        user.uid
      )
    );


  if (
    !snapshot.exists()
  ) {

    profile = null;

    return;

  }


  profile =
    snapshot.data();


  $("#profileInfo").innerHTML = `

    <div class="profile-row">

      <span>
        👤 الاسم
      </span>

      <strong>
        ${esc(profile.name)}
      </strong>

    </div>


    <div class="profile-row">

      <span>
        📱 الموبايل
      </span>

      <strong>
        ${esc(profile.phone)}
      </strong>

    </div>


    <div class="profile-row">

      <span>
        🔢 رقم الحساب
      </span>

      <strong>
        ${esc(profile.accountNumber)}
      </strong>

    </div>


    <div class="profile-row">

      <span>
        نوع الحساب
      </span>

      <strong>
        ${
          profile.role === "captain"
            ? "🚗 كابتن"
            : "👤 عميل"
        }
      </strong>

    </div>


    ${
      profile.role === "captain"

        ? `

          <div class="profile-row">

            <span>
              🎂 السن
            </span>

            <strong>
              ${esc(profile.age)}
            </strong>

          </div>


          <div class="profile-row">

            <span>
              🚘 العربية
            </span>

            <strong>
              ${esc(profile.carType)}
              -
              ${esc(profile.carModel)}
            </strong>

          </div>


          <div class="profile-row">

            <span>
              🔢 اللوحة
            </span>

            <strong>
              ${esc(profile.plateNumber)}
            </strong>

          </div>

        `

        : ""

    }

  `;

}


/* ======================================================
   LOAD CONTACT
   ====================================================== */

async function loadContact(rideId) {

  try {

    const contactSnapshot =
      await getDoc(

        doc(
          db,
          "rides",
          rideId,
          "contact",
          "info"
        )

      );


    if (
      !contactSnapshot.exists()
    ) {

      return null;

    }


    return contactSnapshot.data();

  } catch (error) {

    console.error(error);

    return null;

  }

}


/* ======================================================
   CUSTOMER RIDES
   ====================================================== */

function loadCustomerRides() {

  if (!user) return;


  if (profile?.role !== "customer") {

    $("#ridesList").innerHTML = `

      <div class="card">

        هذه الصفحة للعميل فقط.

      </div>

    `;

    return;

  }


  if (watchCustomer) {

    watchCustomer();

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
        user.uid
      ),

      limit(30)

    );


  watchCustomer =
    onSnapshot(

      ridesQuery,

      async snapshot => {

        const rides =
          snapshot.docs
            .map(item => ({

              id:
                item.id,

              ...item.data()

            }))


            .sort(

              (a, b) =>

                (b.createdAt?.seconds || 0) -

                (a.createdAt?.seconds || 0)

            );


        if (!rides.length) {

          $("#ridesList").innerHTML = `

            <div class="empty-state">

              📋 لا توجد رحلات حتى الآن.

            </div>

          `;

          return;

        }


        const htmlParts = [];


        for (const ride of rides) {

          let contactHtml = "";


          if (
            ride.status ===
            "accepted"
          ) {

            const contact =
              await loadContact(
                ride.id
              );


            if (
              contact?.captainPhone
            ) {

              contactHtml = `

                <div class="status">

                  📞
                  <strong>
                    رقم الكابتن:
                  </strong>

                  <a
                    href="tel:${esc(contact.captainPhone)}">

                    ${esc(contact.captainPhone)}

                  </a>

                </div>

              `;

            }

          }


          const statusText =
            ride.status === "open"
              ? "🟡 في انتظار كابتن"

              : ride.status === "accepted"
                ? "🟢 تم قبول الرحلة"

                : ride.status;


          htmlParts.push(`

            <div class="card">

              <span class="pill">
                ${statusText}
              </span>


              <h3>
                📍 ${esc(ride.fromPlace)}
              </h3>


              <div class="status">

                🏁
                <strong>
                  ${esc(ride.toPlace)}
                </strong>

              </div>


              <p>

                💰
                <strong>
                  ${esc(
                    ride.finalPrice ||
                    ride.price
                  )}
                  جنيه
                </strong>

              </p>


              <p>

                👥
                ${esc(ride.passengers)}
                ركاب

              </p>


              <p>

                📅
                ${esc(ride.dayName)}

                -
                ${esc(ride.rideDate)}

              </p>


              <p>

                ⏰
                ${esc(ride.rideTime)}

              </p>


              ${
                ride.notes

                  ? `

                    <div class="status">

                      📝
                      ${esc(ride.notes)}

                    </div>

                  `

                  : ""

              }


              ${contactHtml}

            </div>

          `);

        }


        $("#ridesList").innerHTML =
          htmlParts.join("");

      },

      error => {

        console.error(error);

        $("#ridesList").innerHTML = `

          <div class="card error">

            تعذر تحميل رحلاتك.

          </div>

        `;

      }

    );

}


/* ======================================================
   CAPTAIN PLATFORM
   ====================================================== */

function loadCaptain() {

  if (
    profile?.role !==
    "captain"
  ) {

    $("#captainList").innerHTML = `

      <div class="card">

        هذه الصفحة للكابتن فقط.

      </div>

    `;

    return;

  }


  if (watchCaptain) {

    watchCaptain();

  }


  const openQuery =
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


  watchCaptain =
    onSnapshot(

      openQuery,

      snapshot => {

        const rides =
          snapshot.docs
            .map(item => ({

              id:
                item.id,

              ...item.data()

            }));


        let html = `

          <div class="card">

            <h3>
              🚕 الرحلات المتاحة الآن
            </h3>

            <p class="muted">

              رقم العميل مخفي حتى تقبل الرحلة.

            </p>

          </div>

        `;


        if (!rides.length) {

          html += `

            <div class="empty-state">

              🚗 مفيش رحلات مفتوحة حالياً.

            </div>

          `;

        }


        rides.forEach(ride => {

          html += `

            <div class="card">

              <span class="pill">

                🟡 رحلة متاحة

              </span>


              <h3>

                📍
                ${esc(ride.fromPlace)}

              </h3>


              <div class="status">

                🏁
                <strong>
                  ${esc(ride.toPlace)}
                </strong>

              </div>


              <p>

                💰
                <strong>
                  ${esc(ride.price)}
                  جنيه
                </strong>

              </p>


              <p>

                👥
                ${esc(ride.passengers)}
                ركاب

              </p>


              <p>

                📅
                ${esc(ride.dayName)}
                -
                ${esc(ride.rideDate)}

              </p>


              <p>

                ⏰
                ${esc(ride.rideTime)}

              </p>


              ${
                ride.notes

                  ? `

                    <div class="status">

                      📝
                      ${esc(ride.notes)}

                    </div>

                  `

                  : ""

              }


              <div class="status">

                📞
                رقم العميل يظهر بعد قبول الرحلة.

              </div>


              <button

                class="btn green"

                data-accept="${ride.id}">

                ✅ قبول الرحلة

              </button>

            </div>

          `;

        });


        $("#captainList").innerHTML =
          html;


        document
          .querySelectorAll(
            "[data-accept]"
          )
          .forEach(button => {

            button.onclick =
              () =>
                acceptRide(
                  button.dataset.accept
                );

          });

      },

      error => {

        console.error(error);

        $("#captainList").innerHTML = `

          <div class="card error">

            تعذر تحميل الرحلات.

          </div>

        `;

      }

    );


  /*
    تحميل الرحلات التي قبلها الكابتن
  */

  loadCaptainAcceptedRides();

}


/* ======================================================
   ACCEPT RIDE
   ====================================================== */

async function acceptRide(rideId) {

  if (
    !user ||
    profile?.role !== "captain"
  ) {

    msg(
      "هذه العملية للكابتن فقط.",
      "error"
    );

    return;

  }


  try {

    const rideRef =
      doc(
        db,
        "rides",
        rideId
      );


    /*
      Transaction:
      تمنع كابتنين من قبول نفس الرحلة
      في نفس اللحظة.
    */

    await runTransaction(

      db,

      async transaction => {

        const rideSnapshot =
          await transaction.get(
            rideRef
          );


        if (
          !rideSnapshot.exists()
        ) {

          throw new Error(
            "الرحلة غير موجودة."
          );

        }


        const ride =
          rideSnapshot.data();


        if (
          ride.status !==
          "open"
        ) {

          throw new Error(
            "الرحلة تم قبولها بالفعل."
          );

        }


        transaction.update(

          rideRef,

          {

            status:
              "accepted",

            captainId:
              user.uid,

            captainName:
              profile.name || "",

            acceptedAt:
              serverTimestamp()

          }

        );

      }

    );


    /*
      بعد قبول الرحلة:
      الكابتن يضيف رقمه فقط.
      رقم العميل موجود بالفعل داخل contact/info
      لكنه كان مخفي بالقواعد قبل القبول.
    */

    await updateDoc(

      doc(
        db,
        "rides",
        rideId,
        "contact",
        "info"
      ),

      {

        captainPhone:
          profile.phone ||
          user.phoneNumber ||
          "",

        captainName:
          profile.name || ""

      }

    );


    msg(
      "تم قبول الرحلة ✅ رقم العميل أصبح متاحًا لك 📞",
      "success"
    );


    loadCaptain();

  } catch (error) {

    console.error(error);

    msg(
      error.message ||
      "تعذر قبول الرحلة.",
      "error"
    );

  }

}


/* ======================================================
   CAPTAIN ACCEPTED RIDES
   ====================================================== */

function loadCaptainAcceptedRides() {

  if (
    profile?.role !==
    "captain"
  ) return;


  const acceptedQuery =
    query(

      collection(
        db,
        "rides"
      ),

      where(
        "captainId",
        "==",
        user.uid
      ),

      where(
        "status",
        "==",
        "accepted"
      ),

      limit(20)

    );


  onSnapshot(

    acceptedQuery,

    async snapshot => {

      if (
        snapshot.empty
      ) {

        return;

      }


      let html = `

        <div class="card">

          <h3>
            🟢 الرحلات التي قبلتها
          </h3>

        </div>

      `;


      for (
        const item
        of snapshot.docs
      ) {

        const ride = {

          id:
            item.id,

          ...item.data()

        };


        const contact =
          await loadContact(
            ride.id
          );


        html += `

          <div class="card">

            <span class="pill">

              🟢 رحلة مقبولة

            </span>


            <h3>

              📍
              ${esc(ride.fromPlace)}

            </h3>


            <div class="status">

              🏁
              ${esc(ride.toPlace)}

            </div>


            <p>

              💰
              ${esc(ride.price)}
              جنيه

            </p>


            <p>

              📅
              ${esc(ride.dayName)}
              -
              ${esc(ride.rideDate)}

            </p>


            <p>

              ⏰
              ${esc(ride.rideTime)}

            </p>


            ${
              ride.notes

                ? `

                  <div class="status">

                    📝
                    ${esc(ride.notes)}

                  </div>

                `

                : ""

            }


            ${
              contact?.customerPhone

                ? `

                  <div class="status">

                    📞

                    <strong>
                      رقم العميل:
                    </strong>

                    <a
                      href="tel:${esc(
                        contact.customerPhone
                      )}">

                      ${esc(
                        contact.customerPhone
                      )}

                    </a>

                  </div>

                `

                : ""

            }

          </div>

        `;

      }


      /*
        نضيف الرحلات المقبولة
        أسفل الرحلات المفتوحة.
      */

      const current =
        $("#captainList")
          .innerHTML;


      /*
        منع تكرار القسم عند التحديث
      */

      const markerText =
        "الرحلات التي قبلتها";


      if (
        !current.includes(
          markerText
        )
      ) {

        $("#captainList").innerHTML +=
          html;

      } else {

        /*
          لو القسم موجود، نعيد تحميل الصفحة
          من خلال loadCaptain عند الحاجة.
        */

      }

    }

  );

}


/* ======================================================
   NAVIGATION
   ====================================================== */

$("#navHome").onclick = () => {

  if (
    profile?.role !==
    "customer"
  ) {

    msg(
      "الرئيسية الخاصة بالعميل فقط.",
      "error"
    );

    return;

  }


  screen("home");

};


$("#navRides").onclick = () => {

  if (
    profile?.role !==
    "customer"
  ) {

    msg(
      "صفحة الرحلات خاصة بالعميل.",
      "error"
    );

    return;

  }


  screen("rides");

  loadCustomerRides();

};


$("#navCaptain").onclick = () => {

  if (
    profile?.role !==
    "captain"
  ) {

    msg(
      "منصة الكابتن خاصة بالكابتن فقط.",
      "error"
    );

    return;

  }


  screen("captain");

  loadCaptain();

};


$("#navProfile").onclick =
  async () => {

    await loadProfile();

    screen("profile");

  };


$("#profileTop").onclick =
  async () => {

    await loadProfile();

    screen("profile");

  };


/* ======================================================
   LOGOUT
   ====================================================== */

$("#logout").onclick =
  async () => {

    try {

      if (watchCustomer) {

        watchCustomer();

        watchCustomer = null;

      }


      if (watchCaptain) {

        watchCaptain();

        watchCaptain = null;

      }


      await signOut(auth);


      user = null;

      profile = null;

      pickup = null;

      destination = null;


      screen("login");


      msg(
        "تم تسجيل الخروج.",
        "success"
      );

    } catch (error) {

      console.error(error);

    }

  };


/* ======================================================
   MAP BUTTONS
   ====================================================== */

$("#myLocation").onclick =
  setPickup;


$("#mapLocation").onclick =
  setPickup;


$("#chooseDest").onclick =
  () => {

    screen("mapScreen");


    setTimeout(() => {

      initMap();

      map.invalidateSize();

    }, 150);

  };


$("#closeMap").onclick =
  () => {

    screen("home");

  };


$("#confirmDest").onclick =
  async () => {

    if (!destination) {

      msg(
        "حدد مكان الوصول أولاً.",
        "error"
      );

      return;

    }


    const address =
      await reverse(

        destination.lat,

        destination.lng

      );


    $("#destText").innerHTML =

      `🏁
       <strong>
       ${esc(address)}
       </strong>`;


    screen("home");


    msg(
      "تم تحديد مكان الوصول بدقة ✅",
      "success"
    );

  };


/* ======================================================
   SEARCH
   ====================================================== */

let searchTimer;


$("#search").oninput = () => {

  clearTimeout(
    searchTimer
  );


  searchTimer =
    setTimeout(

      () =>
        searchPlaces(
          $("#search")
            .value
            .trim()
        ),

      650

    );

};


/* ======================================================
   AUTH STATE
   ====================================================== */

onAuthStateChanged(

  auth,

  async firebaseUser => {

    user =
      firebaseUser;


    if (!firebaseUser) {

      profile = null;

      screen("login");

      return;

    }


    try {

      await loadProfile();


      if (!profile) {

        await signOut(auth);

        screen("login");

        return;

      }


      /*
        العميل يدخل على صفحة العميل فقط.
      */

      if (
        profile.role ===
        "customer"
      ) {

        screen("home");

        loadCustomerRides();

        return;

      }


      /*
        الكابتن يدخل على صفحة الكابتن فقط.
      */

      if (
        profile.role ===
        "captain"
      ) {

        screen("captain");

        loadCaptain();

        return;

      }


      /*
        أي Role غير معروف يتم تسجيل خروجه.
      */

      await signOut(auth);

      profile = null;

      screen("login");

    } catch (error) {

      console.error(error);

      screen("login");

    }

  }

);


/* ======================================================
   START
   ====================================================== */

screen("login");
