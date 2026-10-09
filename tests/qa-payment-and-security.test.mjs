import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function timingSafeEqualStrings(a, b) {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

function calculateWompiIntegrity(reference, amountInCents, currency, integritySecret) {
  const text = `${reference}${amountInCents}${currency}${integritySecret}`;
  return crypto.createHash('sha256').update(text).digest('hex');
}

function verifyWompiChecksum(payload, eventsSecret) {
  if (!payload?.signature?.properties || typeof payload?.signature?.checksum !== 'string') {
    return false;
  }
  let concatenated = '';
  for (const propPath of payload.signature.properties) {
    const parts = propPath.split('.');
    let val = payload.data;
    for (const part of parts) {
      val = val?.[part];
    }
    concatenated += String(val ?? '');
  }
  const timestamp = payload.timestamp ?? payload.sent_at ?? '';
  concatenated += String(timestamp) + eventsSecret;
  const calculated = crypto.createHash('sha256').update(concatenated).digest('hex');
  return timingSafeEqualStrings(calculated.toLowerCase(), payload.signature.checksum.toLowerCase());
}

function computeFinancialBreakdown(totalCop, provider = 'wompi', commissionRate = 0.03) {
  const platformFeeCop = Math.round(totalCop * commissionRate);
  const isCash = String(provider).toLowerCase().trim() === 'cash';
  const rawWompiBase = isCash ? 0 : totalCop * 0.0265 + 700;
  const gatewayFeeCop = isCash ? 0 : Math.round(rawWompiBase * 1.19);
  const gatewayIvaCop = isCash ? 0 : Math.max(0, gatewayFeeCop - Math.round(rawWompiBase));
  const restaurantPayoutCop = Math.max(0, totalCop - platformFeeCop - gatewayFeeCop);
  return { platformFeeCop, gatewayFeeCop, gatewayIvaCop, restaurantPayoutCop };
}

describe('GastroSync QA Hardening — Payment & Security Suite', () => {
  it('calcula firma de integridad SHA-256 de Wompi y comparación timing-safe correctamente', () => {
    const sig = calculateWompiIntegrity('GS_PAY_12345678_1700000000', 4500000, 'COP', 'prod_integrity_secret_xyz');
    assert.equal(sig.length, 64);
    assert.equal(timingSafeEqualStrings(sig, sig), true);
    assert.equal(timingSafeEqualStrings(sig, sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0')), false);
    assert.equal(timingSafeEqualStrings(sig, 'short'), false);
  });

  it('verifica checksum oficial de eventos webhook de Wompi y rechaza alteraciones de monto', () => {
    const secret = 'wompi_events_secret_test';
    const timestamp = 1712690000;
    const raw = `tx_999APPROVED4500000${timestamp}${secret}`;
    const validChecksum = crypto.createHash('sha256').update(raw).digest('hex');

    const payload = {
      data: {
        transaction: {
          id: 'tx_999',
          status: 'APPROVED',
          amount_in_cents: 4500000,
          currency: 'COP',
          reference: 'GS_PAY_12345678'
        }
      },
      timestamp,
      signature: {
        properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'],
        checksum: validChecksum
      }
    };

    assert.equal(verifyWompiChecksum(payload, secret), true);

    // Si alguien altera amount_in_cents en el payload, el checksum falla inmediatamente
    const tampered = structuredClone(payload);
    tampered.data.transaction.amount_in_cents = 10000;
    assert.equal(verifyWompiChecksum(tampered, secret), false);
  });

  it('calcula el desglose financiero exacto (3% libre GastroSync + pasarela Wompi 2.65% + $700 + IVA 19%)', () => {
    const digital = computeFinancialBreakdown(100000, 'wompi', 0.03);
    assert.equal(digital.platformFeeCop, 3000);
    // Base Wompi: 100000 * 0.0265 + 700 = 3350; con IVA 19%: ROUND(3350 * 1.19) = 3987
    assert.equal(digital.gatewayFeeCop, 3987);
    assert.equal(digital.gatewayIvaCop, 637);
    assert.equal(digital.restaurantPayoutCop, 100000 - 3000 - 3987);

    const cash = computeFinancialBreakdown(100000, 'cash', 0.03);
    assert.equal(cash.platformFeeCop, 3000);
    assert.equal(cash.gatewayFeeCop, 0);
    assert.equal(cash.gatewayIvaCop, 0);
    assert.equal(cash.restaurantPayoutCop, 97000);
  });

  it('verifica que la migración 054 impone índice único parcial y search_path en funciones SECURITY DEFINER', () => {
    const sqlPath = path.join(ROOT, 'supabase', 'migrations', '054_qa_security_and_payment_hardening.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_one_approved_per_order/i);
    assert.match(sql, /ON public\.payments\s*\(order_id\)\s*WHERE status = 'approved'/i);
    assert.match(sql, /CREATE TRIGGER trg_guard_payment_intent_insert/i);
    assert.match(sql, /ALTER FUNCTION %I\.%I\(%s\) SET search_path = public/i);
  });

  it('verifica que create-payment, payment-webhook y application-assets no tienen fallbacks inseguros', () => {
    const createPayment = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'create-payment', 'index.ts'), 'utf8');
    assert.equal(createPayment.includes('pub_test_Q5y1F3WwWLu1G2A1z0y3Z5'), false, 'No debe tener WOMPI_PUBLIC_KEY hardcodeada');
    assert.equal(createPayment.includes('test_integrity_secret_placeholder'), false, 'No debe tener WOMPI_INTEGRITY_SECRET hardcodeado');
    assert.match(createPayment, /\.update\(\{\s*status:\s*'voided'\s*\}\)/);

    const webhook = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'payment-webhook', 'index.ts'), 'utf8');
    assert.match(webhook, /function timingSafeEqualStrings/);
    assert.match(webhook, /parsedAmountInCents <= 0/);

    const appAssets = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'application-assets', 'index.ts'), 'utf8');
    assert.match(appAssets, /Deno\.env\.get\('ALLOWED_ORIGINS'\)/);
    assert.match(appAssets, /status:\s*403/);
  });

  it('verifica que App.tsx envuelve las vistas lazy en ErrorBoundary y el modo Demo tiene datos coherentes para t1', () => {
    const appTsx = fs.readFileSync(path.join(ROOT, 'src', 'App.tsx'), 'utf8');
    assert.match(appTsx, /<ErrorBoundary moduleName="Aplicación Principal">/);
    assert.match(appTsx, /<ErrorBoundary moduleName="Servicio en Mesa QR">/);

    const defaultData = fs.readFileSync(path.join(ROOT, 'src', 'context', 'defaultData.ts'), 'utf8');
    assert.match(defaultData, /id:\s*'t1'/);
    assert.match(defaultData, /tenantId:\s*'t1'/);
  });

  it('verifica las defensas de la Ronda 2 (migración 055 Storage RLS + reembolso en cancelación, validación de avatar, paginación del feed y preservación de rol)', () => {
    const sql055 = fs.readFileSync(
      path.join(ROOT, 'supabase', 'migrations', '055_qa_round2_storage_and_feed_hardening.sql'),
      'utf8'
    );
    assert.match(sql055, /CREATE POLICY "gastro_media_insert_authenticated"/);
    assert.match(sql055, /\(string_to_array\(name, '\/'\)\)\[2\] = auth\.uid\(\)::text/);
    assert.match(sql055, /UPDATE public\.payments[\s\S]*SET status = 'refunded'[\s\S]*AND status = 'approved'/);

    const authSvc = fs.readFileSync(path.join(ROOT, 'src', 'services', 'supabaseAuthService.ts'), 'utf8');
    assert.match(authSvc, /ALLOWED_AVATAR_MIMES/);
    assert.match(authSvc, /AVATAR_MAX_BYTES = 5 \* 1024 \* 1024/);
    assert.match(authSvc, /avatars\/\$\{cleanUserId\}\//);
    assert.match(authSvc, /cached\?\.role/);

    const dataSvc = fs.readFileSync(path.join(ROOT, 'src', 'services', 'supabaseDataService.ts'), 'utf8');
    assert.match(dataSvc, /fetchLivePosts\(limit: number = 40, offset: number = 0\)/);
    assert.match(dataSvc, /\.range\(safeOffset, safeOffset \+ safeLimit - 1\)/);

    const errBoundary = fs.readFileSync(path.join(ROOT, 'src', 'components', 'ErrorBoundary.tsx'), 'utf8');
    assert.match(errBoundary, /this\.props\.moduleName/);
  });
});

