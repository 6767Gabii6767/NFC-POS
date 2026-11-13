import "dotenv/config";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import Stripe from "stripe";
import { findTestCheckout, listTestTransactions, recordPaidTestCheckout } from "./store.js";

const app = express();
const port = Number(process.env.PORT || 4242);
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:8000/";
const secretKey = process.env.STRIPE_SECRET_KEY || "";
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

if (secretKey && !secretKey.startsWith("sk_test_")) {
  throw new Error("NFC POS acceptă doar STRIPE_SECRET_KEY cu prefixul sk_test_. Cheile live sunt blocate.");
}

const allowedOrigins = (process.env.FRONTEND_ORIGINS || "http://localhost:8000,http://127.0.0.1:8000,http://localhost:5500")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Originea frontendului nu este permisă de CORS."));
  }
};

let stripeClient;
function getStripe() {
  if (!secretKey) return null;
  stripeClient ||= new Stripe(secretKey);
  return stripeClient;
}

app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors(corsOptions));

// Stripe requires the untouched request body to verify the webhook signature.
app.post("/api/webhooks/stripe", express.raw({ type: "application/json", limit: "1mb" }), (request, response) => {
  const stripe = getStripe();
  const signature = request.headers["stripe-signature"];
  if (!stripe || !webhookSecret) {
    return response.status(503).json({ error: "Webhook-ul Stripe Test nu este configurat." });
  }
  if (!signature) return response.status(400).json({ error: "Lipsește semnătura Stripe." });

  let event;
  try {
    event = stripe.webhooks.constructEvent(request.body, signature, webhookSecret);
  } catch (error) {
    console.warn("Semnătura webhook Stripe nu a putut fi verificată:", error.message);
    return response.status(400).json({ error: "Semnătura webhook nu este validă." });
  }

  if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
    recordPaidTestCheckout(event, event.data.object);
  }
  return response.json({ received: true });
});

app.use(express.json({ limit: "20kb" }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, mode: "demo-and-stripe-test", checkoutConfigured: Boolean(secretKey) });
});

const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Prea multe încercări. Așteaptă câteva minute și încearcă din nou." }
});

app.post("/api/checkout-sessions", checkoutLimiter, async (request, response) => {
  const stripe = getStripe();
  if (!stripe) return response.status(503).json({ error: "Checkout-ul Stripe Test nu este configurat pe server." });

  const { amountBani } = request.body || {};
  if (!Number.isSafeInteger(amountBani) || amountBani < 100 || amountBani > 99_999_999) {
    return response.status(400).json({ error: "Suma trebuie să fie între 1,00 și 999.999,99 RON." });
  }

  try {
    const baseUrl = new URL(frontendUrl);
    const successUrl = new URL("?payment=stripe-return&session_id={CHECKOUT_SESSION_ID}", baseUrl).toString();
    const cancelUrl = new URL("?payment=canceled", baseUrl).toString();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "ron",
          unit_amount: amountBani,
          product_data: { name: "Plată NFC POS (Stripe Test)" }
        }
      }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { source: "nfc-pos-demo" }
    });
    if (!session.url) return response.status(502).json({ error: "Stripe nu a returnat un link Checkout." });
    return response.status(201).json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error("Nu s-a putut crea sesiunea Checkout:", error.message);
    return response.status(502).json({ error: "Stripe Test nu a putut crea sesiunea. Verifică configurarea serverului." });
  }
});

app.get("/api/checkout-sessions/:sessionId", (request, response) => {
  const { sessionId } = request.params;
  if (!/^cs_test_[A-Za-z0-9_]+$/.test(sessionId)) {
    return response.status(400).json({ error: "Identificator Stripe Test invalid." });
  }
  const transaction = findTestCheckout(sessionId);
  if (!transaction || transaction.livemode !== 0) return response.json({ status: "pending" });
  return response.json({ status: "paid", amountBani: transaction.amountBani, currency: transaction.currency });
});

app.get("/api/transactions", (_request, response) => {
  response.set("Cache-Control", "no-store");
  response.json({ transactions: listTestTransactions() });
});

app.use((error, _request, response, _next) => {
  if (error.message?.includes("CORS")) return response.status(403).json({ error: error.message });
  console.error("Eroare neașteptată în backend:", error.message);
  return response.status(500).json({ error: "A apărut o eroare în backend." });
});

app.listen(port, () => {
  console.log(`NFC POS backend disponibil pe http://localhost:${port}`);
  console.log(secretKey ? "Stripe Test este configurat." : "Modul demo este disponibil; Stripe Test nu este configurat.");
});
