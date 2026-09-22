# وصلني المنوفية — نسخة Full-stack Starter

النسخة دي تحول الـ prototype إلى مشروع قابل للربط الفعلي:
- Google Maps + البحث عن أماكن + رسم الطريق.
- Firebase Phone Authentication.
- Firestore للرحلات والعروض والتحديث اللحظي.
- حساب عميل / كابتن.
- عروض أسعار من الكباتن.
- قبول عرض وتحويل الرحلة إلى رحلة جارية.
- بيانات السيارة واللوحة والتقييم.
- قواعد Firestore أولية.

## التشغيل

1. ثبت Node.js.
2. داخل المجلد:
   npm install
   npm run dev

3. انسخ `.env.example` إلى `.env` وضع مفاتيح Firebase وGoogle Maps.

## Firebase
أنشئ مشروع Firebase ثم فعّل:
- Authentication > Phone
- Firestore Database

ضع بيانات Web App في `.env`.

## Google Maps
من Google Cloud فعّل Maps JavaScript API وPlaces API، وأنشئ API key.
ضعه في:
VITE_GOOGLE_MAPS_API_KEY=...

قيّد المفتاح على دومين التطبيق بعد النشر.

## Firestore
انشر `firestore.rules` بعد مراجعتها:
firebase deploy --only firestore:rules

## مهم قبل الإطلاق التجاري
- إضافة Cloud Functions للتحقق من العروض ومنع التلاعب بالسعر/الهوية.
- رفع مستندات الكابتن والتحقق الإداري.
- FCM للإشعارات.
- نظام إلغاء ورسوم وعمولات.
- سجل تدقيق للرحلات.
- حماية إضافية للقواعد ومعدلات الطلب.
- سياسة خصوصية وشروط استخدام.
- ربط بوابة دفع إذا أضيف الدفع الإلكتروني.


## تحويله لتطبيق Android

بعد تثبيت Node.js وAndroid Studio:

```bash
npm install
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

من Android Studio اعمل Build > Generate App Bundle / APK.

### اسم الحزمة
`com.wasselni.monufia.app`

### ملاحظات الإطلاق
- ضع Firebase وGoogle Maps keys في `.env`.
- لا تضع مفاتيح Admin SDK داخل التطبيق.
- للإشعارات الفورية استخدم Firebase Cloud Messaging عبر Cloud Functions/Backend.
- تتبع الموقع يحتاج صلاحيات Android المناسبة وسياسة خصوصية واضحة.
- قبل النشر على Google Play أضف صفحة الخصوصية، شروط الاستخدام، وحذف الحساب.


## الخرائط بدون مفتاح Google
هذه النسخة تستخدم OpenStreetMap للخريطة، وNominatim للبحث عن الأماكن، وOSRM لحساب مسار القيادة. Nominatim يدعم البحث النصي والإحداثيات العكسية، وOSRM يوفر خدمة المسار بين الإحداثيات. يجب الالتزام بسياسات الاستخدام ونسب البيانات للخدمات العامة.
