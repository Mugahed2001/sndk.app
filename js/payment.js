// نيّة الدفع — نظير payment_service.dart بالحرف: `create-payment` لا يقبل
// من العميل غير `booking_id` (المبلغ يُحسب ويُجمَّد في القاعدة)، و`payment-status`
// هو مصدر الحقيقة الوحيد للنتيجة — لا عودة المستخدم من البوّابة، ولا أي جوابٍ
// آخر. البنية مطابقة لـ`payment_status_transitions` في القاعدة (نسخة مرآة لا
// فرض — الفرض في القاعدة وحدها).

const PAYMENT_IN_FLIGHT = new Set(['created', 'pending', 'processing', 'requires_action', 'unknown']);
const PAYMENT_SETTLED = new Set(['paid', 'partially_refunded']);

const SndkPayment = (() => {
  async function openPayment(bookingId, idempotencyKey) {
    return SndkApi.postData('create-payment', {
      booking_id: bookingId,
      idempotency_key: idempotencyKey,
    }, { accessToken: await SndkAuth.validAccessToken() });
  }

  async function refreshStatus(reference) {
    return SndkApi.postData('payment-status', { reference }, {
      accessToken: await SndkAuth.validAccessToken(),
    });
  }

  /// يستقصي النتيجة بتأخيرٍ متصاعد (٢ث ← ١٥ث كحدّ أقصى) حتى تستقرّ الحالة أو
  /// تنقضي ثلاث دقائق — نفس جدول `PaymentService.watch` بالحرف، فيبقى حِمل
  /// `paystatus` على الحافة كما صُمِّم له (عشرون نداءً لا تسعون).
  async function watch(reference, onUpdate, { timeoutMs = 180000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    let delay = 2000;
    const maxDelay = 15000;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, delay));
      let fresh;
      try {
        fresh = await refreshStatus(reference);
      } catch (_) {
        // خطأ استقصاءٍ واحد لا يُنهي المتابعة — نفس منطق العميل الأصلي.
        delay = Math.min(delay * 1.6, maxDelay);
        continue;
      }
      onUpdate(fresh);
      if (!PAYMENT_IN_FLIGHT.has(fresh.status)) return;
      delay = Math.min(delay * 1.6, maxDelay);
    }
    onUpdate(null); // إشارة انقضاء مهلة المتابعة بلا حالة نهائية — "timed_out".
  }

  return { openPayment, refreshStatus, watch };
})();
