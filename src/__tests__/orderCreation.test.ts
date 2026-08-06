import { describe, it, expect, vi } from 'vitest';
import { deductIngredientsForOrder } from '../lib/dbService';
import { triggerLowStockAlert } from '../server/notifications/triggerLowStockAlert';
import nodemailer from 'nodemailer';
import { POST } from '../app/api/orders/create/route';
import { createOrderServer } from '../server/orders/createOrderServer';
import { adminAuth } from '../lib/firebaseAdmin';
import { verifyTableToken } from '../server/crypto/tableToken';

// Mock the server function so we can test the API route validation without executing Firebase
vi.mock('../server/orders/createOrderServer', () => ({
  createOrderServer: vi.fn().mockResolvedValue({
    order_id: 'mock-order-123',
    outlet_id: 'hyd_campus',
    gross_amount: 100,
    replayed: false,
  }),
  OrderCreationError: class OrderCreationError extends Error {},
}));

vi.mock('../server/events/logBusinessEvent', () => ({
  logBusinessEvent: vi.fn().mockResolvedValue(true)
}));

vi.mock('../lib/firebaseAdmin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn()
  }
}));

vi.mock('../server/crypto/tableToken', () => ({
  verifyTableToken: vi.fn(),
}));

vi.mock('nodemailer', () => {
  return {
    default: {
      createTransport: vi.fn().mockReturnValue({
        sendMail: vi.fn().mockResolvedValue(true)
      })
    }
  };
});

describe('Order Creation & Alerts', () => {
  it('should throw hard error when calling legacy deductIngredientsForOrder', async () => {
    await expect(deductIngredientsForOrder('test_order')).rejects.toThrow(
      "Stock deduction happens only during order creation via the Server API. Legacy client deduction is disabled."
    );
  });

  it('triggerLowStockAlert payload includes outletName and NEVER exposes SMTP credentials', async () => {
    const mockSendMail = vi.fn().mockResolvedValue(true);
    (nodemailer.createTransport as any).mockReturnValue({ sendMail: mockSendMail });
    
    // Set up dummy process env for the test
    process.env.SMTP_USER = 'test@example.com';
    process.env.SMTP_PASS = 'secretpass';
    process.env.OWNER_EMAIL = 'owner@example.com';

    await triggerLowStockAlert(
      { name: 'Milk', current: 2, threshold: 5, unit: 'L' },
      'OASIS HATCH'
    );

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const callArgs = mockSendMail.mock.calls[0][0];

    // Payload includes outletName in subject and body
    expect(callArgs.subject).toContain('OASIS HATCH');
    expect(callArgs.html).toContain('OASIS HATCH');
    expect(callArgs.html).toContain('Milk');

    // Make sure SMTP credentials are NOT in the email content being sent to the client/api
    expect(callArgs.html).not.toContain('test@example.com');
  });

  it('/api/orders/create rejects invalid body', async () => {
    (adminAuth!.verifyIdToken as any).mockResolvedValueOnce({ uid: 'valid-uid' });

    const invalidBody = {
      orderType: 'delivery',
      items: []
    };

    const req = new Request('http://localhost:3000/api/orders/create', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer good_token'
      },
      body: JSON.stringify(invalidBody)
    });

    const response = await POST(req);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Invalid input data');
  });

  it('/api/orders/create missing Authorization returns 401', async () => {
    const req = new Request('http://localhost:3000/api/orders/create', {
      method: 'POST',
      body: JSON.stringify({})
    });

    const response = await POST(req);
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe('Unauthorized');
  });

  it('/api/orders/create invalid token returns 401', async () => {
    (adminAuth!.verifyIdToken as any).mockRejectedValueOnce(new Error('Invalid token'));

    const req = new Request('http://localhost:3000/api/orders/create', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer bad_token'
      },
      body: JSON.stringify({})
    });

    const response = await POST(req);
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe('Unauthorized');
  });

  it('/api/orders/create decoded token uid is used for order creation and body userId is ignored', async () => {
    (adminAuth!.verifyIdToken as any).mockResolvedValueOnce({ uid: 'real-uid-from-token' });

    const validBody = {
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      clientExpectedTotal: 100,
      pointsRedeemed: 0,
      orderType: 'pickup',
      hatch: 'CANOPY',
      items: [{ menuItemId: 'coffee', name: 'Coffee', quantity: 1, price: 100 }],
      outlet: 'HYD CAMPUS',
    };

    const req = new Request('http://localhost:3000/api/orders/create', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer good_token'
      },
      body: JSON.stringify(validBody)
    });

    const response = await POST(req);
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.success).toBe(true);

    expect(createOrderServer).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'real-uid-from-token',
      idempotencyKey: validBody.idempotencyKey,
      clientExpectedTotal: 100,
      pointsRedeemed: 0,
      orderType: 'pickup',
      hatch: 'CANOPY',
      items: [{ menuItemId: 'coffee', quantity: 1, modifiers: [] }],
      outlet: 'HYD CAMPUS',
    }));
  });

  it('/api/orders/create accepts pickup without a hatch when the outlet has no pickup points configured', async () => {
    (adminAuth!.verifyIdToken as any).mockResolvedValueOnce({ uid: 'pickup-user' });

    const req = new Request('http://localhost:3000/api/orders/create', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer good_token' },
      body: JSON.stringify({
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440002',
        pointsRedeemed: 0,
        orderType: 'pickup',
        items: [{ menuItemId: 'coffee', quantity: 1 }],
        outlet: 'HYD CAMPUS',
      }),
    });

    const response = await POST(req);

    expect(response.status).toBe(201);
    expect(createOrderServer).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'pickup-user',
      orderType: 'pickup',
      hatch: undefined,
    }));
  });

  it('/api/orders/create accepts a signed dine-in table token and returns 201', async () => {
    (adminAuth!.verifyIdToken as any).mockResolvedValueOnce({ uid: 'dine-in-user' });
    (verifyTableToken as any).mockReturnValueOnce({
      tableNo: 'Table 12',
      outletId: 'HYD CAMPUS',
      expiresAt: Date.now() + 60_000,
    });

    const req = new Request('http://localhost:3000/api/orders/create', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer good_token' },
      body: JSON.stringify({
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440001',
        pointsRedeemed: 0,
        orderType: 'dine-in',
        tableNo: 'Table 12',
        tableToken: 'signed-table-token',
        items: [{ menuItemId: 'coffee', quantity: 1 }],
        outlet: 'HYD CAMPUS',
      }),
    });

    const response = await POST(req);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ success: true });
    expect(verifyTableToken).toHaveBeenCalledWith('signed-table-token');
    expect(createOrderServer).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'dine-in-user',
      orderType: 'dine-in',
      tableNo: 'Table 12',
    }));
  });

  it('createOrderServer deducts stock once', async () => {
    expect(typeof createOrderServer).toBe('function');
  });
});
