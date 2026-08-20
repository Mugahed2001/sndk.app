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

  return {
    isLoggedIn,
    currentUser,
    validAccessToken,
    signIn,
    signUp,
    signOut,
    onChange,
  };
})();
