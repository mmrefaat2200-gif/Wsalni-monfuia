import "./style.css";

import { initializeApp } from "firebase/app";

import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  onAuthStateChanged,
  signOut,
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
  orderBy,
  onSnapshot,
  serverTimestamp,
  limit
} from "firebase/firestore";


/* =========================
   FIREBASE
========================= */

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(cfg);
const auth = getAuth(app);
const db = getFirestore(app);


/* =========================
   VARIABLES
========================= */

let confirmationResult = null;
let recaptcha = null;

let map = null;
let routeLayer = null;

let fromMarker = null;
let toMarker = null;

let fromPlace = null;
let toPlace = null;

let currentRole = "customer";

let unsubscribeOffers = null;
let unsubscribeRide = null;

let pickerMap = null;
let pickerMarker = null;
let pickerMode = null;

let selectedSearchPlace = null;


/* =========================
   HELPERS
========================= */

const $ = (selector) => document.querySelector(selector);

const money = (n) =>
  `${Number(n || 0).toLocaleString("ar-EG")} جنيه`;


/* =========================
   APP HTML
========================= */

document.querySelector("#app").innerHTML = `

<header>
  <div class="logo">
    وصلني <span>المنوفية</span>
  </div>

  <div id="authMini">👤</div>
</header>


<section id="home" class="screen">

  <div class="hero">
    <h2>مشوارك يبدأ من هنا 🚕</h2>
    <p>
      اطلب رحلة، حدد السعر، وسيب الكباتن يقدموا عروضهم.
    </p>
  </div>


  <div class="card">

    <div class="map">
      <div id="map"></div>
    </div>


    <label>📍 مكان الركوب</label>

    <button
      type="button"
      id="fromPickerBtn"
      class="location-input"
    >
      <span id="fromText">
        اضغط لاختيار مكان الركوب
      </span>
      <span>📍</span>
    </button>


    <label>📍 مكان الوصول</label>

    <button
      type="button"
      id="toPickerBtn"
      class="location-input"
    >
      <span id="toText">
        اكتب أو اختر مكان الوصول
      </span>
      <span>🔎</span>
    </button>


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
          max="7"
          value="1"
        >
      </div>

    </div>


    <label>📝 ملاحظات للسائق</label>

    <input
      id="notes"
      placeholder="مثال: شنطة كبيرة"
    >


    <div id="routeInfo" class="route-info hidden"></div>


    <button
      class="btn primary"
      id="requestBtn"
    >
      🚕 اطلب الرحلة
    </button>

  </div>


  <div class="row">

    <button
      class="btn outline"
      id="myRidesBtn"
    >
      رحلاتي
    </button>

    <button
      class="btn outline"
      id="loginBtn"
    >
      تسجيل / دخول
    </button>

  </div>

</section>



<section id="offers" class="screen hidden">

  <h2>عروض الكباتن</h2>

  <div id="offersList"></div>

</section>



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



<section id="trip" class="screen hidden">

  <h2>الرحلة الحالية 🚕</h2>

  <div id="tripBox"></div>

</section>



<section id="profile" class="screen hidden">

  <h2>حسابي</h2>

  <div
    class="card"
    style="text-align:center"
  >

    <div class="avatar">👤</div>

    <h3 id="profileName">
      زائر
    </h3>

    <div
      id="profilePhone"
      class="muted"
    >
      غير مسجل
    </div>

  </div>


  <div class="card">

    <label>الاسم</label>

    <input id="profileNameInput">


    <label>الدور</label>

    <select id="profileRole">

      <option value="customer">
        عميل
      </option>

      <option value="captain">
        كابتن
      </option>

    </select>


    <label>
      نوع السيارة (للكابتن)
    </label>

    <input
      id="carModel"
      placeholder="تويوتا كورولا"
    >


    <label>
      رقم اللوحة (للكابتن)
    </label>

    <input
      id="plate"
      placeholder="مثال: م ن 1234"
    >


    <button
      class="btn primary"
      id="saveProfile"
    >
      حفظ البيانات
    </button>


    <button
      class="btn danger"
      id="logoutBtn"
    >
      تسجيل الخروج
    </button>

  </div>

</section>



<section id="auth" class="screen hidden">

  <h2>تسجيل الدخول</h2>

  <p class="muted">
    سنرسل كود تحقق SMS على رقم هاتفك.
  </p>


  <div class="card">

    <label>رقم الهاتف</label>

    <input
      id="phone"
      placeholder="+2010xxxxxxxx"
      inputmode="tel"
    >


    <div id="recaptcha"></div>


    <button
      class="btn primary"
      id="sendOtp"
    >
      إرسال الكود
    </button>


    <div
      id="otpBox"
      class="hidden"
    >

      <label>
        كود التحقق
      </label>

      <input
        id="otp"
        inputmode="numeric"
      >

      <button
        class="btn green"
        id="verifyOtp"
      >
        تأكيد
      </button>

    </div>


    <div id="authMsg"></div>

  </div>

</section>



<!-- =========================
     LOCATION PICKER
========================= -->

<div
  id="locationModal"
  class="location-modal hidden"
>

  <div class="location-modal-box">

    <div class="location-header">

      <button
        id="closeLocation"
        class="close-location"
      >
        ✕
      </button>

      <div>
        <b id="locationTitle">
          اختيار المكان
        </b>

        <small id="locationSubtitle">
          حدد المكان على الخريطة
        </small>
      </div>

    </div>


    <div
      id="destinationSearch"
      class="destination-search hidden"
    >

      <input
        id="destinationInput"
        placeholder="اكتب اسم البلد أو المنطقة..."
        autocomplete="off"
      >

      <button
        id="searchDestination"
        class="btn primary"
      >
        🔎 بحث
      </button>

    </div>


    <div
      id="searchResults"
      class="search-results hidden"
    ></div>


    <div
      id="pickerMap"
      class="picker-map"
    ></div>


    <div
      id="pickerHint"
      class="picker-hint"
    >
      حرّك الخريطة وحدد المكان في المنتصف
    </div>


    <button
      id="useCurrentLocation"
      class="btn outline location-current-btn"
    >
      📍 استخدام موقعي الحالي
    </button>


    <button
      id="confirmLocation"
      class="btn primary"
    >
      تأكيد المكان
    </button>

  </div>

</div>



<nav class="nav">

  <button
    class="active"
    data-screen="home"
  >
    🏠<br>
    الرئيسية
  </button>


  <button
    data-screen="offers"
  >
    🚕<br>
    العروض
  </button>


  <button
    data-screen="captain"
  >
    👨‍✈️<br>
    الكابتن
  </button>


  <button
    data-screen="profile"
  >
    👤<br>
    حسابي
  </button>

</nav>
`;


/* =========================
   EXTRA CSS
========================= */

const extraStyle = document.createElement("style");

extraStyle.textContent = `

.location-input{
  width:100%;
  min-height:52px;
  background:#fff;
  border:1px solid #ddd;
  border-radius:12px;
  padding:12px 15px;
  margin-bottom:14px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  font-size:15px;
  color:#333;
  text-align:right;
  cursor:pointer;
}

.location-input:active{
  transform:scale(.99);
}

.location-input span:first-child{
  overflow:hidden;
  white-space:nowrap;
  text-overflow:ellipsis;
}

.location-modal{
  position:fixed;
  inset:0;
  background:rgba(0,0,0,.55);
  z-index:99999;
  display:flex;
  align-items:flex-end;
  justify-content:center;
}

.location-modal.hidden{
  display:none;
}

.location-modal-box{
  background:#fff;
  width:100%;
  max-width:650px;
  height:94vh;
  border-radius:22px 22px 0 0;
  overflow:hidden;
  position:relative;
  display:flex;
  flex-direction:column;
}

.location-header{
  min-height:62px;
  padding:10px 15px;
  display:flex;
  align-items:center;
  gap:12px;
  border-bottom:1px solid #eee;
}

.location-header b{
  display:block;
  font-size:17px;
}

.location-header small{
  display:block;
  color:#777;
  margin-top:3px;
}

.close-location{
  width:42px;
  height:42px;
  border:0;
  border-radius:50%;
  background:#f1f1f1;
  font-size:18px;
}

.destination-search{
  display:flex;
  gap:8px;
  padding:10px;
  border-bottom:1px solid #eee;
}

.destination-search input{
  flex:1;
  margin:0;
}

.destination-search button{
  width:auto;
  margin:0;
  white-space:nowrap;
}

.search-results{
  max-height:190px;
  overflow-y:auto;
  background:#fff;
  position:relative;
  z-index:20;
  border-bottom:1px solid #ddd;
}

.search-result{
  padding:13px;
  border-bottom:1px solid #eee;
  cursor:pointer;
}

.search-result:active{
  background:#f2f8ff;
}

.search-result-title{
  font-weight:bold;
  margin-bottom:4px;
}

.search-result-address{
  color:#777;
  font-size:12px;
}

.picker-map{
  flex:1;
  min-height:280px;
  position:relative;
}

.picker-hint{
  background:#fff;
  padding:9px;
  text-align:center;
  font-size:13px;
  color:#666;
  border-top:1px solid #eee;
}

.location-current-btn{
  margin:8px 10px 4px;
}

#confirmLocation{
  margin:6px 10px 12px;
}

.center-pin{
  position:absolute;
  z-index:1000;
  left:50%;
  top:50%;
  transform:translate(-50%,-100%);
  font-size:42px;
  pointer-events:none;
  filter:drop-shadow(0 3px 3px rgba(0,0,0,.35));
}

.route-info{
  background:#eef7ff;
  color:#075c9e;
  border-radius:12px;
  padding:12px;
  margin:10px 0;
  text-align:center;
}

.route-info.hidden{
  display:none;
}

.leaflet-control-attribution{
  font-size:9px !important;
}

`;

document.head.appendChild(extraStyle);


/* =========================
   SCREENS
========================= */

function show(id){

  document
    .querySelectorAll("section.screen")
    .forEach(x => x.classList.add("hidden"));

  $("#" + id).classList.remove("hidden");

  document
    .querySelectorAll(".nav button")
    .forEach(b =>
      b.classList.toggle(
        "active",
        b.dataset.screen === id
      )
    );

  window.scrollTo({
    top:0,
    behavior:"smooth"
  });


  if(id === "offers"){
    loadCustomerOffers();
  }

  if(id === "captain"){
    loadCaptainRides();
  }

  setTimeout(() => {

    if(map){
      map.invalidateSize();
    }

  },300);
}


document
  .querySelectorAll(".nav button")
  .forEach(b => {

    b.onclick = () =>
      show(b.dataset.screen);

  });


$("#loginBtn").onclick = () =>
  show("auth");


$("#myRidesBtn").onclick = () =>
  show("offers");


/* =========================
   GEOCODING
========================= */

async function geocode(queryText){

  const q =
    encodeURIComponent(
      queryText + ", Egypt"
    );

  const res =
    await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&accept-language=ar&countrycodes=eg&q=${q}`
    );

  if(!res.ok){
    throw new Error(
      "تعذر البحث عن المكان"
    );
  }

  return await res.json();
}


/* =========================
   REVERSE GEOCODE
========================= */

async function reverseGeocode(lat,lng){

  try{

    const res =
      await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ar`
      );

    if(!res.ok) return null;

    return await res.json();

  }catch(e){

    console.error(e);
    return null;

  }
}


/* =========================
   MAIN MAP
========================= */

function initMaps(){

  map =
    L.map("map").setView(
      [30.5877,30.5950],
      10
    );


  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom:19,
      attribution:
        "© OpenStreetMap contributors"
    }
  ).addTo(map);

}


initMaps();


/* =========================
   MARKER
========================= */

function setMainMarker(
  which,
  lat,
  lng,
  label
){

  const marker =
    L.marker(
      [lat,lng],
      {
        draggable:true
      }
    )
    .addTo(map)
    .bindPopup(label)
    .openPopup();


  marker.on(
    "dragend",
    async () => {

      const p =
        marker.getLatLng();

      const d =
        await reverseGeocode(
          p.lat,
          p.lng
        );


      const text =
        d?.display_name ||
        label;


      if(which === "from"){

        fromPlace = {
          lat:p.lat,
          lng:p.lng
        };

        $("#fromText").textContent =
          text;

      }else{

        toPlace = {
          lat:p.lat,
          lng:p.lng
        };

        $("#toText").textContent =
          text;

      }

      drawRoute();

    }
  );


  return marker;

}


/* =========================
   LOCATION PICKER
========================= */

function openLocationPicker(mode){

  pickerMode = mode;

  selectedSearchPlace = null;

  $("#locationModal")
    .classList.remove("hidden");


  $("#searchResults")
    .classList.add("hidden");


  if(mode === "from"){

    $("#locationTitle").textContent =
      "📍 اختيار مكان الركوب";

    $("#locationSubtitle").textContent =
      "حدد مكان ركوب العميل";

    $("#destinationSearch")
      .classList.add("hidden");

    $("#pickerHint").textContent =
      "حرّك الخريطة وحدد مكان الركوب في المنتصف";

  }else{

    $("#locationTitle").textContent =
      "📍 اختيار مكان الوصول";

    $("#locationSubtitle").textContent =
      "اكتب المكان أو اختاره من الخريطة";

    $("#destinationSearch")
      .classList.remove("hidden");

    $("#pickerHint").textContent =
      "اكتب اسم البلد أو المنطقة أو حرّك الخريطة";

  }


  setTimeout(() => {

    initPickerMap();

  },100);

}


function closeLocationPicker(){

  $("#locationModal")
    .classList.add("hidden");

  pickerMode = null;

}


$("#closeLocation").onclick =
  closeLocationPicker;


/* =========================
   PICKER MAP
========================= */

function initPickerMap(){

  if(pickerMap){

    pickerMap.remove();

    pickerMap = null;

  }


  let startLat = 30.5877;
  let startLng = 30.5950;
  let zoom = 10;


  if(pickerMode === "from" && fromPlace){

    startLat = fromPlace.lat;
    startLng = fromPlace.lng;
    zoom = 16;

  }


  if(pickerMode === "to" && toPlace){

    startLat = toPlace.lat;
    startLng = toPlace.lng;
    zoom = 16;

  }


  pickerMap =
    L.map("pickerMap",{
      zoomControl:true
    })
    .setView(
      [startLat,startLng],
      zoom
    );


  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom:19,
      attribution:
        "© OpenStreetMap contributors"
    }
  ).addTo(pickerMap);


  /* مركز الخريطة */

  const pin =
    document.createElement("div");

  pin.className =
    "center-pin";

  pin.innerHTML =
    pickerMode === "from"
      ? "📍"
      : "📍";

  document
    .querySelector("#pickerMap")
    .appendChild(pin);


  pickerMap.on(
    "moveend",
    () => {

      updatePickerPosition();

    }
  );


  updatePickerPosition();


  setTimeout(() => {

    pickerMap.invalidateSize();

  },300);

}


/* =========================
   UPDATE CENTER POSITION
========================= */

async function updatePickerPosition(){

  if(!pickerMap) return;

  const center =
    pickerMap.getCenter();

  selectedSearchPlace = {
    lat:center.lat,
    lng:center.lng,
    label:"المكان المحدد"
  };

}


/* =========================
   CURRENT LOCATION
========================= */

$("#useCurrentLocation").onclick =
  () => {

    if(!navigator.geolocation){

      alert(
        "الجهاز لا يدعم تحديد الموقع."
      );

      return;

    }


    navigator.geolocation.getCurrentPosition(

      position => {

        const lat =
          position.coords.latitude;

        const lng =
          position.coords.longitude;


        if(!pickerMap) return;


        pickerMap.setView(
          [lat,lng],
          17,
          {
            animate:true
          }
        );


        selectedSearchPlace = {
          lat,
          lng,
          label:"موقعي الحالي"
        };

      },


      error => {

        if(error.code === 1){

          alert(
            "لازم تسمح للتطبيق باستخدام الموقع من إعدادات الموبايل."
          );

        }else{

          alert(
            "تعذر تحديد موقعك الحالي. تأكد من تشغيل GPS."
          );

        }

      },

      {
        enableHighAccuracy:true,
        timeout:10000,
        maximumAge:30000
      }

    );

  };


/* =========================
   CONFIRM LOCATION
========================= */

$("#confirmLocation").onclick =
  async () => {

    if(!pickerMap) return;


    const center =
      pickerMap.getCenter();


    const lat = center.lat;
    const lng = center.lng;


    const data =
      await reverseGeocode(
        lat,
        lng
      );


    const label =
      data?.display_name ||
      "المكان المحدد على الخريطة";


    if(pickerMode === "from"){

      fromPlace = {
        lat,
        lng
      };


      $("#fromText").textContent =
        label;


      if(fromMarker){

        map.removeLayer(
          fromMarker
        );

      }


      fromMarker =
        setMainMarker(
          "from",
          lat,
          lng,
          "مكان الركوب"
        );


      map.setView(
        [lat,lng],
        15
      );


    }else{

      toPlace = {
        lat,
        lng
      };


      $("#toText").textContent =
        label;


      if(toMarker){

        map.removeLayer(
          toMarker
        );

      }


      toMarker =
        setMainMarker(
          "to",
          lat,
          lng,
          "مكان الوصول"
        );


      map.setView(
        [lat,lng],
        15
      );

    }


    closeLocationPicker();

    drawRoute();

  };


/* =========================
   DESTINATION SEARCH
========================= */

async function searchDestination(){

  const value =
    $("#destinationInput")
      .value
      .trim();


  if(!value){

    alert(
      "اكتب اسم البلد أو المنطقة أولاً."
    );

    return;

  }


  $("#searchDestination").disabled =
    true;

  $("#searchDestination").textContent =
    "جاري البحث...";


  try{

    const results =
      await geocode(value);


    const box =
      $("#searchResults");


    if(!results.length){

      box.classList.remove("hidden");

      box.innerHTML =
        `<div class="search-result">
          لم يتم العثور على المكان.
          جرّب كتابة اسم القرية أو المركز بشكل أوضح.
        </div>`;

      return;

    }


    box.classList.remove("hidden");


    box.innerHTML =
      results.map((r,index) => {

        const name =
          r.display_name
            .split(",")
            .slice(0,2)
            .join(",");


        return `
          <div
            class="search-result"
            data-result-index="${index}"
          >

            <div class="search-result-title">
              📍 ${name}
            </div>

            <div class="search-result-address">
              ${r.display_name}
            </div>

          </div>
        `;

      }).join("");


    box
      .querySelectorAll(
        "[data-result-index]"
      )
      .forEach(item => {

        item.onclick = () => {

          const index =
            Number(
              item.dataset.resultIndex
            );

          selectSearchResult(
            results[index]
          );

        };

      });


  }catch(e){

    console.error(e);

    alert(
      "حصلت مشكلة أثناء البحث. جرّب مرة أخرى."
    );

  }finally{

    $("#searchDestination").disabled =
      false;

    $("#searchDestination").textContent =
      "🔎 بحث";

  }

}


$("#searchDestination").onclick =
  searchDestination;


$("#destinationInput").addEventListener(
  "keydown",
  e => {

    if(e.key === "Enter"){

      e.preventDefault();

      searchDestination();

    }

  }
);


/* =========================
   SELECT SEARCH RESULT
========================= */

function selectSearchResult(result){

  const lat =
    Number(result.lat);

  const lng =
    Number(result.lon);


  if(!pickerMap) return;


  pickerMap.setView(
    [lat,lng],
    16,
    {
      animate:true
    }
  );


  selectedSearchPlace = {
    lat,
    lng,
    label:result.display_name
  };


  $("#searchResults")
    .classList.add("hidden");


  $("#destinationInput").value =
    result.display_name;


  $("#pickerHint").textContent =
    "تم تحديد المكان. اضغط «تأكيد المكان».";

}


/* =========================
   PICKER BUTTONS
========================= */

$("#fromPickerBtn").onclick =
  () => {

    openLocationPicker("from");

  };


$("#toPickerBtn").onclick =
  () => {

    openLocationPicker("to");

  };


/* =========================
   ROUTE
========================= */

async function drawRoute(){

  if(!fromPlace || !toPlace){

    $("#routeInfo")
      .classList.add("hidden");

    return;

  }


  try{

    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${fromPlace.lng},${fromPlace.lat};` +
      `${toPlace.lng},${toPlace.lat}` +
      `?overview=full&geometries=geojson`;


    const res =
      await fetch(url);


    const data =
      await res.json();


    if(
      data.code !== "Ok" ||
      !data.routes?.length
    ){

      alert(
        "لم أجد طريقًا بين المكانين."
      );

      return;

    }


    const route =
      data.routes[0];


    if(routeLayer){

      map.removeLayer(
        routeLayer
      );

    }


    routeLayer =
      L.geoJSON(
        route.geometry,
        {
          style:{
            weight:6
          }
        }
      ).addTo(map);


    map.fitBounds(
      routeLayer.getBounds(),
      {
        padding:[30,30]
      }
    );


    const distanceKm =
      route.distance / 1000;


    const minutes =
      Math.round(
        route.duration / 60
      );


    $("#routeInfo")
      .classList.remove("hidden");


    $("#routeInfo").innerHTML = `
      🛣️ المسافة:
      <b>${distanceKm.toFixed(1)} كم</b>
      &nbsp; • &nbsp;
      ⏱️ الوقت التقريبي:
      <b>${minutes} دقيقة</b>
    `;


  }catch(e){

    console.error(e);

  }

}


/* =========================
   REQUIRE USER
========================= */

function requireUser(){

  if(!auth.currentUser){

    show("auth");

    return false;

  }

  return true;

}


/* =========================
   REQUEST RIDE
========================= */

$("#requestBtn").onclick =
  async () => {

    if(!requireUser()) return;


    if(!fromPlace || !toPlace){

      alert(
        "حدد مكان الركوب ومكان الوصول أولاً."
      );

      return;

    }


    const price =
      Number(
        $("#price").value
      );


    if(!price){

      alert(
        "اكتب السعر المقترح."
      );

      return;

    }


    const u =
      auth.currentUser;


    try{

      const r =
        await addDoc(
          collection(
            db,
            "rides"
          ),
          {

            customerId:
              u.uid,

            customerName:
              u.displayName ||
              "عميل",

            customerPhone:
              u.phoneNumber ||
              "",


            from:
              $("#fromText")
                .textContent,

            to:
              $("#toText")
                .textContent,


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
                $("#passengers")
                  .value || 1
              ),

            notes:
              $("#notes")
                .value,


            status:
              "open",

            createdAt:
              serverTimestamp()

          }
        );


      localStorage.setItem(
        "lastRide",
        r.id
      );


      show("offers");


    }catch(e){

      console.error(e);

      alert(
        "حصلت مشكلة أثناء إنشاء الرحلة."
      );

    }

  };


/* =========================
   CUSTOMER OFFERS
========================= */

async function loadCustomerOffers(){

  if(!auth.currentUser){

    $("#offersList").innerHTML =
      `<div class="card">
        سجل دخولك أولاً لمتابعة الرحلات.
      </div>`;

    return;

  }


  const rideId =
    localStorage.getItem(
      "lastRide"
    );


  if(!rideId){

    $("#offersList").innerHTML =
      `<div class="card">
        لا توجد رحلة حالية.
      </div>`;

    return;

  }


  if(unsubscribeOffers){

    unsubscribeOffers();

  }


  const rideRef =
    doc(
      db,
      "rides",
      rideId
    );


  const snap =
    await getDoc(rideRef);


  if(!snap.exists()) return;


  const ride =
    snap.data();


  $("#offersList").innerHTML = `

    <div class="card">

      <b>
        ${ride.from}
        →
        ${ride.to}
      </b>

      <p class="muted">
        السعر المطلوب:
        ${money(ride.price)}
        •
        ${ride.passengers}
        راكب
      </p>

      <span class="pill">
        ${ride.status}
      </span>

    </div>

    <div id="offerCards"></div>

  `;


  unsubscribeOffers =
    onSnapshot(

      query(
        collection(
          db,
          "rides",
          rideId,
          "offers"
        ),
        orderBy(
          "createdAt",
          "asc"
        )
      ),

      ss => {

        const cards =
          [...ss.docs]
            .map(d => ({
              id:d.id,
              ...d.data()
            }));


        $("#offerCards").innerHTML =
          cards.length

            ? cards.map(o => `

                <div class="card offer">

                  <div>

                    <b>
                      ${o.captainName ||
                      "كابتن"}
                    </b>

                    <div class="muted">
                      ⭐
                      ${o.rating ||
                      "جديد"}
                      •
                      ${o.carModel ||
                      "سيارة"}
                    </div>

                  </div>


                  <div class="price">
                    ${money(o.price)}
                  </div>

                </div>


                <button
                  class="btn green"
                  data-accept="${o.id}"
                  data-ride="${rideId}"
                >
                  قبول العرض
                </button>

              `).join("")

            : `
              <div class="card muted">
                في انتظار عروض الكباتن...
              </div>
            `;


        document
          .querySelectorAll(
            "[data-accept]"
          )
          .forEach(b => {

            b.onclick = () =>
              acceptOffer(
                b.dataset.ride,
                b.dataset.accept
              );

          });

      }

    );

}


/* =========================
   ACCEPT OFFER
========================= */

async function acceptOffer(
  rideId,
  offerId
){

  const o =
    await getDoc(
      doc(
        db,
        "rides",
        rideId,
        "offers",
        offerId
      )
    );


  if(!o.exists()) return;


  const data =
    o.data();


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
        data.captainId,

      captainName:
        data.captainName,

      finalPrice:
        data.price

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

}


/* =========================
   CAPTAIN RIDES
========================= */

function loadCaptainRides(){

  if(!auth.currentUser){

    $("#captainRides").innerHTML =
      `<div class="card">
        سجل دخولك أولاً.
      </div>`;

    return;

  }


  if(currentRole !== "captain"){

    $("#captainRides").innerHTML =
      `<div class="card">
        غيّر الدور إلى «كابتن» من حسابي.
      </div>`;

    return;

  }


  if(unsubscribeRide){

    unsubscribeRide();

  }


  const q =
    query(
      collection(db,"rides"),
      where(
        "status",
        "==",
        "open"
      ),
      orderBy(
        "createdAt",
        "desc"
      ),
      limit(20)
    );


  unsubscribeRide =
    onSnapshot(
      q,
      ss => {

        $("#captainRides").innerHTML =
          ss.docs.length

            ? ss.docs.map(d => {

                const r =
                  d.data();


                return `

                  <div class="card">

                    <b>
                      ${r.from}
                      →
                      ${r.to}
                    </b>

                    <p class="muted">
                      ${r.passengers}
                      راكب
                      •
                      السعر المقترح:
                      ${money(r.price)}
                    </p>


                    ${
                      r.notes
                        ? `
                          <p class="muted">
                            📝 ${r.notes}
                          </p>
                        `
                        : ""
                    }


                    <div class="row">

                      <input
                        id="offer-${d.id}"
                        type="number"
                        placeholder="سعرك"
                      >

                      <button
                        class="btn green"
                        data-offer="${d.id}"
                      >
                        إرسال العرض
                      </button>

                    </div>

                  </div>

                `;

              }).join("")

            : `
              <div class="card muted">
                لا توجد رحلات مفتوحة الآن.
              </div>
            `;


        document
          .querySelectorAll(
            "[data-offer]"
          )
          .forEach(b => {

            b.onclick = () =>
              sendOffer(
                b.dataset.offer
              );

          });

      }
    );

}


/* =========================
   SEND OFFER
========================= */

async function sendOffer(
  rideId
){

  const input =
    $("#offer-" + rideId);


  const price =
    Number(
      input.value
    );


  if(!price){

    alert(
      "اكتب سعرك."
    );

    return;

  }


  const u =
    auth.currentUser;


  const p =
    await getDoc(
      doc(
        db,
        "users",
        u.uid
      )
    );


  const d =
    p.exists()
      ? p.data()
      : {};


  await setDoc(
    doc(
      db,
      "rides",
      rideId,
      "offers",
      u.uid
    ),
    {

      captainId:
        u.uid,

      captainName:
        d.name ||
        u.displayName ||
        "كابتن",

      captainPhone:
        u.phoneNumber ||
        "",

      carModel:
        d.carModel ||
        "سيارة",

      plate:
        d.plate ||
        "",

      rating:
        d.rating ||
        "جديد",

      price,

      createdAt:
        serverTimestamp()

    }
  );


  alert(
    "تم إرسال عرضك للعميل."
  );

}


/* =========================
   TRIP
========================= */

function listenTrip(id){

  if(unsubscribeRide){

    unsubscribeRide();

  }


  unsubscribeRide =
    onSnapshot(
      doc(
        db,
        "rides",
        id
      ),
      s => {

        if(!s.exists()) return;


        const r =
          s.data();


        $("#tripBox").innerHTML = `

          <div class="card">

            <span class="pill">
              ${r.status}
            </span>


            <h3>
              ${r.from}
              →
              ${r.to}
            </h3>


            <p>
              السعر النهائي:
              <b>
                ${money(
                  r.finalPrice ||
                  r.price
                )}
              </b>
            </p>


            <p>
              الكابتن:
              <b>
                ${r.captainName ||
                "—"}
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
              id="backHomeBtn"
            >
              العودة للرئيسية
            </button>

          </div>

        `;


        $("#callCaptainBtn").onclick =
          () => {

            if(r.captainPhone){

              window.location.href =
                `tel:${r.captainPhone}`;

            }else{

              alert(
                "رقم الكابتن غير متوفر."
              );

            }

          };


        $("#backHomeBtn").onclick =
          () => show("home");

      }
    );

}


/* =========================
   PROFILE
========================= */

async function saveUserProfile(){

  if(!auth.currentUser) return;


  const u =
    auth.currentUser;


  const data = {

    name:
      $("#profileNameInput")
        .value
        .trim() ||
      "مستخدم",

    role:
      $("#profileRole")
        .value,

    carModel:
      $("#carModel")
        .value,

    plate:
      $("#plate")
        .value,

    rating:
      "جديد",

    updatedAt:
      serverTimestamp()

  };


  await setDoc(
    doc(
      db,
      "users",
      u.uid
    ),
    data,
    {
      merge:true
    }
  );


  await updateProfile(
    u,
    {
      displayName:
        data.name
    }
  );


  currentRole =
    data.role;


  $("#profileName")
    .textContent =
      data.name;


  $("#profilePhone")
    .textContent =
      u.phoneNumber ||
      "";


  alert(
    "تم حفظ البيانات."
  );

}


$("#saveProfile").onclick =
  saveUserProfile;


/* =========================
   PHONE AUTH
========================= */

$("#sendOtp").onclick =
  async () => {

    try{

      if(!recaptcha){

        recaptcha =
          new RecaptchaVerifier(
            auth,
            "recaptcha",
            {
              size:"normal"
            }
          );

      }


      confirmationResult =
        await signInWithPhoneNumber(
          auth,
          $("#phone")
            .value
            .trim(),
          recaptcha
        );


      $("#otpBox")
        .classList
        .remove("hidden");


      $("#authMsg").innerHTML =
        `<div class="notice">
          تم إرسال الكود.
        </div>`;


    }catch(e){

      console.error(e);


      $("#authMsg").innerHTML =
        `<div class="notice error">
          ${e.message}
        </div>`;

    }

  };


$("#verifyOtp").onclick =
  async () => {

    try{

      if(!confirmationResult){

        alert(
          "اطلب كود التحقق أولاً."
        );

        return;

      }


      await confirmationResult.confirm(
        $("#otp")
          .value
          .trim()
      );


      show("home");


    }catch(e){

      console.error(e);


      $("#authMsg").innerHTML =
        `<div class="notice error">
          الكود غير صحيح.
        </div>`;

    }

  };


$("#logoutBtn").onclick =
  () => signOut(auth);


/* =========================
   AUTH STATE
========================= */

onAuthStateChanged(
  auth,
  async u => {

    if(!u){

      $("#authMini")
        .textContent =
          "👤";

      return;

    }


    $("#authMini")
      .textContent =
        "🟢";


    const s =
      await getDoc(
        doc(
          db,
          "users",
          u.uid
        )
      );


    if(s.exists()){

      const d =
        s.data();


      currentRole =
        d.role ||
        "customer";


      $("#profileName")
        .textContent =
          d.name ||
          u.displayName ||
          "مستخدم";


      $("#profilePhone")
        .textContent =
          u.phoneNumber ||
          "";


      $("#profileNameInput")
        .value =
          d.name ||
          "";


      $("#profileRole")
        .value =
          currentRole;


      $("#carModel")
        .value =
          d.carModel ||
          "";


      $("#plate")
        .value =
          d.plate ||
          "";

    }


    if(
      localStorage.getItem(
        "activeRide"
      )
    ){

      show("trip");

      listenTrip(
        localStorage.getItem(
          "activeRide"
        )
      );

    }

  }
);
