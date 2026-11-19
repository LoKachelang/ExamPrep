const crypto = require('crypto');
const Razorpay = require('razorpay');
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const rzp = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
const DAYS = { trial: 3, m1: 30, m3: 90, m6: 180, m12: 365 };
const reply = (code, body) => ({ statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

exports.handler = async (event) => {
  try {
    const token = (event.headers.authorization || '').replace('Bearer ', '');
    const user = await admin.auth().verifyIdToken(token).catch(() => null);
    if (!user) return reply(401, { error: 'Not signed in' });
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, name, phone } = JSON.parse(event.body || '{}');
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return reply(400, { error: 'Missing fields' });

    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + '|' + razorpay_payment_id).digest('hex');
    const ok = expected.length === razorpay_signature.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature));
    if (!ok) return reply(400, { error: 'Signature mismatch' });          // never mark as paid

    const order = await rzp.orders.fetch(razorpay_order_id);
    if (order.notes.uid !== user.uid || !DAYS[order.notes.plan]) return reply(400, { error: 'Order mismatch' });

    const ref = admin.firestore().doc('users/' + user.uid);
    const snap = await ref.get();
    if (!snap.exists) {
      const days = DAYS[order.notes.plan];
      const ymd = new Date(Date.now() + days * 864e5 + 5.5 * 36e5).toISOString().slice(0, 10); // IST date
      await ref.set({ role: 'student', name: String(name || '').slice(0, 80), email: user.email, phone: String(phone || '').slice(0, 10),
        assignedPlan: 'All-Access', isActive: true,
        validUntil: admin.firestore.Timestamp.fromDate(new Date(ymd + 'T23:59:59+05:30')),
        paymentId: razorpay_payment_id, orderId: razorpay_order_id, planName: order.notes.plan,
        amountPaid: order.amount / 100, signupSource: 'online' });
    }
    return reply(200, { ok: true });
  } catch (e) { return reply(500, { error: 'Verification failed' }); }
};
