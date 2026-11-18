'use strict';
const crypto = require('crypto');
const {COOKING_CATALOG} = require('./CookingData');
// 复用已配置为仅管理员可读写的开发集合，独立文档不覆盖任何玩家档案。
const COLLECTION = 'hotpot_players_dev';

exports.cookingLeaderboard = async function (db, playerId, scope) {
  if (![0, 1, 2].includes(scope)) return {ok: false, code: 'INVALID_REQUEST'};
  try {
    const collection = db.collection(COLLECTION);
    const filter = {cookingCatalog: COOKING_CATALOG};
    if (scope) {
      const player = await read(collection.doc(playerId));
      const region = player?.state?.profile?.regionCodes?.[scope - 1];
      if (!region) return {ok: false, code: 'REGION_REQUIRED'};
      filter[scope === 1 ? 'cookingProvince' : 'cookingCity'] = region;
    }
    const result = await collection.where(filter)
      .orderBy('cookingRankAt', 'asc').orderBy('playerId', 'asc').limit(30)
      .field({playerId: true, cookingRankAt: true, nickname: true}).get();
    return {ok: true, rows: result.data.map(row => ({playerId: row.playerId,
      at: row.cookingRankAt, ...(row.nickname ? {nickname: row.nickname} : {})}))};
  } catch {
    return {ok: false, code: 'DATABASE_UNAVAILABLE'};
  }
};

async function read(reference) {
  try {
    const result = await reference.get();
    return Array.isArray(result.data) ? result.data[0] : result.data;
  } catch (error) {
    const message = String(error.errMsg || error.message || '');
    if (!/document.*(not exist|not found)|doc.*does not exist/i.test(message)) {
      throw error;
    }
    return null;
  }
}

/** 仅返回地区累计数，不暴露玩家身份或存档。 */
exports.handleLeaderboard = async function (
  db, event, playerId, domain, regions,
) {
  let win;
  let path;
  if (event.action === 'regionWin') {
    try {
      if (Buffer.byteLength(JSON.stringify(event.win), 'utf8') > 100000) {
        throw new Error('Too large');
      }
      win = domain.validatePlayerState({
        profile: {regionCodes: event.win.regionCodes},
        save: event.win.save,
        playDate: event.win.playDate,
      }, regions);
      path = domain.regionPath(regions, win.profile.regionCodes, false);
      if (win.save?.levelIndex !== 2 || win.save.status !== 'won') {
        throw new Error('Not a completed final level');
      }
    } catch {
      return {ok: false, code: 'INVALID_WIN'};
    }
  }
  try {
    const response = await db.runTransaction(async (transaction) => {
      const collection = transaction.collection(COLLECTION);
      const summaryRef = collection.doc('region_ranking_summary_v1');
      const summary = await read(summaryRef);
      const counts = {...summary?.counts};
      if (win) {
        // 地区不参与去重：改地区或在另一台设备恢复同一局不能重复加分。
        const id = crypto.createHash('sha256').update(JSON.stringify([
          playerId, win.save.runId || [
            win.save.layoutSeed || 0, win.save.ingredientSeed || 0,
          ],
        ])).digest('hex');
        const receipt = collection.doc(`region_win_${id}`);
        if (!await read(receipt)) {
          for (const region of path) {
            counts[region.code] = (counts[region.code] || 0) + 1;
          }
          await receipt.set({data: {countedAt: Date.now()}});
          await summaryRef.set({data: {counts, updatedAt: Date.now()}});
        }
      }
      return {
        ok: true,
        progressVersion: domain.PROGRESS_VERSION,
        playSessionVersion: domain.PLAY_SESSION_VERSION,
        counts,
      };
    });
    return response.result || response;
  } catch {
    return {ok: false, code: 'DATABASE_UNAVAILABLE'};
  }
};
