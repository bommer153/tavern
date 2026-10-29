import { describe, expect, it } from 'vitest';
import { assertTransition, priceOrder } from '../src/orders/order-rules.js';
import { sniffImage } from '../src/uploads/uploads.module.js';

describe('order state machine', () => {
  it('allows defined transitions for the right actor', () => {
    expect(() => assertTransition('pending_acceptance', 'accepted', 'companion')).not.toThrow();
    expect(() => assertTransition('in_progress', 'completed', 'system')).not.toThrow();
  });
  it('rejects undefined transitions', () => {
    expect(() => assertTransition('completed', 'in_progress', 'admin')).toThrow(/cannot move/);
    expect(() => assertTransition('declined', 'accepted', 'companion')).toThrow(/cannot move/);
    expect(() => assertTransition('refunded', 'completed', 'admin')).toThrow(/cannot move/);
  });
  it('rejects the wrong actor', () => {
    expect(() => assertTransition('pending_acceptance', 'accepted', 'customer')).toThrow(/cannot move this order/);
    expect(() => assertTransition('accepted', 'in_progress', 'customer')).toThrow();
    expect(() => assertTransition('disputed', 'refunded', 'customer')).toThrow();
  });
});

describe('pricing', () => {
  const s = { commissionPercent: 20, serviceFeePercent: 0, coinValueCentavos: 100 };
  it('computes totals, commission and earnings in integer centavos', () => {
    const p = priceOrder(15_000, 2, s);
    expect(p).toMatchObject({ subtotal: 30_000, serviceFee: 0, total: 30_000, commission: 6_000, companionEarning: 24_000, coins: 300 });
  });
  it('applies service fee and rounds coins up', () => {
    const p = priceOrder(9_999, 1, { ...s, serviceFeePercent: 5 });
    expect(p.serviceFee).toBe(500);
    expect(p.total).toBe(10_499);
    expect(p.coins).toBe(105);
    expect(p.commission + p.companionEarning).toBe(p.subtotal);
  });
});


describe('upload sniffing', () => {
  it('accepts real image signatures and rejects spoofed files', () => {
    expect(sniffImage(Buffer.from('89504e470d0a1a0a0000000d', 'hex'))?.mime).toBe('image/png');
    expect(sniffImage(Buffer.from('ffd8ffe000104a4649460001', 'hex'))?.mime).toBe('image/jpeg');
    expect(sniffImage(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
  });
});
