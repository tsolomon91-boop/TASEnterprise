const store = getStore({
      name: 'orders',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN,
    });

// Environment variables you must set in Netlify (Site settings -> Environment variables):
// WHATSAPP_TOKEN        - the Meta access token
// WHATSAPP_PHONE_ID     - the Phone Number ID (the number that SENDS the message)
// WHATSAPP_TO_NUMBER    - your WhatsApp number that should RECEIVE order alerts, in international format e.g. 18765639559
// ORDERS_PASSWORD       - password used to view the orders page

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let order;
  try {
    order = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  if (!order.customerName || !order.items || !order.total) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required order fields (customerName, items, total)' }) };
  }

  const timestamp = new Date().toISOString();
  const orderId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const fullOrder = {
    id: orderId,
    createdAt: timestamp,
    customerName: order.customerName,
    phone: order.phone || '',
    address: order.address || '',
    items: order.items,
    total: order.total,
    notes: order.notes || '',
    status: 'new',
  };

  try {
    const store = getStore('orders');
    await store.setJSON(orderId, fullOrder);
  } catch (err) {
    console.error('Failed to save order:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to save order' }) };
  }

  const itemsText = order.items
    .map((it) => `- ${it.name} x${it.qty}${it.price ? ` ($${it.price})` : ''}`)
    .join('\n');

  const messageBody =
    `🧾 New Order!\n\n` +
    `Customer: ${order.customerName}\n` +
    `Phone: ${order.phone || 'N/A'}\n` +
    `Address: ${order.address || 'N/A'}\n\n` +
    `Items:\n${itemsText}\n\n` +
    `Total: $${order.total}\n` +
    (order.notes ? `Notes: ${order.notes}\n\n` : '\n') +
    `Order ID: ${orderId}`;

  let whatsappStatus = 'skipped';
  try {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;
    const toNumber = process.env.WHATSAPP_TO_NUMBER;

    if (token && phoneId && toNumber) {
      const resp = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: toNumber,
          type: 'text',
          text: { body: messageBody },
        }),
      });

      const respJson = await resp.json();
      if (!resp.ok) {
        console.error('WhatsApp send failed:', respJson);
        whatsappStatus = 'failed';
      } else {
        whatsappStatus = 'sent';
      }
    } else {
      console.warn('WhatsApp env vars not fully configured; skipping WhatsApp send.');
    }
  } catch (err) {
    console.error('WhatsApp send error:', err);
    whatsappStatus = 'error';
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, orderId, whatsappStatus }),
  };
};
