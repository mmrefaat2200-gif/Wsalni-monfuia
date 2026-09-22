import "./style.css";
import { initializeApp } from "firebase/app";
import {
  getAuth, RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged,
  signOut, updateProfile
} from "firebase/auth";
import {
  getFirestore, collection, addDoc, doc, getDoc, setDoc, updateDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, limit
} from "firebase/firestore";

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
let confirmationResult = null, recaptcha = null, map, routeLayer, fromMarker, toMarker;
let fromPlace = null, toPlace = null, currentRole = "customer", unsubscribeOffers = null, unsubscribeRide = null;

const $ = (s) => document.querySelector(s);
const money = (n) => `${Number(n || 0).toLocaleString("ar-EG")} جنيه`;

document.querySelector("#app").innerHTML = `
<header><div class="logo">وصلني <span>المنوفية</span></div><div id="authMini">👤</div></header>

<section id="home" class="screen">
  <div class="hero"><h2>مشوارك يبدأ من هنا 🚕</h2><p>اطلب رحلة، حدد السعر، وسيب الكباتن يقدموا عروضهم.</p></div>
  <div class="card">
    <div class="map"><div id="map"></div></div>
    <label>📍 مكان الركوب</label><input id="from" placeholder="اكتب مكان الركوب">
    <label>📍 مكان الوصول</label><input id="to" placeholder="اكتب مكان الوصول">
    <div class="row">
      <div><label>💰 السعر المقترح</label><input id="price" type="number" min="1" placeholder="مثال 500"></div>
      <div><label>👥 عدد الركاب</label><input id="passengers" type="number" min="1" max="7" value="1"></div>
    </div>
    <label>📝 ملاحظات للسائق</label><input id="notes" placeholder="مثال: شنطة كبيرة">
    <button class="btn primary" id="requestBtn">🚕 اطلب الرحلة</button>
  </div>
  <div class="row">
    <button class="btn outline" id="myRidesBtn">رحلاتي</button>
    <button class="btn outline" id="loginBtn">تسجيل / دخول</button>
  </div>
</section>

<section id="offers" class="screen hidden">
  <h2>عروض الكباتن</h2><div id="offersList"></div>
</section>

<section id="captain" class="screen hidden">
  <h2>لوحة الكابتن 👨‍✈️</h2>
  <div class="card switch"><b>متاح للرحلات</b><input id="captainAvailable" type="checkbox" checked style="width:auto"></div>
  <div id="captainRides"></div>
</section>

<section id="trip" class="screen hidden">
  <h2>الرحلة الحالية 🚕</h2><div id="tripBox"></div>
</section>

<section id="profile" class="screen hidden">
  <h2>حسابي</h2>
  <div class="card" style="text-align:center"><div class="avatar">👤</div><h3 id="profileName">زائر</h3><div id="profilePhone" class="muted">غير مسجل</div></div>
  <div class="card">
    <label>الاسم</label><input id="profileNameInput">
    <label>الدور</label><select id="profileRole"><option value="customer">عميل</option><option value="captain">كابتن</option></select>
    <label>نوع السيارة (للكابتن)</label><input id="carModel" placeholder="تويوتا كورولا">
    <label>رقم اللوحة (للكابتن)</label><input id="plate" placeholder="مثال: م ن 1234">
    <button class="btn primary" id="saveProfile">حفظ البيانات</button>
    <button class="btn danger" id="logoutBtn">تسجيل الخروج</button>
  </div>
</section>

<section id="auth" class="screen hidden">
  <h2>تسجيل الدخول</h2>
  <p class="muted">سنرسل كود تحقق SMS على رقم هاتفك.</p>
  <div class="card">
    <label>رقم الهاتف</label><input id="phone" placeholder="+2010xxxxxxxx" inputmode="tel">
    <div id="recaptcha"></div>
    <button class="btn primary" id="sendOtp">إرسال الكود</button>
    <div id="otpBox" class="hidden"><label>كود التحقق</label><input id="otp" inputmode="numeric"><button class="btn green" id="verifyOtp">تأكيد</button></div>
    <div id="authMsg"></div>
  </div>
</section>

<nav class="nav">
  <button class="active" data-screen="home">🏠<br>الرئيسية</button>
  <button data-screen="offers">🚕<br>العروض</button>
  <button data-screen="captain">👨‍✈️<br>الكابتن</button>
  <button data-screen="profile">👤<br>حسابي</button>
</nav>`;

function show(id){
  document.querySelectorAll("section.screen").forEach(x=>x.classList.add("hidden"));
  $("#"+id).classList.remove("hidden");
  document.querySelectorAll(".nav button").forEach(b=>b.classList.toggle("active", b.dataset.screen===id));
  window.scrollTo({top:0,behavior:"smooth"});
  if(id==="offers") loadCustomerOffers();
  if(id==="captain") loadCaptainRides();
}
document.querySelectorAll(".nav button").forEach(b=>b.onclick=()=>show(b.dataset.screen));
$("#loginBtn").onclick=()=>show("auth");
$("#myRidesBtn").onclick=()=>show("offers");

async function geocode(query){
  const q = encodeURIComponent(query + ", Egypt");
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=ar&q=${q}`, {
    headers: {"Accept":"application/json"}
  });
  if(!res.ok) throw new Error("تعذر البحث عن المكان");
  return await res.json();
}

function setMarker(which, lat, lng, label){
  const marker = L.marker([lat,lng], {draggable:true}).addTo(map).bindPopup(label).openPopup();
  marker.on("dragend", async ()=>{
    const p=marker.getLatLng();
    const r=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${p.lat}&lon=${p.lng}&accept-language=ar`,{headers:{"Accept":"application/json"}});
    const d=await r.json();
    if(which==="from"){$("#from").value=d.display_name||label; fromPlace={lat:p.lat,lng:p.lng};}
    else {$ ("#to").value=d.display_name||label; toPlace={lat:p.lat,lng:p.lng};}
    drawRoute();
  });
  return marker;
}

async function choosePlace(inputId, which){
  const input=$(inputId), value=input.value.trim();
  if(!value) return;
  try{
    const results=await geocode(value);
    if(!results.length){alert("المكان غير موجود، جرّب كتابة اسم شارع أو منطقة بشكل أوضح.");return;}
    const r=results[0], lat=Number(r.lat), lng=Number(r.lon);
    if(which==="from"){
      fromPlace={lat,lng}; if(fromMarker)map.removeLayer(fromMarker); fromMarker=setMarker("from",lat,lng,"مكان الركوب");
    }else{
      toPlace={lat,lng}; if(toMarker)map.removeLayer(toMarker); toMarker=setMarker("to",lat,lng,"مكان الوصول");
    }
    map.setView([lat,lng],14); drawRoute();
  }catch(e){alert("حصلت مشكلة أثناء البحث عن المكان.");}
}

async function drawRoute(){
  if(!fromPlace || !toPlace) return;
  try{
    const url=`https://router.project-osrm.org/route/v1/driving/${fromPlace.lng},${fromPlace.lat};${toPlace.lng},${toPlace.lat}?overview=full&geometries=geojson`;
    const res=await fetch(url); const data=await res.json();
    if(data.code!=="Ok" || !data.routes?.length){alert("لم أجد طريقًا بين النقطتين.");return;}
    if(routeLayer) map.removeLayer(routeLayer);
    routeLayer=L.geoJSON(data.routes[0].geometry,{style:{weight:6}}).addTo(map);
    map.fitBounds(routeLayer.getBounds(),{padding:[30,30]});
  }catch(e){console.error(e);}
}

function initMaps(){
  map=L.map("map").setView([30.5877,30.5950],10);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
    maxZoom:19,
    attribution:'© OpenStreetMap contributors'
  }).addTo(map);
  $("#from").addEventListener("change",()=>choosePlace("#from","from"));
  $("#to").addEventListener("change",()=>choosePlace("#to","to"));
  $("#from").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();choosePlace("#from","from");}});
  $("#to").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();choosePlace("#to","to");}});
}
initMaps();

function requireUser(){
  if(!auth.currentUser){show("auth");return false} return true;
}

$("#requestBtn").onclick=async()=>{
  if(!requireUser()) return;
  if(!fromPlace || !toPlace){alert("اكتب مكان الركوب والوصول واضغط Enter أو اخرج من الخانة.");return}
  const price=Number($("#price").value);
  if(!price){alert("اكتب السعر المقترح.");return}
  const u=auth.currentUser;
  const r=await addDoc(collection(db,"rides"),{
    customerId:u.uid,customerName:u.displayName||"عميل",customerPhone:u.phoneNumber||"",
    from:$("#from").value,to:$("#to").value,
    fromLat:fromPlace.lat,fromLng:fromPlace.lng,
    toLat:toPlace.lat,toLng:toPlace.lng,
    price,passengers:Number($("#passengers").value||1),notes:$("#notes").value,
    status:"open",createdAt:serverTimestamp()
  });
  localStorage.setItem("lastRide",r.id);
  show("offers");
};

async function loadCustomerOffers(){
  if(!auth.currentUser){$("#offersList").innerHTML='<div class="card">سجل دخولك أولاً لمتابعة الرحلات.</div>';return}
  const rideId=localStorage.getItem("lastRide");
  if(!rideId){$("#offersList").innerHTML='<div class="card">لا توجد رحلة حالية.</div>';return}
  if(unsubscribeOffers) unsubscribeOffers();
  const rideRef=doc(db,"rides",rideId);
  const snap=await getDoc(rideRef);
  if(!snap.exists()){return}
  const ride=snap.data();
  $("#offersList").innerHTML=`<div class="card"><b>${ride.from} → ${ride.to}</b><p class="muted">السعر المطلوب: ${money(ride.price)} • ${ride.passengers} راكب</p><span class="pill">${ride.status}</span></div><div id="offerCards"></div>`;
  unsubscribeOffers=onSnapshot(query(collection(db,"rides",rideId,"offers"),orderBy("createdAt","asc")),ss=>{
    const cards=[...ss.docs].map(d=>({id:d.id,...d.data()}));
    $("#offerCards").innerHTML=cards.length?cards.map(o=>`
      <div class="card offer"><div><b>${o.captainName||"كابتن"}</b><div class="muted">⭐ ${o.rating||"جديد"} • ${o.carModel||"سيارة"}</div></div><div class="price">${money(o.price)}</div></div>
      <button class="btn green" data-accept="${o.id}" data-ride="${rideId}">قبول العرض</button>
    `).join(""):"<div class='card muted'>في انتظار عروض الكباتن...</div>";
    document.querySelectorAll("[data-accept]").forEach(b=>b.onclick=()=>acceptOffer(b.dataset.ride,b.dataset.accept));
  });
}
async function acceptOffer(rideId,offerId){
  const o=await getDoc(doc(db,"rides",rideId,"offers",offerId));
  if(!o.exists())return;
  await updateDoc(doc(db,"rides",rideId),{status:"accepted",acceptedOfferId:offerId,captainId:o.data().captainId,captainName:o.data().captainName,finalPrice:o.data().price});
  localStorage.setItem("activeRide",rideId); show("trip"); listenTrip(rideId);
}

function loadCaptainRides(){
  if(!auth.currentUser){$("#captainRides").innerHTML='<div class="card">سجل دخولك أولاً.</div>';return}
  if(currentRole!=="captain"){$("#captainRides").innerHTML='<div class="card">غيّر الدور إلى «كابتن» من حسابي.</div>';return}
  if(unsubscribeRide) unsubscribeRide();
  const q=query(collection(db,"rides"),where("status","==","open"),orderBy("createdAt","desc"),limit(20));
  unsubscribeRide=onSnapshot(q,ss=>{
    $("#captainRides").innerHTML=ss.docs.length?ss.docs.map(d=>{const r=d.data();return`
      <div class="card">
        <b>${r.from} → ${r.to}</b><p class="muted">${r.passengers} راكب • السعر المقترح: ${money(r.price)}</p>
        ${r.notes?`<p class="muted">📝 ${r.notes}</p>`:""}
        <div class="row"><input id="offer-${d.id}" type="number" placeholder="سعرك"><button class="btn green" data-offer="${d.id}">إرسال العرض</button></div>
      </div>`}).join(""):"<div class='card muted'>لا توجد رحلات مفتوحة الآن.</div>";
    document.querySelectorAll("[data-offer]").forEach(b=>b.onclick=()=>sendOffer(b.dataset.offer));
  });
}
async function sendOffer(rideId){
  const input=$("#offer-"+rideId), price=Number(input.value);
  if(!price){alert("اكتب سعرك.");return}
  const u=auth.currentUser, p=await getDoc(doc(db,"users",u.uid)), d=p.exists()?p.data():{};
  await setDoc(doc(db,"rides",rideId,"offers",u.uid),{
    captainId:u.uid,captainName:d.name||u.displayName||"كابتن",captainPhone:u.phoneNumber||"",
    carModel:d.carModel||"سيارة",plate:d.plate||"",rating:d.rating||"جديد",price,createdAt:serverTimestamp()
  });
  alert("تم إرسال عرضك للعميل.");
}

function listenTrip(id){
  if(unsubscribeRide)unsubscribeRide();
  unsubscribeRide=onSnapshot(doc(db,"rides",id),s=>{
    if(!s.exists())return; const r=s.data();
    $("#tripBox").innerHTML=`<div class="card"><span class="pill">${r.status}</span><h3>${r.from} → ${r.to}</h3><p>السعر النهائي: <b>${money(r.finalPrice||r.price)}</b></p><p>الكابتن: <b>${r.captainName||"—"}</b></p><button class="btn primary" onclick="alert('يمكن ربط الاتصال الهاتفي هنا')">📞 اتصال بالكابتن</button><button class="btn outline" onclick="show('home')">العودة للرئيسية</button></div>`;
  });
}

async function saveUserProfile(){
  if(!auth.currentUser)return;
  const u=auth.currentUser, data={name:$("#profileNameInput").value.trim()||"مستخدم",role:$("#profileRole").value,carModel:$("#carModel").value,plate:$("#plate").value,rating:"جديد",updatedAt:serverTimestamp()};
  await setDoc(doc(db,"users",u.uid),data,{merge:true});
  await updateProfile(u,{displayName:data.name});
  currentRole=data.role; $("#profileName").textContent=data.name; $("#profilePhone").textContent=u.phoneNumber||"";
  alert("تم حفظ البيانات.");
}
$("#saveProfile").onclick=saveUserProfile;

$("#sendOtp").onclick=async()=>{
  try{
    if(!recaptcha)recaptcha=new RecaptchaVerifier(auth,"recaptcha",{size:"normal"});
    confirmationResult=await signInWithPhoneNumber(auth,$("#phone").value.trim(),recaptcha);
    $("#otpBox").classList.remove("hidden"); $("#authMsg").innerHTML='<div class="notice">تم إرسال الكود.</div>';
  }catch(e){$("#authMsg").innerHTML=`<div class="notice error">${e.message}</div>`}
};
$("#verifyOtp").onclick=async()=>{try{await confirmationResult.confirm($("#otp").value.trim());show("home")}catch(e){$("#authMsg").innerHTML=`<div class="notice error">الكود غير صحيح.</div>`}};
$("#logoutBtn").onclick=()=>signOut(auth);

onAuthStateChanged(auth,async(u)=>{
  if(!u){$("#authMini").textContent="👤";return}
  $("#authMini").textContent="🟢";
  const s=await getDoc(doc(db,"users",u.uid));
  if(s.exists()){
    const d=s.data(); currentRole=d.role||"customer";
    $("#profileName").textContent=d.name||u.displayName||"مستخدم";
    $("#profilePhone").textContent=u.phoneNumber||"";
    $("#profileNameInput").value=d.name||"";
    $("#profileRole").value=currentRole;
    $("#carModel").value=d.carModel||""; $("#plate").value=d.plate||"";
  }
  if(localStorage.getItem("activeRide")){show("trip");listenTrip(localStorage.getItem("activeRide"))}
});
