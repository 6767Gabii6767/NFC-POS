# NFC POS

NFC POS este o interfață demonstrativă, mobile-first, pentru introducerea unei sume în RON. Modul implicit este local și nu procesează plăți. Backendul separat este pregătit pentru Stripe Checkout în modul **Test**.

Demo public: <https://6767gabii6767.github.io/NFC-POS/> · Repository: <https://github.com/6767Gabii6767/NFC-POS>

## Structura proiectului

```text
frontend/                 Interfață statică publicabilă pe GitHub Pages
  index.html              Ecranele Plată nouă, Confirmare și Istoric
  styles.css              Stilizare responsive și accesibilă
  app.js                  Tastatură, validare, demo și apeluri API
  config.js               Mod de rulare și URL backend
backend/
  package.json            Dependențe și comenzi Node.js
  src/server.js           API Express, Stripe Checkout și webhook
  src/store.js            SQLite pentru plățile de test confirmate
.github/workflows/
  deploy-pages.yml        Publică automat directorul frontend pe Pages
.env.example              Exemplu de configurare fără secrete
```

## Modul demonstrativ

Deschide `frontend/index.html` sau pornește un server static în directorul `frontend`:

```bash
cd frontend
python -m http.server 8000
```

Accesează `http://localhost:8000`. Introdu o sumă de cel puțin 1,00 RON, apasă **Continuă**, verifică suma și apoi **Confirmă și continuă**. Acțiunea adaugă o tranzacție demonstrativă în istoricul local al browserului și afișează clar că nu s-a efectuat o plată.

## Backend Stripe Test

Ai nevoie de Node.js 20 sau mai nou, de un cont Stripe și de chei din **Test mode**. Proiectul nu conține chei și nu trimite plăți reale.

1. Copiază `.env.example` în `backend/.env` și completează `STRIPE_SECRET_KEY` cu o cheie `sk_test_...`.
2. În terminal:

   ```bash
   cd backend
   npm install
   npm run dev
   ```

3. Pentru dezvoltare locală, instalează Stripe CLI și pornește forwardarea webhook-urilor:

   ```bash
   stripe listen --forward-to localhost:4242/api/webhooks/stripe
   ```

   Copiază valoarea `whsec_...` afișată de Stripe CLI în `STRIPE_WEBHOOK_SECRET` din `backend/.env`, apoi repornește backendul.

4. Pentru a activa checkout-ul de test, schimbă în `frontend/config.js`:

   ```js
   window.NFC_POS_CONFIG = {
     mode: "stripe-test",
     apiBaseUrl: "http://localhost:4242"
   };
   ```

5. Reîncarcă frontendul. Checkout-ul folosește Stripe-hosted Checkout și este setat pentru plăți cu cardul. În Stripe Test poți folosi cardul de test `4242 4242 4242 4242`, o dată viitoare și orice CVC de trei cifre.

Backendul verifică suma primită, limitează cererile de creare Checkout, acceptă numai chei `sk_test_` și verifică semnătura webhook-ului pe corpul HTTP original. O plată apare în istoricul Stripe Test doar după un eveniment semnat `checkout.session.completed` sau `checkout.session.async_payment_succeeded` cu `payment_status: paid` și `livemode: false`. Pagina de revenire interoghează backendul; URL-ul de succes nu confirmă singur plata.

Datele confirmate sunt salvate în `backend/data/nfc-pos.sqlite`. Tranzacțiile demonstrative rămân în `localStorage` și au secțiune separată. Plățile Stripe Test sunt tranzacții de test, nu încasări reale.

### Configurare pentru un frontend găzduit

GitHub Pages servește doar fișiere statice; **backendul trebuie găzduit separat** într-un serviciu care permite un server Node.js și păstrează variabilele de mediu și discul SQLite. În `backend/.env`, setează `FRONTEND_URL` la URL-ul exact al paginii frontendului (inclusiv calea repository-ului și `/` final) și adaugă originea GitHub Pages în `FRONTEND_ORIGINS`, de exemplu:

```env
FRONTEND_URL=https://utilizator.github.io/NFC-POS/
FRONTEND_ORIGINS=https://utilizator.github.io
```

În `frontend/config.js`, setează `mode: "stripe-test"` și `apiBaseUrl` la URL-ul HTTPS al backendului. Configurează în Stripe un endpoint webhook de test pentru `checkout.session.completed` și `checkout.session.async_payment_succeeded`; folosește secretul `whsec_...` al acelui endpoint în backend. Păstrează `STRIPE_SECRET_KEY` și `STRIPE_WEBHOOK_SECRET` numai în mediul privat al backendului. Nu înlocui cheia `sk_test_` cu una `sk_live_`: backendul blochează pornirea cu o cheie live.

## Publicare frontend pe GitHub Pages

Workflow-ul din `.github/workflows/deploy-pages.yml` publică directorul `frontend` la fiecare push pe branch-ul `main` sau `master`. În repository, deschide **Settings → Pages** și selectează **GitHub Actions** ca sursă de publicare. Deploy-ul backendului se configurează separat și nu este făcut de GitHub Pages.

## API

- `GET /api/health` — statusul backendului și dacă există o cheie de test configurată.
- `POST /api/checkout-sessions` — creează o sesiune Checkout; primește `{ "amountBani": 1250 }`.
- `GET /api/checkout-sessions/:sessionId` — returnează `paid` numai pentru sesiuni înregistrate prin webhook-ul verificat.
- `GET /api/transactions` — listează cel mult 100 de plăți Stripe Test confirmate.
- `POST /api/webhooks/stripe` — validează semnătura Stripe și înregistrează evenimentele de plată reușite.

## Siguranța configurării

Fișierul `.env` și baza de date locală sunt ignorate de Git. Nu adăuga chei, date de card sau tranzacții reale în repository. Această versiune nu activează procesarea plăților live și nu conține flux pentru chei `sk_live_`.
