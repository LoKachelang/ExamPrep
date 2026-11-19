const Razorpay = require('razorpay');
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const rzp = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
const AMOUNT = { trial: 900, m1: 2900, m3: 5900, m6: 9900, m12: 14900 }; // paise
const reply = (code, body) => ({ statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

exports.handler = async (event) => {
  try {
    const token = (event.headers.authorization || '').replace('Bearer ', '');
    const user = await admin.auth().verifyIdToken(token).catch(() => null);
    if (!user) return reply(401, { error: 'Not signed in' });
    const { plan } = JSON.parse(event.body || '{}');
    const amount = AMOUNT[plan];
    if (!amount || amount < 100) return reply(400, { error: 'Invalid plan' });
    const order = await rzp.orders.create({ amount, currency: 'INR',
      receipt: user.uid.slice(0, 20) + '_' + Date.now(), notes: { plan, uid: user.uid } });
    
    return reply(200, { order_id: order.id, amount: order.amount, currency: order.currency, key_id: process.env.rzp_test_U258g08SRTxfuN });
  } catch (e) { return reply(500, { error: 'Could not create order' }); }
};
