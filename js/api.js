// طبقة نداء دوال الحافة — نظير `ApiService` في تطبيق فلاتر، بنفس العقد
// بالحرف: نفس الترويسات، ونفس تفكيك `{success, data, code, message}`.
// أي رمز خطأ يعيده الخادم (`SCHEDULE_FULL`, `PHONE_VERIFICATION_REQUIRED`,
// `RATE_LIMITED`...) يصل هنا كما يصل للتطبيق — فتُترجم الشاشة نفس الرسائل.

class ApiError extends Error {
  constructor(message, { code = null, statusCode = null, details = {} } = {}) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

const SndkApi = (() => {
  const base = window.SNDK_CONFIG.SUPABASE_URL.replace(/\/+$/, '');

  function functionUrl(name, query = {}) {
    const url = new URL(`${base}/functions/v1/${name}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        url.searchParams.set(key, String(value).trim());
      }
    }
    return url.toString();
  }

  function headers(accessToken) {
    const token = accessToken && accessToken.length > 0
      ? accessToken
      : window.SNDK_CONFIG.SUPABASE_ANON_KEY;
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-App-Version': window.SNDK_CONFIG.APP_VERSION,
      apikey: window.SNDK_CONFIG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    };
  }

  async function decode(response) {
    let decoded;
    try {
      decoded = await response.json();
    } catch (_) {
      throw new ApiError('استجابة غير صالحة من الخادم.', { code: 'BAD_RESPONSE' });
    }
    const success = decoded && decoded.success === true;
    if (!success || response.status >= 400) {
      const details = {};
      if (decoded && decoded.details && typeof decoded.details === 'object') {
        for (const [k, v] of Object.entries(decoded.details)) {
          if (v !== null && v !== undefined) details[k] = String(v);
        }
      }
      throw new ApiError(
        (decoded && decoded.message) || 'فشل الطلب.',
        {
          code: decoded && decoded.code ? String(decoded.code) : null,
          statusCode: response.status,
          details,
        },
      );
    }
    return decoded.data;
  }

  async function getData(name, { query = {}, accessToken = null } = {}) {
    try {
      const response = await fetch(functionUrl(name, query), {
        method: 'GET',
        headers: headers(accessToken),
      });
      return await decode(response);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('لا يوجد اتصال بالإنترنت.', { code: 'OFFLINE' });
    }
  }

  async function postData(name, body, { accessToken = null } = {}) {
    try {
      const response = await fetch(functionUrl(name), {
        method: 'POST',
        headers: headers(accessToken),
        body: JSON.stringify(body),
      });
      return await decode(response);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('لا يوجد اتصال بالإنترنت.', { code: 'OFFLINE' });
    }
  }

  return { getData, postData, ApiError };
})();
