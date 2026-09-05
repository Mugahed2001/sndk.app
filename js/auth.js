// الجلسة — نظير `AuthService` في التطبيق: تخزين محلي، وتجديد صامت قبل
// الانتهاء بدل انتظار ٤٠١. `localStorage` هنا مكافئ لتخزين التوكن الآمن في
// التطبيق (كلاهما على جهاز المستخدم نفسه، ولا مخدَّم وسيط يحمل الجلسة).

const SndkAuth = (() => {
  const STORAGE_KEY = 'sndk_session';

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function save(session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  function clear() {
    localStorage.removeItem(STORAGE_KEY);
  }

  let session = load();
  const listeners = new Set();

  function notify() {
    for (const fn of listeners) fn(session);
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function currentUser() {
    return session ? session.profile || null : null;
  }

  /// معرّف المستخدم الخام — لوسم أحداث التتبّع (js/track.js) بمن كان مسجَّلاً
  /// دخوله *لحظة وقوع الحدث*، لا لحظة إرسال الدُفعة. مزامن عمداً: التتبّع لا
  /// ينتظر أي شيء، فلا رمز وصول متجدَّد هنا — القيمة المخزَّنة حالياً تكفي.
  function currentUserId() {
    return session ? session.user_id || null : null;
  }

  /// رمز الوصول المخزَّن حالياً بلا تجديد — لتذييل طلب التتبّع بترويسة
  /// Authorization فقط، لا لأي عملية حسّاسة تحتاج توكناً ساري المفعول يقيناً.
  function currentAccessTokenSync() {
    return session ? session.access_token || null : null;
  }

  function isLoggedIn() {
    return !!(session && session.access_token);
  }

  // ينضج قبل الانتهاء بدقيقتين — نفس هامش الأمان المستعمل في التطبيق، كي لا
  // يبدأ حجزٌ بتوكن ينتهي أثناء إرساله.
  function isExpiringSoon() {
    if (!session || !session.expires_at) return true;
    const expiresAtMs = Number(session.expires_at) * 1000;
    return Date.now() > expiresAtMs - 120000;
  }

  async function validAccessToken() {
    if (!session) return null;
    if (!isExpiringSoon()) return session.access_token;
    if (!session.refresh_token) return session.access_token;

    try {
      const data = await SndkApi.postData('refresh-token', {
        refresh_token: session.refresh_token,
      });
      session = {
        ...session,
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at,
      };
      save(session);
      return session.access_token;
    } catch (_) {
      // فشل التجديد لا يُسقط الجلسة فوراً — القراءات تكمل بتوكن قد يرفضه
      // الخادم فيصل خطأ واضح (`UNAUTHENTICATED`) يقود لإعادة الدخول، بدل
      // مسح جلسة قد تكون سليمة لمجرّد انقطاع شبكة لحظي أثناء التجديد.
      return session.access_token;
    }
  }

  async function fetchProfile(accessToken) {
    const data = await SndkApi.getData('get-profile', { accessToken });
    return data;
  }

  async function signIn(email, password) {
    const data = await SndkApi.postData('sign-in', {
      email: email.trim().toLowerCase(),
      password,
    });
    session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      user_id: data.user_id,
      email: data.email,
      profile: data.profile || null,
    };
    save(session);
    if (!session.profile) {
      try {
        session.profile = await fetchProfile(session.access_token);
        save(session);
      } catch (_) {
        /* الجلسة صالحة حتى بلا ملف — الاسم يُعرض فارغاً لا أكثر */
      }
    }
    notify();
    return session;
  }

  async function signUp(fullName, email, password) {
    const data = await SndkApi.postData('sign-up', {
      email: email.trim().toLowerCase(),
      password,
      profile_data: { full_name: fullName.trim(), role: 'user' },
    });
    if (data.requires_confirmation === true) {
      return { requiresConfirmation: true };
    }
    session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      user_id: data.user_id,
      email: data.email,
      profile: data.profile || null,
    };
    save(session);
    notify();
    return { requiresConfirmation: false };
  }

  function signOut() {
    session = null;
    clear();
    notify();
  }

  /// يُعيد جلب الملف الشخصي ويستبدل اللقطة المخزَّنة — لتغييرٍ حدث خادمياً
  /// بعد الدخول (توثيق رقم الهاتف مثالاً) ولا سبب لانتظار خروج/دخول جديدَين
  /// كي ينعكس. فشلٌ هنا لا يُسقط الجلسة — يُعاد الملف القديم كما هو.
  async function refreshProfile() {
    if (!session) return null;
    try {
      const profile = await fetchProfile(await validAccessToken());
      session = { ...session, profile };
      save(session);
      notify();
      return profile;
    } catch (_) {
      return session.profile;
    }
  }

  // خروج تلقائي بعد خمول — الجلسة مخزَّنة في localStorage (يقرأها أي سكربت
  // يعمل في الصفحة)، فتقليص عمرها الفعلي على المتصفّح يقلّل نافذة استغلال
  // توكن مسروق بثغرة XSS مستقبلية أو جهازاً تُرك مفتوحاً — قبل أي حساب
  // مدير نظام/مدير مرافق يُضاف لاحقاً، حيث الخطر أعلى بكثير من جلسة مريض.
  // ليست بديلاً عن انتهاء التوكن الحقيقي من الخادم — إجراء دفاعي إضافي فقط.
  const IDLE_TIMEOUT_MS = 20 * 60 * 1000;
  let idleTimer = null;

  function stopIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function resetIdleTimer() {
    if (!isLoggedIn()) return;
    stopIdleTimer();
    idleTimer = setTimeout(() => {
      signOut();
      window.location.reload();
    }, IDLE_TIMEOUT_MS);
  }

  ['mousedown', 'keydown', 'touchstart', 'scroll'].forEach((evt) => {
    window.addEventListener(evt, resetIdleTimer, { passive: true });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resetIdleTimer();
  });

  onChange((s) => { if (s) resetIdleTimer(); else stopIdleTimer(); });
  if (isLoggedIn()) resetIdleTimer();

  return {
    isLoggedIn,
    currentUser,
    currentUserId,
    currentAccessTokenSync,
    validAccessToken,
    signIn,
    signUp,
    signOut,
    refreshProfile,
    onChange,
  };
})();
