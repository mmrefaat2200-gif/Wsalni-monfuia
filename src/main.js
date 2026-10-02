import "./style.css";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { initializeApp } from "firebase/app";

import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  signOut,
  deleteUser
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
  measurementId: "G-7K0MVY6F73"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);

setPersistence(auth, browserLocalPersistence).catch(console.error);


/* ======================================================
   VARIABLES
====================================================== */

let user = null;
let profile = null;

let map = null;
let pickupMarker = null;
let destMarker = null;
let routeLayer = null;
let accuracyCircle = null;

let watchRides = null;
let watchCustomer = null;
let watchCaptainAccepted = null;

let pickup = null;
let destination = null;


/* ======================================================
   HELPERS
====================================================== */

const $ = s => document.querySelector(s);

const esc = s =>
  String(s ?? "").replace(
    /[&<>"']/g,
    m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    }[m])
  );


/*
  توحيد رقم الموبايل المصري.

  مثال:

  01012345678
  201012345678
  +201012345678
  00 20 10 12345678

  كلهم يتحولوا إلى:

  +201012345678
*/

function phone(v) {

  v = String(v || "")
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


/*
  بنستخدم الرقم في حساب Firebase الداخلي.

  المستخدم مش بيشوف الإيميل ده.

  مثال:

  +201012345678

  يتحول إلى:

  201012345678@phone.wasselni.app
*/

function loginEmail(p) {

  return phone(p).replace(/\D/g, "") + "@phone.wasselni.app";

}


/*
  رقم حساب عشوائي للمستخدم
*/

function accountNo() {

  return String(
    Math.floor(
      10000000 +
      Math.random() * 90000000
    )
  );

}


/*
  رقم الموبايل بدون +.
  هنستخدمه كرقم مستند في phoneIndex
  علشان نضمن إن الرقم لا يتكرر.
*/

function phoneId(p) {

  return phone(p).replace(/\D/g, "");

}


/* ======================================================
   MESSAGE
====================================================== */

function msg(t, type = "info") {

  const e = $("#message");

  if (!e) return;

  e.textContent = t;

  e.className = `message-box ${type}`;

  e.style.display = "block";

  clearTimeout(window.__msg);

  window.__msg = setTimeout(() => {

    e.style.display = "none";

  }, 4500);

}


/* ======================================================
   SCREEN
====================================================== */

function screen(id) {

  document
    .querySelectorAll(".screen")
    .forEach(x => x.classList.remove("active"));

  $("#" + id)?.classList.add("active");

  if ($("#nav")) {

    $("#nav").style.display =
      ["login", "register"].includes(id)
        ? "none"
        : "flex";

  }

}


/* ======================================================
   STATUS
====================================================== */

function statusText(s) {

  return ({
    open: "بانتظار كابتن",
    accepted: "تم قبول الرحلة",
    captain_to_customer: "الكابتن في الطريق",
    arrived: "الكابتن وصل",
    started: "الرحلة بدأت",
    completed: "انتهت الرحلة",
    cancelled: "ملغاة"
  }[s] || s || "غير معروف");

}


/* ======================================================
   DATE
====================================================== */

function dayName(date) {

  if (!date) return "";

  return new Intl.DateTimeFormat(
    "ar-EG",
    {
      weekday: "long"
    }
  ).format(
    new Date(`${date}T12:00:00`)
  );

}


function formatDate(v) {

  if (!v) return "";

  return new Intl.DateTimeFormat(
    "ar-EG",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }
  ).format(
    new Date(`${v}T12:00:00`)
  );

}


/* ======================================================
   APP HTML
====================================================== */

$("#app").innerHTML = `

<div class="app">

<header class="header">

  <div class="logo">
    🚕 وصلني <span>المنوفية</span>
  </div>

  <button id="profileTop" class="icon-button">
    👤
  </button>

</header>


<div
  id="message"
  class="message-box"
  style="display:none"
></div>


<!-- ==================================================
     LOGIN
================================================== -->

<section id="login" class="screen active">

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
    >


    <label>
      🔐 كلمة المرور
    </label>

    <input
      id="loginPass"
      type="password"
      placeholder="كلمة المرور"
    >


    <button
      id="loginBtn"
      class="btn primary"
    >
      تسجيل الدخول
    </button>


    <button
      id="registerOpen"
      class="btn outline"
    >
      إنشاء حساب جديد
    </button>


    <div
      id="loginMsg"
      class="status"
    ></div>

  </div>

</section>


<!-- ==================================================
     REGISTER
================================================== -->

<section id="register" class="screen">

  <div class="auth-card">

    <button
      id="backLogin"
      class="back-btn"
    >
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
    >


    <label>
      📱 رقم الموبايل
    </label>

    <input
      id="regPhone"
      type="tel"
      inputmode="tel"
      placeholder="010xxxxxxxx"
    >


    <label>
      🔐 كلمة المرور
    </label>

    <input
      id="regPass"
      type="password"
      placeholder="6 أحرف أو أرقام على الأقل"
    >


    <label>
      🔐 تأكيد كلمة المرور
    </label>

    <input
      id="regPass2"
      type="password"
      placeholder="تأكيد كلمة المرور"
    >


    <div
      id="captainFields"
      style="display:none"
    >

      <label>
        🎂 السن
      </label>

      <input
        id="age"
        type="number"
        min="18"
        placeholder="السن"
      >


      <label>
        🚗 نوع العربية
      </label>

      <input
        id="carType"
        placeholder="سيدان / ميكروباص / نص نقل"
      >


      <label>
        🚘 موديل العربية
      </label>

      <input
        id="carModel"
        placeholder="مثال: لانسر 2018"
      >


      <label>
        🔢 رقم اللوحة
      </label>

      <input
        id="plate"
        placeholder="رقم اللوحة"
      >

    </div>


    <!--
      لم نعد نستخدم SMS أو reCAPTCHA.
    -->


    <button
      id="sendCode"
      class="btn primary"
    >
      إنشاء الحساب
    </button>


    <div
      id="regMsg"
      class="status"
    ></div>

  </div>

</section>


<!-- ==================================================
     HOME
================================================== -->

<section id="home" class="screen">

  <div class="hero">

    <h2>
      أهلاً بيك 👋
    </h2>

    <p>
      اطلب رحلتك وحدد كل التفاصيل.
    </p>

  </div>


  <div class="card">

    <label>
      📍 الانطلاق
    </label>

    <button
      id="myLocation"
      class="btn outline"
    >
      🎯 تحديد موقعي بدقة
    </button>

    <div
      id="pickupText"
      class="status"
    >
      لم يتم تحديد موقعك
    </div>

  </div>


  <div class="card">

    <label>
      🏁 الوصول
    </label>

    <button
      id="chooseDest"
      class="btn outline"
    >
      🗺️ تحديد مكان النزول على الخريطة
    </button>

    <div
      id="destText"
      class="status"
    >
      لم يتم تحديد مكان الوصول
    </div>

  </div>


  <div class="card">

    <label>
      📅 يوم الرحلة
    </label>

    <input
      id="rideDate"
      type="date"
    >

    <div
      id="dayPreview"
      class="status"
    ></div>


    <label>
      🕐 وقت الرحلة
    </label>

    <input
      id="rideTime"
      type="time"
    >


    <label>
      👥 عدد الركاب
    </label>

    <select id="passengers">

      ${Array.from(
        { length: 8 },
        (_, i) =>
          `<option value="${i + 1}">
            ${i + 1}
          </option>`
      ).join("")}

    </select>


    <label>
      💰 السعر المقترح
    </label>

    <input
      id="price"
      type="number"
      min="1"
      placeholder="مثال 150"
    >


    <label>
      📝 الرسالة / الملاحظات
    </label>

    <textarea
      id="notes"
      rows="3"
      placeholder="شنطة كبيرة، طفل، شارع ضيق، أي ملاحظة للكابتن..."
    ></textarea>


    <button
      id="request"
      class="btn primary"
    >
      🚕 نشر الرحلة للكباتن
    </button>

  </div>

</section>


<!-- ==================================================
     MAP
================================================== -->

<section id="mapScreen" class="screen">

  <div class="card">

    <div class="map-head">

      <div>

        <h2>
          🗺️ تحديد المكان
        </h2>

        <small>
          حرّك الخريطة حتى الدبوس فوق المكان المطلوب.
        </small>

      </div>


      <button
        id="closeMap"
        class="btn danger small-btn"
      >
        إلغاء
      </button>

    </div>


    <input
      id="search"
      placeholder="🔎 ابحث عن شارع، قرية، منزل أو مكان"
    >


    <div
      id="results"
      class="search-results"
    ></div>

  </div>


  <div class="map-wrapper">

    <div id="map"></div>

    <div class="map-center-pin">
      📍
    </div>

    <button
      id="mapLocation"
      class="map-control"
    >
      🎯
    </button>

  </div>


  <div class="card">

    <div
      id="address"
      class="status"
    >
      حدد المكان.
    </div>

    <div
      id="coords"
      class="coords"
    ></div>


    <button
      id="confirmDest"
      class="btn primary"
    >
      ✅ تأكيد المكان
    </button>

  </div>

</section>


<!-- ==================================================
     CUSTOMER RIDES
================================================== -->

<section id="rides" class="screen">

  <div class="hero">

    <h2>
      📋 رحلاتي
    </h2>

    <p>
      تابع الرحلة من النشر حتى الانتهاء.
    </p>

  </div>


  <div id="ridesList"></div>

</section>


<!-- ==================================================
     CAPTAIN
================================================== -->

<section id="captain" class="screen">

  <div class="hero">

    <h2>
      🚗 منصة الكابتن
    </h2>

    <p>
      فعّل حالتك وشوف الرحلات الجديدة.
    </p>

  </div>


  <div class="card captain-toggle">

    <button
      id="captainAvailable"
      class="btn green"
    >
      🟢 أنا متاح
    </button>


    <button
      id="captainUnavailable"
      class="btn outline"
    >
      ⚫ غير متاح
    </button>


    <div
      id="captainState"
      class="status"
    ></div>

  </div>


  <h3>
    📢 الرحلات الجديدة
  </h3>

  <div id="captainList"></div>


  <h3>
    🚕 رحلات قبلتها
  </h3>

  <div id="captainAcceptedList"></div>

</section>


<!-- ==================================================
     PROFILE
================================================== -->

<section id="profile" class="screen">

  <div class="card">

    <div class="avatar">
      👤
    </div>

    <h2>
      حسابي
    </h2>

    <div id="profileInfo"></div>


    <button
      id="logout"
      class="btn danger"
    >
      تسجيل الخروج
    </button>

  </div>

</section>


<!-- ==================================================
     NAV
================================================== -->

<nav
  id="nav"
  class="nav"
>

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

  const p =
    await Geolocation.checkPermissions();

  if (p.location !== "granted") {

    const r =
      await Geolocation.requestPermissions();

    if (r.location !== "granted") {

      throw Error("LOCATION_DENIED");

    }

  }


  const x =
    await Geolocation.getCurrentPosition({

      enableHighAccuracy: true,

      timeout: 20000,

      maximumAge: 0

    });


  return {

    lat: x.coords.latitude,

    lng: x.coords.longitude,

    accuracy: x.coords.accuracy

  };

}


/* ======================================================
   REVERSE GEOCODING
====================================================== */

async function reverse(lat, lng) {

  try {

    const r =
      await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=ar`
      );

    const d = await r.json();

    return (
      d.display_name ||
      `موقع ${lat.toFixed(6)}, ${lng.toFixed(6)}`
    );

  } catch {

    return `موقع ${lat.toFixed(6)}, ${lng.toFixed(6)}`;

  }

}


/* ======================================================
   MARKER
====================================================== */

function marker(type, p) {

  const icon =
    L.divIcon({

      className: "custom-marker",

      html: `
        <div class="${type}-marker">
          ${type === "pickup" ? "🚕" : "📍"}
        </div>
      `,

      iconSize: [48, 48],

      iconAnchor: [24, 42]

    });


  return L.marker(
    [p.lat, p.lng],
    {
      icon
    }
  ).addTo(map);

}


/* ======================================================
   MAP CENTER CHANGE
====================================================== */

async function centerChanged() {

  if (!map) return;

  const c = map.getCenter();

  destination = {
    lat: c.lat,
    lng: c.lng
  };


  if (destMarker) {

    destMarker.setLatLng(
      [c.lat, c.lng]
    );

  } else {

    destMarker =
      marker(
        "destination",
        destination
      );

  }


  $("#coords").textContent =
    `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}`;


  $("#address").textContent =
    "جاري تحديد العنوان...";


  $("#address").innerHTML =
    `
      🏁
      <strong>
        ${esc(
          await reverse(
            c.lat,
            c.lng
          )
        )}
      </strong>
    `;


  drawRoute();

}


/* ======================================================
   INIT MAP
====================================================== */

function initMap() {

  if (map) {

    setTimeout(
      () => map.invalidateSize(),
      200
    );

    return;

  }


  map =
    L.map("map", {
      zoomControl: false
    }).setView(

      pickup
        ? [pickup.lat, pickup.lng]
        : [30.5526, 31.0106],

      pickup
        ? 18
        : 13

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


    map.setView(
      [
        destination.lat,
        destination.lng
      ],
      19
    );

  }

}


/* ======================================================
   PICKUP
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

      pickupMarker.setLatLng(
        [p.lat, p.lng]
      );

    } else if (map) {

      pickupMarker =
        marker(
          "pickup",
          pickup
        );

    }


    if (
      accuracyCircle &&
      map
    ) {

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


    const a =
      await reverse(
        p.lat,
        p.lng
      );


    $("#pickupText").innerHTML =
      `
        📍
        <strong>
          ${esc(a)}
        </strong>
        <br>
        <small>
          دقة GPS تقريباً
          ${Math.round(p.accuracy)}
          متر
        </small>
      `;


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


  } catch (e) {

    console.error(e);

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

  if (
    !pickup ||
    !destination ||
    !map
  ) {

    return;

  }


  try {

    const u =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${pickup.lng},${pickup.lat};` +
      `${destination.lng},${destination.lat}` +
      `?overview=full&geometries=geojson`;


    const d =
      await (
        await fetch(u)
      ).json();


    if (!d.routes?.length) return;


    if (routeLayer) {

      routeLayer.remove();

    }


    routeLayer =
      L.geoJSON(
        d.routes[0].geometry,
        {
          style: {
            weight: 6,
            opacity: 0.85
          }
        }
      ).addTo(map);


  } catch (e) {

    console.error(e);

  }

}


/* ======================================================
   SEARCH PLACES
====================================================== */

async function searchPlaces(q) {

  const box =
    $("#results");


  if (q.length < 3) {

    box.innerHTML = "";

    return;

  }


  box.innerHTML =
    "<div class='status'>🔎 جاري البحث...</div>";


  try {

    const u =
      `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q + ", Egypt")}&limit=8&addressdetails=1&accept-language=ar&countrycodes=eg`;


    const d =
      await (
        await fetch(u)
      ).json();


    box.innerHTML =
      d.length

        ? d.map(
            x =>
              `
              <button
                class="search-result"
                data-lat="${x.lat}"
                data-lon="${x.lon}"
                data-name="${esc(x.display_name)}"
              >
                📍
                ${esc(x.display_name)}
              </button>
              `
          ).join("")

        : "<div class='status'>لا توجد نتائج.</div>";


    box
      .querySelectorAll(
        ".search-result"
      )
      .forEach(b => {

        b.onclick = () => {

          destination = {
            lat: Number(
              b.dataset.lat
            ),

            lng: Number(
              b.dataset.lon
            )
          };


          map.setView(
            [
              destination.lat,
              destination.lng
            ],
            19
          );


          $("#search").value =
            b.dataset.name;


          box.innerHTML = "";

        };

      });


  } catch {

    box.innerHTML =
      "<div class='status'>تعذر البحث.</div>";

  }

}


/* ======================================================
   BUTTONS
====================================================== */

$("#myLocation").onclick =
  async () => {

    await setPickup();

  };


$("#mapLocation").onclick =
  setPickup;


$("#chooseDest").onclick =
  () => {

    screen("mapScreen");

    setTimeout(
      () => {

        initMap();

        map.invalidateSize();

      },
      150
    );

  };


$("#closeMap").onclick =
  () => screen("home");


$("#confirmDest").onclick =
  async () => {

    if (!destination) {

      msg(
        "حدد مكان الوصول أولاً",
        "error"
      );

      return;

    }


    $("#destText").innerHTML =
      `
        🏁
        <strong>
          ${esc(
            await reverse(
              destination.lat,
              destination.lng
            )
          )}
        </strong>
      `;


    screen("home");


    msg(
      "تم تحديد مكان الوصول بدقة ✅",
      "success"
    );

  };


let st;


$("#search").oninput =
  () => {

    clearTimeout(st);

    st =
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


$("#rideDate").onchange =
  () => {

    $("#dayPreview").textContent =
      dayName(
        $("#rideDate").value
      )
        ? `📆 ${dayName(
            $("#rideDate").value
          )}`
        : "";

  };


/* ======================================================
   REQUEST RIDE
====================================================== */

$("#request").onclick =
  async () => {

    if (!user) {

      screen("login");

      return;

    }


    if (profile?.role !== "customer") {

      msg(
        "حساب الكابتن لا يطلب رحلة.",
        "error"
      );

      return;

    }


    if (
      !pickup ||
      !destination
    ) {

      msg(
        "حدد الانطلاق والوصول أولاً.",
        "error"
      );

      return;

    }


    const price =
      Number(
        $("#price").value
      );


    const date =
      $("#rideDate").value;


    const time =
      $("#rideTime").value;


    if (
      !price ||
      !date ||
      !time
    ) {

      msg(
        "اكتب السعر والتاريخ والوقت.",
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


      const r =
        await addDoc(
          collection(
            db,
            "rides"
          ),
          {

            customerId:
              user.uid,

            customerName:
              profile.name || "",

            fromPlace,

            toPlace,

            pickupCoords:
              pickup,

            destinationCoords:
              destination,

            price,

            passengers:
              Number(
                $("#passengers").value
              ),

            notes:
              $("#notes")
                .value
                .trim(),

            rideDate:
              date,

            rideTime:
              time,

            dayName:
              dayName(date),

            status:
              "open",

            captainId:
              "",

            createdAt:
              serverTimestamp()

          }
        );


      localStorage.setItem(
        "lastRide",
        r.id
      );


      $("#price").value = "";

      $("#notes").value = "";


      msg(
        "تم نشر الرحلة للكباتن 🚕",
        "success"
      );


      screen("rides");


      loadCustomerRides();


    } catch (e) {

      console.error(e);

      msg(
        "تعذر إرسال الرحلة.",
        "error"
      );

    }

  };


/* ======================================================
   ROLE
====================================================== */

$("#role").onchange =
  () => {

    $("#captainFields").style.display =
      $("#role").value === "captain"
        ? "block"
        : "none";

  };


/* ======================================================
   REGISTER PAGE
====================================================== */

$("#registerOpen").onclick =
  () => {

    screen("register");

  };


$("#backLogin").onclick =
  () => {

    screen("login");

  };


/* ======================================================
   REGISTER ACCOUNT
====================================================== */

/*
  هنا التعديل المهم:

  التسجيل أصبح:

  رقم الموبايل
  +
  كلمة المرور

  بدون:

  SMS
  OTP
  reCAPTCHA

  ويتم إنشاء الحساب في Firebase باستخدام
  إيميل داخلي مخفي مبني على رقم الموبايل.

  وبعد ذلك بنعمل phoneIndex في Firestore
  علشان نمنع استخدام نفس الرقم مرة ثانية.
*/

$("#sendCode").onclick =
  async () => {

    const name =
      $("#name")
        .value
        .trim();


    const p =
      phone(
        $("#regPhone").value
      );


    const pass =
      $("#regPass").value;


    const pass2 =
      $("#regPass2").value;


    const role =
      $("#role").value;


    /*
      التحقق من البيانات
    */

    if (!name) {

      $("#regMsg").textContent =
        "اكتب الاسم بالكامل.";

      return;

    }


    if (
      !/^\+20\d{10}$/.test(p)
    ) {

      $("#regMsg").textContent =
        "اكتب رقم موبايل مصري صحيح مثل 01012345678.";

      return;

    }


    if (pass.length < 6) {

      $("#regMsg").textContent =
        "كلمة المرور لازم تكون 6 أحرف أو أرقام على الأقل.";

      return;

    }


    if (pass !== pass2) {

      $("#regMsg").textContent =
        "كلمة المرور وتأكيدها غير متطابقين.";

      return;

    }


    /*
      بيانات الكابتن
    */

    if (
      role === "captain" &&
      (
        !$("#age").value ||
        Number($("#age").value) < 18 ||
        !$("#carType").value.trim() ||
        !$("#carModel").value.trim() ||
        !$("#plate").value.trim()
      )
    ) {

      $("#regMsg").textContent =
        "أكمل بيانات الكابتن.";

      return;

    }


    const btn =
      $("#sendCode");


    btn.disabled = true;

    btn.textContent =
      "جاري إنشاء الحساب...";


    try {

      /*
        الرقم الموحد
      */

      const normalizedPhone =
        phone(p);


      /*
        رقم المستند في phoneIndex
      */

      const pId =
        phoneId(
          normalizedPhone
        );


      /*
        الإيميل الداخلي المخفي
      */

      const email =
        loginEmail(
          normalizedPhone
        );


      /*
        أول خطوة:
        إنشاء حساب Firebase.
      */

      const cred =
        await createUserWithEmailAndPassword(
          auth,
          email,
          pass
        );


      const newUser =
        cred.user;


      /*
        ثاني خطوة:
        نعمل حجز للرقم في Firestore.

        phoneIndex
        ----------------
        201012345678

        uid
        phone
        createdAt

        لو المستند موجود بالفعل:
        يبقى الرقم مستخدم قبل كده.
      */

      let phoneReserved = false;


      try {

        await runTransaction(
          db,
          async transaction => {

            const phoneRef =
              doc(
                db,
                "phoneIndex",
                pId
              );


            const phoneSnap =
              await transaction.get(
                phoneRef
              );


            if (phoneSnap.exists()) {

              throw new Error(
                "PHONE_ALREADY_USED"
              );

            }


            transaction.set(
              phoneRef,
              {

                uid:
                  newUser.uid,

                phone:
                  normalizedPhone,

                createdAt:
                  serverTimestamp()

              }
            );


            phoneReserved = true;

          }
        );


      } catch (e) {

        /*
          لو الرقم موجود بالفعل
          نمسح حساب Firebase الجديد
          اللي اتعمل من ثواني.

          كده الرقم لا يتكرر.
        */

        try {

          await deleteUser(
            newUser
          );

        } catch (deleteError) {

          console.error(
            "Delete temporary user error:",
            deleteError
          );

        }


        if (
          e.message ===
          "PHONE_ALREADY_USED"
        ) {

          throw new Error(
            "الرقم ده مسجل بالفعل. استخدم تسجيل الدخول."
          );

        }


        throw e;

      }


      /*
        بيانات الحساب
      */

      const data = {

        uid:
          newUser.uid,

        name,

        phone:
          normalizedPhone,

        role,

        accountNumber:
          accountNo(),

        createdAt:
          serverTimestamp(),

        rating:
          0,

        ratingCount:
          0

      };


      /*
        لو كابتن
      */

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


        data.captainStatus =
          "available";


        data.rating =
          0;


        data.ratingCount =
          0;

      }


      /*
        إنشاء بروفايل المستخدم
      */

      await setDoc(
        doc(
          db,
          "users",
          newUser.uid
        ),
        data,
        {
          merge: true
        }
      );


      /*
        تحديث الحالة المحلية
      */

      profile =
        data;


      user =
        newUser;


      /*
        رسالة نجاح
      */

      $("#regMsg").textContent =
        "تم إنشاء الحساب بنجاح ✅";


      msg(
        "تم إنشاء الحساب وتسجيل الدخول ✅",
        "success"
      );


      /*
        ندخل المستخدم حسب نوعه
      */

      if (
        role === "captain"
      ) {

        screen("captain");

        loadCaptain();

      } else {

        screen("home");

        loadCustomerRides();

      }


    } catch (e) {

      console.error(e);


      /*
        الرقم موجود بالفعل
      */

      if (
        e.message ===
        "PHONE_ALREADY_USED"
      ) {

        $("#regMsg").textContent =
          "الرقم ده مسجل بالفعل. استخدم تسجيل الدخول.";

      }

      /*
        Firebase نفسه قال إن الإيميل الداخلي مستخدم
      */

      else if (
        e.code ===
        "auth/email-already-in-use"
      ) {

        $("#regMsg").textContent =
          "الرقم ده مسجل بالفعل. استخدم تسجيل الدخول.";

      }

      /*
        كلمة المرور ضعيفة
      */

      else if (
        e.code ===
        "auth/weak-password"
      ) {

        $("#regMsg").textContent =
          "كلمة المرور لازم تكون 6 أحرف أو أرقام على الأقل.";

      }

      /*
        بيانات غير صحيحة
      */

      else if (
        e.code ===
        "auth/invalid-email"
      ) {

        $("#regMsg").textContent =
          "رقم الموبايل غير صحيح.";

      }

      else {

        $("#regMsg").textContent =
          e.message ||
          "تعذر إنشاء الحساب.";

      }


    } finally {

      btn.disabled = false;

      btn.textContent =
        "إنشاء الحساب";

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
      !/^\+20\d{10}$/.test(p) ||
      !pass
    ) {

      $("#loginMsg").textContent =
        "اكتب رقم موبايل مصري صحيح وكلمة المرور.";

      return;

    }


    const btn =
      $("#loginBtn");


    btn.disabled = true;

    btn.textContent =
      "جاري تسجيل الدخول...";


    try {

      await signInWithEmailAndPassword(
        auth,
        loginEmail(p),
        pass
      );


      $("#loginMsg").textContent =
        "";


    } catch (e) {

      console.error(e);

      $("#loginMsg").textContent =
        "رقم الموبايل أو كلمة المرور غير صحيحة.";


    } finally {

      btn.disabled = false;

      btn.textContent =
        "تسجيل الدخول";

    }

  };


/* ======================================================
   PROFILE
====================================================== */

async function loadProfile() {

  if (!user) return;


  const s =
    await getDoc(
      doc(
        db,
        "users",
        user.uid
      )
    );


  if (s.exists()) {

    profile =
      s.data();

  }


  if (!profile) return;


  $("#profileInfo").innerHTML =
    `

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
        النوع
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
              🚘 العربية
            </span>

            <strong>
              ${esc(profile.carType)}
              ${esc(profile.carModel)}
              -
              ${esc(profile.plateNumber)}
            </strong>

          </div>


          <div class="profile-row">

            <span>
              ⭐ التقييم
            </span>

            <strong>
              ${Number(
                profile.rating || 0
              ).toFixed(1)}

              (
              ${profile.ratingCount || 0}
              )
            </strong>

          </div>

        `

        : ""

    }

    `;

}


/* ======================================================
   CUSTOMER RIDE CARD
====================================================== */

function customerCard(r) {

  let contact = "";


  if (
    r.status === "accepted" ||
    r.status === "captain_to_customer" ||
    r.status === "arrived" ||
    r.status === "started" ||
    r.status === "completed"
  ) {

    contact =
      r.captainPhone

        ? `

          <div class="contact-box">

            📞

            <a
              href="tel:${esc(r.captainPhone)}"
            >
              ${esc(r.captainPhone)}
            </a>

            —

            ${esc(
              r.captainName ||
              "الكابتن"
            )}

          </div>

        `

        : "";

  }


  return `

    <div class="card">

      <div class="ride-status">
        ${statusText(r.status)}
      </div>


      <b>
        📍
        ${esc(r.fromPlace)}
      </b>

      <br>

      🏁
      ${esc(r.toPlace)}


      <p>
        💰
        ${r.price}
        جنيه

        •
        
        👥
        ${r.passengers}
      </p>


      <p>
        📅
        ${formatDate(r.rideDate)}

        •
        
        ${esc(r.dayName)}

        •

        🕐
        ${esc(r.rideTime)}
      </p>


      ${
        r.notes
          ? `
            <p>
              📝
              ${esc(r.notes)}
            </p>
          `
          : ""
      }


      ${contact}


      ${
        r.status === "accepted"

          ? `

            <button
              class="btn outline"
              data-start-customer="${r.id}"
            >
              📞 الكابتن قبل الرحلة
            </button>

          `

          : ""
      }


      ${
        r.status === "started"

          ? `

            <button
              class="btn green"
              data-complete-customer="${r.id}"
            >
              ✅ انتهت الرحلة
            </button>

          `

          : ""
      }

    </div>

  `;

}


/* ======================================================
   CUSTOMER RIDES
====================================================== */

async function loadCustomerRides() {

  if (
    !user ||
    profile?.role !== "customer"
  ) {

    return;

  }


  if (watchCustomer) {

    watchCustomer();

  }


  watchCustomer =
    onSnapshot(

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

        limit(50)
      ),

      async s => {

        const a =
          s.docs
            .map(
              x => ({
                id: x.id,
                ...x.data()
              })
            )
            .sort(
              (a, b) =>
                (b.createdAt?.seconds || 0) -
                (a.createdAt?.seconds || 0)
            );


        $("#ridesList").innerHTML =
          a.length

            ? a
                .map(
                  customerCard
                )
                .join("")

            : `
              <div class="card">
                لا توجد رحلات حتى الآن.
              </div>
            `;


        document
          .querySelectorAll(
            "[data-complete-customer]"
          )
          .forEach(b => {

            b.onclick =
              () =>
                updateDoc(
                  doc(
                    db,
                    "rides",
                    b.dataset
                      .completeCustomer
                  ),
                  {
                    status:
                      "completed",

                    completedAt:
                      serverTimestamp()
                  }
                );

          });

      }

    );

}


/* ======================================================
   CAPTAIN
====================================================== */

async function loadCaptain() {

  if (
    profile?.role !== "captain"
  ) {

    $("#captainList").innerHTML =
      `
        <div class='card'>
          هذه الصفحة للكابتن فقط.
        </div>
      `;

    return;

  }


  $("#captainState").textContent =
    profile.captainStatus ===
    "available"

      ? "🟢 أنت متاح لاستقبال الرحلات"

      : "⚫ أنت غير متاح";


  if (watchRides) {

    watchRides();

  }


  watchRides =
    onSnapshot(

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
      ),

      s => {

        $("#captainList").innerHTML =

          profile.captainStatus ===
            "available" &&
          s.docs.length

            ?

            s.docs
              .map(
                d => {

                  const r =
                    d.data();


                  return `

                    <div class="card">

                      <div class="ride-status">
                        🆕 رحلة جديدة
                      </div>


                      <b>
                        📍
                        ${esc(r.fromPlace)}
                      </b>

                      <br>

                      🏁
                      ${esc(r.toPlace)}


                      <p>
                        💰
                        ${r.price}
                        جنيه

                        •

                        👥
                        ${r.passengers}
                      </p>


                      <p>
                        📅
                        ${formatDate(r.rideDate)}

                        •

                        ${esc(r.dayName)}

                        •

                        🕐
                        ${esc(r.rideTime)}
                      </p>


                      ${
                        r.notes

                          ? `

                            <p>
                              📝
                              ${esc(r.notes)}
                            </p>

                          `

                          : ""
                      }


                      <button
                        class="btn green"
                        data-accept="${d.id}"
                      >
                        ✅ قبول الرحلة
                      </button>

                    </div>

                  `;

                }
              )
              .join("")

            :

            `

              <div class='card'>
                لا توجد رحلات متاحة الآن.
              </div>

            `;


        document
          .querySelectorAll(
            "[data-accept]"
          )
          .forEach(
            b =>
              b.onclick =
                () =>
                  acceptRide(
                    b.dataset.accept
                  )
          );

      }

    );


  if (watchCaptainAccepted) {

    watchCaptainAccepted();

  }


  watchCaptainAccepted =
    onSnapshot(

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

        limit(30)
      ),

      s => {

        $("#captainAcceptedList").innerHTML =

          s.docs.length

            ?

            s.docs
              .map(
                d => {

                  const r =
                    d.data();


                  return `

                    <div class="card">

                      <div class="ride-status">
                        ${statusText(r.status)}
                      </div>


                      <b>
                        📍
                        ${esc(r.fromPlace)}
                      </b>

                      <br>

                      🏁
                      ${esc(r.toPlace)}


                      <p>
                        💰
                        ${r.price}
                        جنيه

                        •

                        👥
                        ${r.passengers}
                      </p>


                      <p>
                        📅
                        ${formatDate(r.rideDate)}

                        •

                        ${esc(r.dayName)}

                        •

                        🕐
                        ${esc(r.rideTime)}
                      </p>


                      ${
                        r.notes

                          ? `

                            <p>
                              📝
                              ${esc(r.notes)}
                            </p>

                          `

                          : ""
                      }


                      ${
                        r.customerPhone

                          ? `

                            <div class="contact-box">

                              📞

                              <a
                                href="tel:${esc(
                                  r.customerPhone
                                )}"
                              >
                                ${esc(
                                  r.customerPhone
                                )}
                              </a>

                              —

                              ${esc(
                                r.customerName ||
                                "العميل"
                              )}

                            </div>

                          `

                          : ""
                      }


                      ${
                        r.status === "accepted"

                          ? `

                            <button
                              class="btn primary"
                              data-customer-route="${d.id}"
                            >
                              🚗 أنا في الطريق للعميل
                            </button>

                          `

                          : ""
                      }


                      ${
                        r.status === "captain_to_customer"

                          ? `

                            <button
                              class="btn green"
                              data-arrived="${d.id}"
                            >
                              📍 وصلت للعميل
                            </button>

                          `

                          : ""
                      }


                      ${
                        r.status === "arrived"

                          ? `

                            <button
                              class="btn primary"
                              data-start="${d.id}"
                            >
                              ▶️ بدء الرحلة
                            </button>

                          `

                          : ""
                      }


                      ${
                        r.status === "started"

                          ? `

                            <button
                              class="btn green"
                              data-complete="${d.id}"
                            >
                              🏁 إنهاء الرحلة
                            </button>

                          `

                          : ""
                      }

                    </div>

                  `;

                }
              )
              .join("")

            :

            `

              <div class='card'>
                لا توجد رحلات قبلتها.
              </div>

            `;


        bindCaptainActions();

      }

    );

}


/* ======================================================
   CAPTAIN ACTIONS
====================================================== */

function bindCaptainActions() {

  document
    .querySelectorAll(
      "[data-customer-route]"
    )
    .forEach(
      b =>
        b.onclick =
          () =>
            updateDoc(
              doc(
                db,
                "rides",
                b.dataset
                  .customerRoute
              ),
              {
                status:
                  "captain_to_customer",

                updatedAt:
                  serverTimestamp()
              }
            )
    );


  document
    .querySelectorAll(
      "[data-arrived]"
    )
    .forEach(
      b =>
        b.onclick =
          () =>
            updateDoc(
              doc(
                db,
                "rides",
                b.dataset.arrived
              ),
              {
                status:
                  "arrived",

                updatedAt:
                  serverTimestamp()
              }
            )
    );


  document
    .querySelectorAll(
      "[data-start]"
    )
    .forEach(
      b =>
        b.onclick =
          () =>
            updateDoc(
              doc(
                db,
                "rides",
                b.dataset.start
              ),
              {
                status:
                  "started",

                startedAt:
                  serverTimestamp()
              }
            )
    );


  document
    .querySelectorAll(
      "[data-complete]"
    )
    .forEach(
      b =>
        b.onclick =
          () =>
            updateDoc(
              doc(
                db,
                "rides",
                b.dataset.complete
              ),
              {
                status:
                  "completed",

                completedAt:
                  serverTimestamp()
              }
            )
    );

}


/* ======================================================
   ACCEPT RIDE
====================================================== */

async function acceptRide(id) {

  if (
    !user ||
    profile?.role !== "captain"
  ) {

    return;

  }


  try {

    await runTransaction(
      db,
      async tx => {

        const ref =
          doc(
            db,
            "rides",
            id
          );


        const snap =
          await tx.get(
            ref
          );


        if (
          !snap.exists() ||
          snap.data().status !== "open"
        ) {

          throw Error(
            "الرحلة اتقبلت بالفعل"
          );

        }


        tx.update(
          ref,
          {

            status:
              "accepted",

            captainId:
              user.uid,

            captainName:
              profile.name || "",

            captainPhone:
              profile.phone ||
              user.phoneNumber ||
              "",

            customerPhone:
              snap.data().customerPhone ||
              "",

            acceptedAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp()

          }
        );

      }
    );


    msg(
      "تم قبول الرحلة. رقم العميل ظهر لك 📞",
      "success"
    );


    loadCaptain();


  } catch (e) {

    console.error(e);

    msg(
      e.message ||
      "تعذر قبول الرحلة",
      "error"
    );

  }

}


/* ======================================================
   CAPTAIN AVAILABLE
====================================================== */

$("#captainAvailable").onclick =
  async () => {

    if (
      profile?.role !== "captain"
    ) {

      return;

    }


    await updateDoc(
      doc(
        db,
        "users",
        user.uid
      ),
      {
        captainStatus:
          "available"
      }
    );


    profile.captainStatus =
      "available";


    loadCaptain();

  };


/* ======================================================
   CAPTAIN UNAVAILABLE
====================================================== */

$("#captainUnavailable").onclick =
  async () => {

    if (
      profile?.role !== "captain"
    ) {

      return;

    }


    await updateDoc(
      doc(
        db,
        "users",
        user.uid
      ),
      {
        captainStatus:
          "unavailable"
      }
    );


    profile.captainStatus =
      "unavailable";


    loadCaptain();

  };


/* ======================================================
   NAVIGATION
====================================================== */

$("#navHome").onclick =
  () => {

    if (
      profile?.role === "captain"
    ) {

      screen("captain");

    } else {

      screen("home");

    }

  };


$("#navRides").onclick =
  () => {

    if (
      profile?.role !== "customer"
    ) {

      msg(
        "رحلاتي هنا للعميل.",
        "error"
      );

      return;

    }


    screen("rides");

    loadCustomerRides();

  };


$("#navCaptain").onclick =
  () => {

    if (
      profile?.role !== "captain"
    ) {

      msg(
        "صفحة الكابتن للحسابات المسجلة ككابتن فقط.",
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

    if (watchRides) {

      watchRides();

      watchRides = null;

    }


    if (watchCustomer) {

      watchCustomer();

      watchCustomer = null;

    }


    if (watchCaptainAccepted) {

      watchCaptainAccepted();

      watchCaptainAccepted = null;

    }


    await signOut(auth);


    user = null;

    profile = null;


    screen("login");

  };


/* ======================================================
   AUTH STATE
====================================================== */

onAuthStateChanged(
  auth,
  async u => {

    user = u;


    if (!u) {

      profile = null;

      screen("login");

      return;

    }


    await loadProfile();


    if (
      profile?.role === "captain"
    ) {

      screen("captain");

      loadCaptain();

    }

    else if (
      profile?.role === "customer"
    ) {

      screen("home");

      loadCustomerRides();

    }

    else {

      await signOut(auth);

      screen("login");

    }

  }
);


/* ======================================================
   START
====================================================== */

screen("login");
