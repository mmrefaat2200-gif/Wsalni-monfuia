import "./style.css";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { initializeApp } from "firebase/app";

import {
  getAuth,
  onAuthStateChanged,
  signInWithPhoneNumber,
  signInWithEmailAndPassword,
  signOut,
  RecaptchaVerifier,
  EmailAuthProvider,
  linkWithCredential,
  setPersistence,
  browserLocalPersistence,
  updateProfile
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
  onSnapshot,
  serverTimestamp,
  limit
} from "firebase/firestore";


// ======================================================
// FIREBASE
// ======================================================

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


// ======================================================
// VARIABLES
// ======================================================

let confirmationResult = null;
let recaptchaVerifier = null;

let map = null;
let routeLayer = null;
let fromMarker = null;
let toMarker = null;

let fromPlace = null;
let toPlace = null;

let currentRole = "customer";

let unsubscribeOffers = null;
let unsubscribeCaptainRides = null;
let unsubscribeTrip = null;


// ======================================================
// HELPERS
// ======================================================

const $ = (selector) => document.querySelector(selector);

const money = (number) =>
  `${Number(number || 0).toLocaleString("ar-EG")} جنيه`;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


// ======================================================
// ACCOUNT NUMBER
// ======================================================

function generateAccountNumber() {
  return String(Math.floor(10000000 + Math.random() * 90000000));
}

function accountEmail(accountNumber) {
  return `${accountNumber}@wasselni.app`;
}


// ======================================================
// UI
// ======================================================

document.querySelector("#app").innerHTML = `

<header>
  <div class="logo">
    وصلني <span>المنوفية</span>
  </div>

  <div id="authMini">🔒</div>
</header>


<!-- ==================================================
     LOGIN
================================================== -->

<section id="auth" class="screen">

  <div class="hero">
    <h2>أهلاً بيك في وصلني المنوفية 👋</h2>
    <p>سجل دخولك برقم الحساب وكلمة المرور.</p>
  </div>

  <div class="card">

    <label>🔢 رقم الحساب</label>

    <input
      id="loginAccount"
      inputmode="numeric"
      placeholder="مثال: 12345678"
    >

    <label>🔐 كلمة المرور</label>

    <input
      id="loginPassword"
      type="password"
      placeholder="اكتب كلمة المرور"
    >

    <button class="btn primary" id="loginAccountBtn">
      تسجيل الدخول
    </button>

    <div id="loginMsg"></div>

  </div>


  <div class="card register-card">

    <h3>لسه معندكش حساب؟</h3>

    <p class="muted">
      اعمل حساب جديد كعميل أو كابتن.
    </p>

    <button class="btn outline" id="openRegisterBtn">
      إنشاء حساب جديد
    </button>

  </div>

</section>


<!-- ==================================================
     REGISTER
================================================== -->

<section id="register" class="screen hidden">

  <h2>إنشاء حساب جديد 📝</h2>

  <div class="card">

    <label>نوع الحساب</label>

    <select id="registerRole">
      <option value="customer">👤 عميل</option>
      <option value="captain">🚕 كابتن</option>
    </select>


    <label>الاسم</label>

    <input
      id="registerName"
      placeholder="اكتب اسمك"
    >


    <label>رقم الموبايل</label>

    <input
      id="registerPhone"
      type="tel"
      inputmode="tel"
      placeholder="010xxxxxxxx"
    >


    <div id="captainFields" class="hidden">

      <label>العمر</label>

      <input
        id="registerAge"
        type="number"
        min="18"
        max="80"
        placeholder="مثال: 30"
      >


      <label>نوع العربية</label>

      <select id="registerCarType">
        <option value="">اختر نوع العربية</option>
        <option value="ملاكي">ملاكي</option>
        <option value="ميكروباص">ميكروباص</option>
        <option value="نقل">نقل</option>
        <option value="دبابة">دبابة</option>
        <option value="أخرى">أخرى</option>
      </select>


      <label>موديل العربية</label>

      <input
        id="registerCarModel"
        placeholder="مثال: تويوتا كورولا 2022"
      >


      <label>رقم اللوحة</label>

      <input
        id="registerPlate"
        placeholder="مثال: م ن 1234"
      >

    </div>


    <label>🔐 كلمة المرور</label>

    <input
      id="registerPassword"
      type="password"
      placeholder="6 أحرف أو أرقام على الأقل"
    >


    <label>🔐 تأكيد كلمة المرور</label>

    <input
      id="registerPassword2"
      type="password"
      placeholder="أعد كتابة كلمة المرور"
    >


    <button class="btn primary" id="sendRegisterOtp">
      إرسال كود التحقق
    </button>


    <div id="registerRecaptcha"></div>


    <div id="registerOtpBox" class="hidden">

      <label>📩 كود التحقق</label>

      <input
        id="registerOtp"
        inputmode="numeric"
        maxlength="6"
        placeholder="اكتب الكود"
      >

      <button class="btn green" id="verifyRegisterOtp">
        تأكيد وإنشاء الحساب
      </button>

    </div>


    <div id="registerMsg"></div>


    <button class="btn outline" id="backToLogin">
      رجوع لتسجيل الدخول
    </button>

  </div>

</section>


<!-- ==================================================
     HOME
================================================== -->

<section id="home" class="screen hidden">

  <div class="hero">
    <h2>مشوارك يبدأ من هنا 🚕</h2>
    <p>
      اطلب رحلتك وحدد السعر وسيب الكباتن يقدموا عروضهم.
    </p>
  </div>


  <div class="card">

    <div class="map">
      <div id="map"></div>
    </div>


    <label>📍 مكان الركوب</label>

    <input
      id="from"
      placeholder="اكتب مكان الركوب"
    >


    <label>📍 مكان الوصول</label>

    <input
      id="to"
      placeholder="اكتب مكان الوصول"
    >


    <div class="row">

      <div>

        <label>💰 السعر المقترح</label>

        <input
          id="price"
          type="number"
          min="1"
          placeholder="مثال 500"
        >

      </div>


      <div>

        <label>👥 عدد الركاب</label>

        <input
          id="passengers"
          type="number"
          min="1"
          max="20"
          value="1"
        >

      </div>

    </div>


    <label>📝 ملاحظات للسائق</label>

    <input
      id="notes"
      placeholder="مثال: شنطة كبيرة"
    >


    <button class="btn primary" id="requestBtn">
      🚕 اطلب الرحلة
    </button>

  </div>


  <button class="btn outline" id="myRidesBtn">
    رحلتي الحالية
  </button>

</section>


<!-- ==================================================
     OFFERS
================================================== -->

<section id="offers" class="screen hidden">

  <h2>عروض الكباتن 🚕</h2>

  <div id="offersList"></div>

</section>


<!-- ==================================================
     CAPTAIN
================================================== -->

<section id="captain" class="screen hidden">

  <h2>لوحة الكابتن 👨‍✈️</h2>


  <div class="card switch">

    <b>متاح للرحلات</b>

    <input
      id="captainAvailable"
      type="checkbox"
      checked
      style="width:auto"
    >

  </div>


  <div id="captainRides"></div>

</section>


<!-- ==================================================
     TRIP
================================================== -->

<section id="trip" class="screen hidden">

  <h2>الرحلة الحالية 🚕</h2>

  <div id="tripBox"></div>

</section>


<!-- ==================================================
     PROFILE
================================================== -->

<section id="profile" class="screen hidden">

  <h2>حسابي 👤</h2>


  <div class="card" style="text-align:center">

    <div class="avatar">👤</div>

    <h3 id="profileName">مستخدم</h3>

    <div id="profilePhone" class="muted">
      —
    </div>

    <div id="profileAccount" class="muted">
      رقم الحساب: —
    </div>

  </div>


  <div class="card">

    <label>الاسم</label>

    <input id="profileNameInput">


    <label>الدور</label>

    <select id="profileRole">
      <option value="customer">عميل</option>
      <option value="captain">كابتن</option>
    </select>


    <label>نوع السيارة</label>

    <input
      id="carType"
      placeholder="ملاكي"
    >


    <label>موديل السيارة</label>

    <input
      id="carModel"
      placeholder="تويوتا كورولا"
    >


    <label>رقم اللوحة</label>

    <input
      id="plate"
      placeholder="م ن 1234"
    >


    <label>العمر</label>

    <input
      id="profileAge"
      type="number"
    >


    <button class="btn primary" id="saveProfile">
      حفظ البيانات
    </button>


    <button class="btn danger" id="logoutBtn">
      تسجيل الخروج
    </button>

  </div>

</section>


<!-- ==================================================
     NAV
================================================== -->

<nav class="nav hidden" id="appNav">

  <button class="active" data-screen="home">
    🏠<br>
    الرئيسية
  </button>

  <button data-screen="offers">
    🚕<br>
    الرحلات
  </button>

  <button data-screen="captain">
    👨‍✈️<br>
    الكابتن
  </button>

  <button data-screen="profile">
    👤<br>
    حسابي
  </button>

</nav>
`;


// ======================================================
// SHOW SCREEN
// ======================================================

function show(id) {

  if (!auth.currentUser && id !== "auth" && id !== "register") {
    id = "auth";
  }

  document
    .querySelectorAll("section.screen")
    .forEach((section) => {
      section.classList.add("hidden");
    });

  const target = $("#" + id);

  if (target) {
    target.classList.remove("hidden");
  }

  document
    .querySelectorAll(".nav button")
    .forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.screen === id
      );
    });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });


  if (id === "offers") {
    loadCustomerOffers();
  }

  if (id === "captain") {
    loadCaptainRides();
  }

  if (id === "trip") {
    const rideId = localStorage.getItem("activeRide");

    if (rideId) {
      listenTrip(rideId);
    }
  }
}


// ======================================================
// NAVIGATION
// ======================================================

document
  .querySelectorAll(".nav button")
  .forEach((button) => {

    button.onclick = () => {

      if (!auth.currentUser) {
        show("auth");
        return;
      }

      show(button.dataset.screen);
    };

  });


$("#openRegisterBtn").onclick = () => {
  show("register");
};


$("#backToLogin").onclick = () => {
  show("auth");
};


// ======================================================
// ROLE SWITCH
// ======================================================

$("#registerRole").onchange = () => {

  const role = $("#registerRole").value;

  if (role === "captain") {
    $("#captainFields").classList.remove("hidden");
  } else {
    $("#captainFields").classList.add("hidden");
  }

};


// ======================================================
// PHONE NORMALIZATION
// ======================================================

function normalizeEgyptPhone(phone) {

  let value = String(phone || "")
    .trim()
    .replace(/\s+/g, "");

  if (value.startsWith("00")) {
    value = "+" + value.substring(2);
  }

  if (value.startsWith("01")) {
    value = "+20" + value.substring(1);
  }

  if (value.startsWith("20") && !value.startsWith("+20")) {
    value = "+" + value;
  }

  return value;
}


// ======================================================
// RECAPTCHA
// ======================================================

function resetRegisterRecaptcha() {

  try {

    if (recaptchaVerifier) {
      recaptchaVerifier.clear();
    }

  } catch (e) {
    console.log(e);
  }

  recaptchaVerifier = null;

  $("#registerRecaptcha").innerHTML = "";
}


function createRegisterRecaptcha() {

  if (recaptchaVerifier) {
    return recaptchaVerifier;
  }

  recaptchaVerifier = new RecaptchaVerifier(
    auth,
    "registerRecaptcha",
    {
      size: "normal"
    }
  );

  return recaptchaVerifier;
}


// ======================================================
// ACCOUNT LOGIN
// ======================================================

$("#loginAccountBtn").onclick = async () => {

  const accountNumber =
    $("#loginAccount").value.trim();

  const password =
    $("#loginPassword").value;


  if (!accountNumber) {
    $("#loginMsg").innerHTML =
      `<div class="notice error">
        اكتب رقم الحساب.
      </div>`;

    return;
  }


  if (!password) {
    $("#loginMsg").innerHTML =
      `<div class="notice error">
        اكتب كلمة المرور.
      </div>`;

    return;
  }


  $("#loginMsg").innerHTML =
    `<div class="notice">
      جاري تسجيل الدخول...
    </div>`;


  try {

    const email =
      accountEmail(accountNumber);


    await signInWithEmailAndPassword(
      auth,
      email,
      password
    );


    $("#loginMsg").innerHTML =
      `<div class="notice">
        تم تسجيل الدخول بنجاح ✅
      </div>`;


  } catch (error) {

    console.error(error);


    let message =
      "رقم الحساب أو كلمة المرور غير صحيحة.";


    if (error.code === "auth/user-not-found") {
      message = "رقم الحساب غير موجود.";
    }


    if (error.code === "auth/wrong-password") {
      message = "كلمة المرور غير صحيحة.";
    }


    if (error.code === "auth/invalid-credential") {
      message =
        "رقم الحساب أو كلمة المرور غير صحيحة.";
    }


    $("#loginMsg").innerHTML =
      `<div class="notice error">
        ${escapeHtml(message)}
      </div>`;

  }

};


// ======================================================
// REGISTER - SEND OTP
// ======================================================

$("#sendRegisterOtp").onclick = async () => {

  const role =
    $("#registerRole").value;

  const name =
    $("#registerName").value.trim();

  const phone =
    normalizeEgyptPhone(
      $("#registerPhone").value
    );

  const password =
    $("#registerPassword").value;

  const password2 =
    $("#registerPassword2").value;


  if (!name) {
    alert("اكتب الاسم.");
    return;
  }


  if (!phone) {
    alert("اكتب رقم الموبايل.");
    return;
  }


  if (password.length < 6) {
    alert("كلمة المرور لازم تكون 6 أحرف أو أرقام على الأقل.");
    return;
  }


  if (password !== password2) {
    alert("كلمتا المرور غير متطابقتين.");
    return;
  }


  if (role === "captain") {

    const age =
      Number($("#registerAge").value);

    const carType =
      $("#registerCarType").value;

    const carModel =
      $("#registerCarModel").value.trim();

    const plate =
      $("#registerPlate").value.trim();


    if (!age || age < 18) {
      alert("الكابتن لازم يكون عمره 18 سنة أو أكثر.");
      return;
    }


    if (!carType) {
      alert("اختار نوع العربية.");
      return;
    }


    if (!carModel) {
      alert("اكتب موديل العربية.");
      return;
    }


    if (!plate) {
      alert("اكتب رقم اللوحة.");
      return;
    }

  }


  try {

    $("#sendRegisterOtp").disabled = true;

    $("#registerMsg").innerHTML =
      `<div class="notice">
        جاري إرسال كود التحقق...
      </div>`;


    resetRegisterRecaptcha();

    const verifier =
      createRegisterRecaptcha();


    confirmationResult =
      await signInWithPhoneNumber(
        auth,
        phone,
        verifier
      );


    $("#registerOtpBox")
      .classList
      .remove("hidden");


    $("#registerMsg").innerHTML =
      `<div class="notice">
        تم إرسال كود التحقق على الرقم ${escapeHtml(phone)} 📩
      </div>`;


  } catch (error) {

    console.error(error);


    $("#registerMsg").innerHTML =
      `<div class="notice error">
        ${escapeHtml(error.message)}
      </div>`;


    resetRegisterRecaptcha();

  } finally {

    $("#sendRegisterOtp").disabled = false;

  }

};


// ======================================================
// REGISTER - VERIFY OTP + CREATE ACCOUNT
// ======================================================

$("#verifyRegisterOtp").onclick = async () => {

  if (!confirmationResult) {

    alert("اطلب كود التحقق أولاً.");

    return;
  }


  const code =
    $("#registerOtp").value.trim();

  if (!code) {

    alert("اكتب كود التحقق.");

    return;
  }


  const role =
    $("#registerRole").value;

  const name =
    $("#registerName").value.trim();

  const phone =
    normalizeEgyptPhone(
      $("#registerPhone").value
    );

  const password =
    $("#registerPassword").value;


  $("#verifyRegisterOtp").disabled = true;


  try {

    $("#registerMsg").innerHTML =
      `<div class="notice">
        جاري تأكيد الرقم وإنشاء الحساب...
      </div>`;


    // --------------------------------------------------
    // Verify phone
    // --------------------------------------------------

    const result =
      await confirmationResult.confirm(code);


    const phoneUser =
      result.user;


    // --------------------------------------------------
    // Generate account number
    // --------------------------------------------------

    const accountNumber =
      generateAccountNumber();


    const email =
      accountEmail(accountNumber);


    // --------------------------------------------------
    // Link password login to same Firebase user
    // --------------------------------------------------

    const credential =
      EmailAuthProvider.credential(
        email,
        password
      );


    try {

      await linkWithCredential(
        phoneUser,
        credential
      );

    } catch (linkError) {

      console.error(linkError);


      if (
        linkError.code !==
        "auth/provider-already-linked"
      ) {

        throw linkError;

      }

    }


    // --------------------------------------------------
    // Update Firebase profile
    // --------------------------------------------------

    await updateProfile(
      phoneUser,
      {
        displayName: name
      }
    );


    // --------------------------------------------------
    // User data
    // --------------------------------------------------

    const userData = {

      uid: phoneUser.uid,

      name,

      phone,

      role,

      accountNumber,

      rating: "جديد",

      createdAt:
        serverTimestamp(),

      updatedAt:
        serverTimestamp()
    };


    // --------------------------------------------------
    // Captain data
    // --------------------------------------------------

    if (role === "captain") {

      userData.age =
        Number($("#registerAge").value);

      userData.carType =
        $("#registerCarType").value;

      userData.carModel =
        $("#registerCarModel").value.trim();

      userData.plate =
        $("#registerPlate").value.trim();

    } else {

      userData.age = null;
      userData.carType = "";
      userData.carModel = "";
      userData.plate = "";

    }


    // --------------------------------------------------
    // Save user
    // --------------------------------------------------

    await setDoc(
      doc(db, "users", phoneUser.uid),
      userData
    );


    currentRole = role;


    // --------------------------------------------------
    // Save account locally
    // --------------------------------------------------

    localStorage.setItem(
      "wasselniAccountNumber",
      accountNumber
    );


    // --------------------------------------------------
    // Show account number
    // --------------------------------------------------

    alert(
      `تم إنشاء حسابك بنجاح ✅\n\n` +
      `رقم الحساب: ${accountNumber}\n\n` +
      `احتفظ برقم الحساب وكلمة المرور لأنك ستستخدمهما في تسجيل الدخول.`
    );


    // --------------------------------------------------
    // Go inside app
    // --------------------------------------------------

    show("home");


  } catch (error) {

    console.error(error);


    let message =
      "حصل خطأ أثناء إنشاء الحساب.";


    if (
      error.code ===
      "auth/invalid-verification-code"
    ) {

      message =
        "كود التحقق غير صحيح.";

    }


    if (
      error.code ===
      "auth/code-expired"
    ) {

      message =
        "كود التحقق انتهت صلاحيته. اطلب كود جديد.";

    }


    if (
      error.code ===
      "auth/email-already-in-use"
    ) {

      message =
        "حصل تعارض في رقم الحساب. حاول إنشاء الحساب مرة أخرى.";

    }


    $("#registerMsg").innerHTML =
      `<div class="notice error">
        ${escapeHtml(message)}
      </div>`;


  } finally {

    $("#verifyRegisterOtp").disabled = false;

  }

};


// ======================================================
// MAP
// ======================================================

async function geocode(searchText) {

  const q =
    encodeURIComponent(
      searchText + ", Egypt"
    );


  const response =
    await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=ar&q=${q}`,
      {
        headers: {
          Accept:
            "application/json"
        }
      }
    );


  if (!response.ok) {
    throw new Error(
      "تعذر البحث عن المكان"
    );
  }


  return await response.json();
}


function setMarker(
  which,
  lat,
  lng,
  label
) {

  const marker =
    L.marker(
      [lat, lng],
      {
        draggable: true
      }
    )
      .addTo(map)
      .bindPopup(label)
      .openPopup();


  marker.on(
    "dragend",
    async () => {

      const position =
        marker.getLatLng();


      try {

        const response =
          await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${position.lat}&lon=${position.lng}&accept-language=ar`,
            {
              headers: {
                Accept:
                  "application/json"
              }
            }
          );


        const data =
          await response.json();


        const address =
          data.display_name ||
          label;


        if (which === "from") {

          $("#from").value =
            address;

          fromPlace = {
            lat:
              position.lat,
            lng:
              position.lng
          };

        } else {

          $("#to").value =
            address;

          toPlace = {
            lat:
              position.lat,
            lng:
              position.lng
          };

        }


        drawRoute();

      } catch (error) {

        console.error(error);

      }

    }
  );


  return marker;
}


async function choosePlace(
  inputSelector,
  which
) {

  const input =
    $(inputSelector);

  const value =
    input.value.trim();


  if (!value) {
    return;
  }


  try {

    const results =
      await geocode(value);


    if (!results.length) {

      alert(
        "المكان غير موجود، جرّب كتابة اسم شارع أو منطقة بشكل أوضح."
      );

      return;
    }


    const result =
      results[0];


    const lat =
      Number(result.lat);

    const lng =
      Number(result.lon);


    if (which === "from") {

      fromPlace = {
        lat,
        lng
      };


      if (fromMarker) {
        map.removeLayer(
          fromMarker
        );
      }


      fromMarker =
        setMarker(
          "from",
          lat,
          lng,
          "مكان الركوب"
        );

    } else {

      toPlace = {
        lat,
        lng
      };


      if (toMarker) {
        map.removeLayer(
          toMarker
        );
      }


      toMarker =
        setMarker(
          "to",
          lat,
          lng,
          "مكان الوصول"
        );

    }


    map.setView(
      [lat, lng],
      14
    );


    drawRoute();


  } catch (error) {

    console.error(error);

    alert(
      "حصلت مشكلة أثناء البحث عن المكان."
    );

  }

}


async function drawRoute() {

  if (
    !fromPlace ||
    !toPlace
  ) {
    return;
  }


  try {

    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${fromPlace.lng},${fromPlace.lat};` +
      `${toPlace.lng},${toPlace.lat}` +
      `?overview=full&geometries=geojson`;


    const response =
      await fetch(url);


    const data =
      await response.json();


    if (
      data.code !== "Ok" ||
      !data.routes?.length
    ) {

      alert(
        "لم أجد طريقًا بين النقطتين."
      );

      return;
    }


    if (routeLayer) {
      map.removeLayer(
        routeLayer
      );
    }


    routeLayer =
      L.geoJSON(
        data.routes[0].geometry,
        {
          style: {
            weight: 6
          }
        }
      ).addTo(map);


    map.fitBounds(
      routeLayer.getBounds(),
      {
        padding: [
          30,
          30
        ]
      }
    );


  } catch (error) {

    console.error(error);

  }

}


function initMap() {

  map =
    L.map("map")
      .setView(
        [30.5877, 30.5950],
        10
      );


  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution:
        "© OpenStreetMap contributors"
    }
  ).addTo(map);


  $("#from").addEventListener(
    "change",
    () =>
      choosePlace(
        "#from",
        "from"
      )
  );


  $("#to").addEventListener(
    "change",
    () =>
      choosePlace(
        "#to",
        "to"
      )
  );


  $("#from").addEventListener(
    "keydown",
    (event) => {

      if (
        event.key ===
        "Enter"
      ) {

        event.preventDefault();

        choosePlace(
          "#from",
          "from"
        );

      }

    }
  );


  $("#to").addEventListener(
    "keydown",
    (event) => {

      if (
        event.key ===
        "Enter"
      ) {

        event.preventDefault();

        choosePlace(
          "#to",
          "to"
        );

      }

    }
  );

}


initMap();


// ======================================================
// AUTH CHECK
// ======================================================

function requireUser() {

  if (!auth.currentUser) {

    show("auth");

    return false;
  }

  return true;
}


// ======================================================
// REQUEST RIDE
// ======================================================

$("#requestBtn").onclick =
  async () => {

    if (!requireUser()) {
      return;
    }


    if (
      !fromPlace ||
      !toPlace
    ) {

      alert(
        "اكتب مكان الركوب والوصول واضغط Enter في كل خانة."
      );

      return;
    }


    const price =
      Number(
        $("#price").value
      );


    if (!price) {

      alert(
        "اكتب السعر المقترح."
      );

      return;
    }


    const user =
      auth.currentUser;


    try {

      const userSnap =
        await getDoc(
          doc(
            db,
            "users",
            user.uid
          )
        );


      const profile =
        userSnap.exists()
          ? userSnap.data()
          : {};


      const ride =
        await addDoc(
          collection(
            db,
            "rides"
          ),
          {

            customerId:
              user.uid,

            customerName:
              profile.name ||
              user.displayName ||
              "عميل",

            customerPhone:
              profile.phone ||
              "",

            from:
              $("#from").value,

            to:
              $("#to").value,

            fromLat:
              fromPlace.lat,

            fromLng:
              fromPlace.lng,

            toLat:
              toPlace.lat,

            toLng:
              toPlace.lng,

            price,

            passengers:
              Number(
                $("#passengers").value ||
                1
              ),

            notes:
              $("#notes").value.trim(),

            status:
              "open",

            createdAt:
              serverTimestamp()

          }
        );


      localStorage.setItem(
        "lastRide",
        ride.id
      );


      show("offers");


    } catch (error) {

      console.error(error);

      alert(
        "حصل خطأ أثناء إرسال الرحلة."
      );

    }

  };


// ======================================================
// CUSTOMER OFFERS
// ======================================================

async function loadCustomerOffers() {

  if (!auth.currentUser) {

    $("#offersList").innerHTML =
      `<div class="card">
        سجل دخولك أولاً.
      </div>`;

    return;
  }


  const rideId =
    localStorage.getItem(
      "lastRide"
    );


  if (!rideId) {

    $("#offersList").innerHTML =
      `<div class="card muted">
        لا توجد رحلة حالية.
      </div>`;

    return;
  }


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

      $("#offersList").innerHTML =
        `<div class="card muted">
          الرحلة غير موجودة.
        </div>`;

      return;
    }


    const ride =
      rideSnap.data();


    $("#offersList").innerHTML = `

      <div class="card">

        <b>
          ${escapeHtml(ride.from)}
          →
          ${escapeHtml(ride.to)}
        </b>

        <p class="muted">
          السعر المطلوب:
          ${money(ride.price)}
          •
          ${ride.passengers || 1}
          راكب
        </p>

        <span class="pill">
          ${escapeHtml(ride.status || "open")}
        </span>

      </div>

      <div id="offerCards"></div>

    `;


    if (unsubscribeOffers) {
      unsubscribeOffers();
    }


    const offersQuery =
      query(
        collection(
          db,
          "rides",
          rideId,
          "offers"
        )
      );


    unsubscribeOffers =
      onSnapshot(
        offersQuery,
        (snapshot) => {

          const offers =
            snapshot.docs
              .map(
                (item) => ({
                  id:
                    item.id,
                  ...item.data()
                })
              )
              .sort(
                (a, b) =>
                  Number(
                    a.price || 0
                  ) -
                  Number(
                    b.price || 0
                  )
              );


          if (!offers.length) {

            $("#offerCards").innerHTML =
              `<div class="card muted">
                في انتظار عروض الكباتن...
              </div>`;

            return;
          }


          $("#offerCards").innerHTML =
            offers
              .map(
                (offer) => `

                <div class="card offer">

                  <div>

                    <b>
                      ${escapeHtml(
                        offer.captainName ||
                        "كابتن"
                      )}
                    </b>

                    <div class="muted">

                      ⭐
                      ${escapeHtml(
                        offer.rating ||
                        "جديد"
                      )}

                      •
                      ${escapeHtml(
                        offer.carType ||
                        ""
                      )}

                      ${escapeHtml(
                        offer.carModel ||
                        "سيارة"
                      )}

                    </div>

                  </div>


                  <div class="price">
                    ${money(
                      offer.price
                    )}
                  </div>

                </div>


                <button
                  class="btn green"
                  data-accept="${offer.id}"
                  data-ride="${rideId}"
                >
                  قبول العرض
                </button>

              `
              )
              .join("");


          document
            .querySelectorAll(
              "[data-accept]"
            )
            .forEach(
              (button) => {

                button.onclick =
                  () =>
                    acceptOffer(
                      button.dataset.ride,
                      button.dataset.accept
                    );

              }
            );

        }
      );


  } catch (error) {

    console.error(error);

    $("#offersList").innerHTML =
      `<div class="card notice error">
        تعذر تحميل العروض.
      </div>`;

  }

}


// ======================================================
// ACCEPT OFFER
// ======================================================

async function acceptOffer(
  rideId,
  offerId
) {

  try {

    const offerSnap =
      await getDoc(
        doc(
          db,
          "rides",
          rideId,
          "offers",
          offerId
        )
      );


    if (!offerSnap.exists()) {

      alert(
        "العرض لم يعد موجودًا."
      );

      return;
    }


    const offer =
      offerSnap.data();


    await updateDoc(
      doc(
        db,
        "rides",
        rideId
      ),
      {

        status:
          "accepted",

        acceptedOfferId:
          offerId,

        captainId:
          offer.captainId,

        captainName:
          offer.captainName,

        finalPrice:
          offer.price

      }
    );


    localStorage.setItem(
      "activeRide",
      rideId
    );


    show("trip");

    listenTrip(
      rideId
    );


  } catch (error) {

    console.error(error);

    alert(
      "حصل خطأ أثناء قبول العرض."
    );

  }

}


// ======================================================
// CAPTAIN RIDES
// ======================================================

function loadCaptainRides() {

  if (!auth.currentUser) {

    $("#captainRides").innerHTML =
      `<div class="card">
        سجل دخولك أولاً.
      </div>`;

    return;
  }


  if (currentRole !== "captain") {

    $("#captainRides").innerHTML =
      `<div class="card">
        هذه الصفحة للكباتن فقط.
      </div>`;

    return;
  }


  if (unsubscribeCaptainRides) {
    unsubscribeCaptainRides();
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
      limit(30)
    );


  unsubscribeCaptainRides =
    onSnapshot(
      ridesQuery,
      (snapshot) => {

        const rides =
          snapshot.docs
            .map(
              (item) => ({
                id:
                  item.id,
                ...item.data()
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

                return (
                  bTime -
                  aTime
                );

              }
            );


        if (!rides.length) {

          $("#captainRides").innerHTML =
            `<div class="card muted">
              لا توجد رحلات مفتوحة الآن.
            </div>`;

          return;
        }


        $("#captainRides").innerHTML =
          rides
            .map(
              (ride) => `

              <div class="card">

                <b>
                  ${escapeHtml(
                    ride.from
                  )}
                  →
                  ${escapeHtml(
                    ride.to
                  )}
                </b>

                <p class="muted">

                  👥
                  ${ride.passengers || 1}
                  راكب

                  • 💰
                  السعر المقترح:
                  ${money(
                    ride.price
                  )}

                </p>


                ${
                  ride.notes
                    ? `
                      <p class="muted">
                        📝
                        ${escapeHtml(
                          ride.notes
                        )}
                      </p>
                    `
                    : ""
                }


                <div class="row">

                  <input
                    id="offer-${ride.id}"
                    type="number"
                    min="1"
                    placeholder="اكتب سعرك"
                  >

                  <button
                    class="btn green"
                    data-offer="${ride.id}"
                  >
                    إرسال العرض
                  </button>

                </div>

              </div>

            `
            )
            .join("");


        document
          .querySelectorAll(
            "[data-offer]"
          )
          .forEach(
            (button) => {

              button.onclick =
                () =>
                  sendOffer(
                    button.dataset.offer
                  );

            }
          );

      }
    );

}


// ======================================================
// SEND CAPTAIN OFFER
// ======================================================

async function sendOffer(
  rideId
) {

  if (!requireUser()) {
    return;
  }


  const input =
    $(
      "#offer-" +
      rideId
    );


  const price =
    Number(
      input?.value
    );


  if (!price) {

    alert(
      "اكتب سعرك."
    );

    return;
  }


  const user =
    auth.currentUser;


  try {

    const profileSnap =
      await getDoc(
        doc(
          db,
          "users",
          user.uid
        )
      );


    const profile =
      profileSnap.exists()
        ? profileSnap.data()
        : {};


    await setDoc(
      doc(
        db,
        "rides",
        rideId,
        "offers",
        user.uid
      ),
      {

        captainId:
          user.uid,

        captainName:
          profile.name ||
          user.displayName ||
          "كابتن",

        captainPhone:
          profile.phone ||
          "",

        carType:
          profile.carType ||
          "",

        carModel:
          profile.carModel ||
          "سيارة",

        plate:
          profile.plate ||
          "",

        rating:
          profile.rating ||
          "جديد",

        price,

        createdAt:
          serverTimestamp()

      }
    );


    alert(
      "تم إرسال عرضك للعميل ✅"
    );


    input.value = "";


  } catch (error) {

    console.error(error);

    alert(
      "حصل خطأ أثناء إرسال العرض."
    );

  }

}


// ======================================================
// ACTIVE TRIP
// ======================================================

function listenTrip(
  rideId
) {

  if (unsubscribeTrip) {
    unsubscribeTrip();
  }


  unsubscribeTrip =
    onSnapshot(
      doc(
        db,
        "rides",
        rideId
      ),
      (snapshot) => {

        if (!snapshot.exists()) {

          $("#tripBox").innerHTML =
            `<div class="card">
              الرحلة غير موجودة.
            </div>`;

          return;
        }


        const ride =
          snapshot.data();


        $("#tripBox").innerHTML = `

          <div class="card">

            <span class="pill">
              ${escapeHtml(
                ride.status ||
                "active"
              )}
            </span>


            <h3>
              ${escapeHtml(
                ride.from
              )}
              →
              ${escapeHtml(
                ride.to
              )}
            </h3>


            <p>
              السعر النهائي:
              <b>
                ${money(
                  ride.finalPrice ||
                  ride.price
                )}
              </b>
            </p>


            <p>
              الكابتن:
              <b>
                ${escapeHtml(
                  ride.captainName ||
                  "—"
                )}
              </b>
            </p>


            <button
              class="btn primary"
              id="callCaptainBtn"
            >
              📞 اتصال بالكابتن
            </button>


            <button
              class="btn outline"
              id="backHomeTrip"
            >
              العودة للرئيسية
            </button>

          </div>

        `;


        $("#callCaptainBtn").onclick =
          async () => {

            if (
              ride.captainPhone
            ) {

              window.location.href =
                `tel:${ride.captainPhone}`;

            } else {

              alert(
                "رقم الكابتن غير متاح."
              );

            }

          };


        $("#backHomeTrip").onclick =
          () =>
            show("home");

      }
    );

}


// ======================================================
// PROFILE
// ======================================================

async function loadProfile() {

  const user =
    auth.currentUser;


  if (!user) {
    return;
  }


  const snap =
    await getDoc(
      doc(
        db,
        "users",
        user.uid
      )
    );


  if (!snap.exists()) {
    return;
  }


  const data =
    snap.data();


  currentRole =
    data.role ||
    "customer";


  $("#profileName").textContent =
    data.name ||
    user.displayName ||
    "مستخدم";


  $("#profilePhone").textContent =
    data.phone ||
    user.phoneNumber ||
    "";


  $("#profileAccount").textContent =
    `رقم الحساب: ${
      data.accountNumber ||
      "—"
    }`;


  $("#profileNameInput").value =
    data.name ||
    "";


  $("#profileRole").value =
    currentRole;


  $("#carType").value =
    data.carType ||
    "";


  $("#carModel").value =
    data.carModel ||
    "";


  $("#plate").value =
    data.plate ||
    "";


  $("#profileAge").value =
    data.age ||
    "";

}


$("#saveProfile").onclick =
  async () => {

    const user =
      auth.currentUser;


    if (!user) {
      return;
    }


    const data = {

      name:
        $("#profileNameInput")
          .value
          .trim() ||
        "مستخدم",

      role:
        $("#profileRole")
          .value,

      carType:
        $("#carType")
          .value
          .trim(),

      carModel:
        $("#carModel")
          .value
          .trim(),

      plate:
        $("#plate")
          .value
          .trim(),

      age:
        Number(
          $("#profileAge")
            .value
        ) || null,

      updatedAt:
        serverTimestamp()

    };


    try {

      await setDoc(
        doc(
          db,
          "users",
          user.uid
        ),
        data,
        {
          merge: true
        }
      );


      await updateProfile(
        user,
        {
          displayName:
            data.name
        }
      );


      currentRole =
        data.role;


      await loadProfile();


      alert(
        "تم حفظ البيانات ✅"
      );


    } catch (error) {

      console.error(error);

      alert(
        "حصل خطأ أثناء حفظ البيانات."
      );

    }

  };


// ======================================================
// LOGOUT
// ======================================================

$("#logoutBtn").onclick =
  async () => {

    try {

      await signOut(auth);

    } catch (error) {

      console.error(error);

    }

  };


// ======================================================
// AUTH STATE
// ======================================================

onAuthStateChanged(
  auth,
  async (user) => {

    if (!user) {

      $("#authMini").textContent =
        "🔒";


      $("#appNav")
        .classList
        .add("hidden");


      currentRole =
        "customer";


      show("auth");


      return;
    }


    $("#authMini").textContent =
      "🟢";


    $("#appNav")
      .classList
      .remove("hidden");


    await loadProfile();


    const activeRide =
      localStorage.getItem(
        "activeRide"
      );


    if (activeRide) {

      show("trip");

      listenTrip(
        activeRide
      );

    } else {

      show("home");

    }

  }
);


// ======================================================
// FIREBASE LOCAL LOGIN
// ======================================================

setPersistence(
  auth,
  browserLocalPersistence
).catch(
  (error) => {
    console.error(
      "Persistence error:",
      error
    );
  }
);
