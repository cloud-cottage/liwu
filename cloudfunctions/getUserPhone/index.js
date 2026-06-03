const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = async (event = {}) => {
  try {
    const code = String(event.code || event.phoneCode || '').trim();
    if (!code) {
      return {
        ok: false,
        error: 'missing_code'
      };
    }

    const result = await cloud.openapi.phonenumber.getPhoneNumber({
      code
    });

    const phoneInfo = result && result.phone_info ? result.phone_info : {};
    const phoneNumber = String(phoneInfo.phoneNumber || phoneInfo.purePhoneNumber || '').trim();

    if (!phoneNumber) {
      return {
        ok: false,
        error: 'empty_phone_number',
        raw: result
      };
    }

    return {
      ok: true,
      phoneNumber,
      phoneInfo
    };
  } catch (error) {
    const errCode = error && (error.errCode || error.errcode) ? (error.errCode || error.errcode) : '';
    const errMsg = error && (error.errMsg || error.message) ? (error.errMsg || error.message) : 'get_user_phone_failed';
    return {
      ok: false,
      error: errCode ? `get_phone_failed:${errCode}:${errMsg}` : errMsg,
      stack: error && error.stack ? error.stack : ''
    };
  }
};
