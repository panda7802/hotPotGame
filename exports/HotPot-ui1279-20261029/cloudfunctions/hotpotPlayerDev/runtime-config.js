'use strict';
const {normalizeRuntimeConfig} = require('./RuntimeConfig');

/** Clients can only read this document; operators edit it in CloudBase. */
exports.readRuntimeConfig = async (db) => {
  try {
    const result = await db.collection('hotpot_config_dev').doc('runtime').get();
    const document = Array.isArray(result.data) ? result.data[0] : result.data;
    return {ok: true, config: normalizeRuntimeConfig(document)};
  } catch (error) {
    console.warn('[HotPot] Using default runtime configuration', error.message);
    return {ok: true, config: normalizeRuntimeConfig(null)};
  }
};
