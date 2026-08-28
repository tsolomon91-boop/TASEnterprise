const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const providedPassword = event.queryStringParameters && event.queryStringParameters.password;
  const realPassword = process.env.ORDERS_PASSWORD;

  if (!realPassword) {
    return { statusCode: 500, body: JSON.stringify({ error: 'ORDERS_PASSWORD not configured on server' }) };
  }

  if (providedPassword !== realPassword) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Incorrect password' }) };
  }

  try {
    const store = getStore('orders');
    const { blobs } = await store.list();

    const orders = await Promise.all(
      blobs.map(async (b) => {
        const data = await store.get(b.key, { type: 'json' });
        return data;
      })
    );

    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orders }),
    };
  } catch (err) {
    console.error('Failed to list orders:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to list orders' }) };
  }
};
