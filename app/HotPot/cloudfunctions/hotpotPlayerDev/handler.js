'use strict';

const crypto = require('crypto');
const {handleLeaderboard, cookingLeaderboard} = require('./leaderboard');
const {COOKING_CATALOG, RECIPES} = require('./CookingData');
const {cookingRankTime, stampCookingRecords} = require('./CookingProgress');
const {readRuntimeConfig} = require('./runtime-config');
const RELEASE_ENVIRONMENT_ID = 'hotpot-d9g7g17ifb99bdd1b';

async function readDocument(reference) {
  try {
    const response = await reference.get();
    return Array.isArray(response.data) ? response.data[0] : response.data;
  } catch (error) {
    // A missing document is expected, but permission and connection errors are not.
    if (!/document.*(not exist|not found)|doc.*does not exist/i.test(
      String(error.errMsg || error.message || ''),
    )) throw error;
    return undefined;
  }
}

const nicknameDocument = nickname => 'nickname_' + crypto.createHash('sha256')
  .update(nickname.toLowerCase()).digest('hex');

async function reserveNickname(collection, reference, current, nickname, owner) {
  const profile = current.state.profile;
  const nextKey = nicknameDocument(nickname);
  const claimReference = collection.doc(nextKey);
  const claim = await readDocument(claimReference);
  if (claim && claim.playerId !== current.playerId) {
    return {ok: false, code: 'NICKNAME_TAKEN'};
  }
  if (profile.nickname === nickname && claim) {
    return {ok: true, playerId: current.playerId, nickname,
      nicknameRevision: profile.nicknameRevision};
  }
  const oldKey = profile.nickname && nicknameDocument(profile.nickname);
  const oldReference = oldKey && oldKey !== nextKey ? collection.doc(oldKey) : undefined;
  const oldClaim = oldReference && await readDocument(oldReference);
  const nicknameRevision = (profile.nicknameRevision || 0) + 1;
  const state = {...current.state, profile: {...profile, nickname, nicknameRevision}};
  const {_id, ...record} = current;
  await claimReference.set({data: {playerId: current.playerId}});
  if (oldClaim?.playerId === current.playerId) await oldReference.remove();
  await reference.set({data: {...record, ...owner, state, nickname, updatedAt: Date.now()}});
  return {ok: true, playerId: current.playerId, nickname, nicknameRevision};
}

/**
 * 从平台上下文读取身份；event 中的 openid/playerId/env 永远不用于选取档案。
 */
/**
 * 构造处理玩家档案和地区请求的云函数。
 */
exports.createHandler = function createHandler(
  cloud,
  settings,
  domain,
  regions,
  runtimeEnvironment,) {
  /**
   * 在当前操作完成后更新相关游戏状态。
   */
  return async function main(event = {}) {
    const context = cloud.getWXContext();
    if (!settings.enabled
      || !settings.environmentId ||
      (settings.environmentId === RELEASE_ENVIRONMENT_ID &&
        !settings.allowSharedEnvironment) ||
      (context.ENV || runtimeEnvironment) !== settings.environmentId ||
      (runtimeEnvironment && runtimeEnvironment !== settings.environmentId) ||
      settings.collectionName !== 'hotpot_players_dev') {
      return {ok: false, code: 'DEVELOPMENT_ENV_REQUIRED'};
    }
    // 微信关联环境也会给网页请求附带本应用 APPID，身份仍由 TCB UID 确认。
    const web = !context.OPENID
      && (!context.APPID || context.APPID === settings.appId)
      && typeof context.UID === 'string'
      && /^[a-zA-Z0-9_-]{1,128}$/.test(context.UID);
    if (!web && (!context.OPENID || context.APPID !== settings.appId)) {
      return {ok: false, code: 'IDENTITY_REQUIRED'};
    }
    if (!['load', 'save', 'regions', 'leaderboard', 'regionWin', 'config', 'cookingLeaderboard', 'renamePlayer']
      .includes(event.action)) {
      return {ok: false, code: 'INVALID_ACTION'};
    }
    if (event.action === 'config') {
      return readRuntimeConfig(cloud.database({env: settings.environmentId}));
    }
    if (event.action === 'regions') {
      if (!settings.regionsFileId) {
        return {ok: true, regions: domain.validateRegions(regions)};
      }
      if (!settings.regionsFileId?.startsWith(
          `cloud://${settings.environmentId}.`,
        )) {
        return {ok: false, code: 'INVALID_REGION_FILE'};
      }
      try {
        // 原文件不开放权限、不改写；由新增云函数读取公开地区选项。
        const downloaded = await cloud.downloadFile({
          fileID: settings.regionsFileId,
        });
        if (downloaded.fileContent.length > 100000) {
          throw new Error('Region file too large');
        }
        return {
          ok: true,
          regions: domain.validateRegions(
            JSON.parse(downloaded.fileContent.toString('utf8')),
          ),
        };
      } catch {
        return {ok: false, code: 'REGION_FILE_UNAVAILABLE'};
      }
    }
    const playerId = crypto
      .createHash('sha256')
      .update(web ? `web:${context.UID}`
        : `${context.APPID}:${context.OPENID}`)
      .digest('hex')
      .slice(0, 32);
    if (['leaderboard', 'regionWin'].includes(event.action)) {
      return handleLeaderboard(
        cloud.database({env: settings.environmentId}),
        event, playerId, domain, regions,
      );
    }
    const nickname = event.action === 'renamePlayer' ? domain.normalizePlayerNickname(event.nickname) : undefined;
    if (event.action === 'renamePlayer' && !nickname) return {ok: false, code: 'INVALID_NICKNAME'};
    let state;
    if (event.action === 'save') {
      if (!Number.isSafeInteger(event.expectedRevision)
        || event.expectedRevision < 0 ||
        typeof event.mutationId !== 'string' ||
        !/^[a-z0-9-]{8,80}$/.test(event.mutationId)) {
        return {ok: false, code: 'INVALID_REQUEST'};
      }
      try {
        if (Buffer.byteLength(JSON.stringify(event.state), 'utf8') > 100000) {
          throw new Error('Too large');
        }
        state = domain.validatePlayerState(event.state, regions);
      } catch {
        return {ok: false, code: 'INVALID_STATE'};
      }
    }
    const db = cloud.database({env: settings.environmentId});
    if (event.action === 'cookingLeaderboard') {
      return {...await cookingLeaderboard(db, playerId, event.scope),
        progressVersion: domain.PROGRESS_VERSION, playSessionVersion: domain.PLAY_SESSION_VERSION};
    }
    try {
      /**
       * 在数据库事务中读取并更新玩家档案。
       */
      const transactionResult = await db.runTransaction(async (transaction) => {
        const collection = transaction.collection(settings.collectionName);
        const reference = collection.doc(playerId);
        const stored = await readDocument(reference);
        const current = stored
          ? {
              ...stored,
              state: domain.validatePlayerState(stored.state, regions),
            }
          : {
              playerId,
              revision: 0,
              state: domain.emptyPlayerState(),
              updatedAt: Date.now(),
              lastMutationId: '',
            };
        if (stored && (web ? stored._webUid !== context.UID
          : stored._openid !== context.OPENID)) {
          throw new Error('Owner mismatch');
        }
        const owner = web ? {_webUid: context.UID} : {_openid: context.OPENID};
        if (event.action === 'renamePlayer') {
          return reserveNickname(collection, reference, current, nickname, owner);
        }
        /**
         * 处理 expose 对应的游戏逻辑。
         */
        const expose = (record) => ({
          playerId,
          revision: record.revision,
          state: record.state,
          updatedAt: record.updatedAt,
          lastMutationId: record.lastMutationId,
        });
        if (event.action === 'load') {
          if (!stored) {
            await reference.set({data: {...current, ...owner}});
          }
          return {
            ok: true,
            progressVersion: domain.PROGRESS_VERSION,
            playSessionVersion: domain.PLAY_SESSION_VERSION,
            cashoutSyncVersion: domain.CASHOUT_SYNC_VERSION,
            achievementSyncVersion: domain.ACHIEVEMENT_SYNC_VERSION,
            player: expose(current),
          };
        }
        if (current.lastMutationId === event.mutationId) {
          return {
            ok: true,
            progressVersion: domain.PROGRESS_VERSION,
            playSessionVersion: domain.PLAY_SESSION_VERSION,
            cashoutSyncVersion: domain.CASHOUT_SYNC_VERSION,
            achievementSyncVersion: domain.ACHIEVEMENT_SYNC_VERSION,
            player: expose(current),
          };
        }
        if (current.revision !== event.expectedRevision) {
          return {
            ok: true,
            progressVersion: domain.PROGRESS_VERSION,
            playSessionVersion: domain.PLAY_SESSION_VERSION,
            cashoutSyncVersion: domain.CASHOUT_SYNC_VERSION,
            achievementSyncVersion: domain.ACHIEVEMENT_SYNC_VERSION,
            conflict: true,
            player: expose(current),
          };
        }
        // 兼容仍在运行的旧客户端：其请求没有 progress，也不能清空永久图鉴和成就。
        const nextState = {
          ...state,
          profile: {...current.state.profile, regionCodes: state.profile.regionCodes},
          ...(state.cashout === undefined && current.state.cashout !== undefined
            ? {cashout: current.state.cashout} : {}),
          progress: domain.mergeProgress(
            current.state.progress,
            state.progress,
          ),
        };
        const now = Date.now();
        const cooking = nextState.progress.cooking;
        if (cooking) stampCookingRecords(current.state.progress.cooking, cooking, now);
        const allDiscovered = cooking && RECIPES.every(dish => dish.ingredients.every(
          ([id]) => nextState.progress.discovered.includes(id),
        ));
        const rankTime = allDiscovered ? cookingRankTime(cooking) : 0;
        const next = {
          playerId,
          revision: current.revision + 1,
          state: nextState,
          updatedAt: now,
          lastMutationId: event.mutationId,
          ...owner,
          ...(nextState.profile.nickname ? {nickname: nextState.profile.nickname} : {}),
          ...(rankTime ? {
            cookingCatalog: COOKING_CATALOG,
            cookingRankAt: rankTime,
            cookingProvince: nextState.profile.regionCodes[0] || '',
            cookingCity: nextState.profile.regionCodes[1] || '',
          } : {}),
        };
        await reference.set({data: next});
        return {
          ok: true,
          progressVersion: domain.PROGRESS_VERSION,
          playSessionVersion: domain.PLAY_SESSION_VERSION,
          cashoutSyncVersion: domain.CASHOUT_SYNC_VERSION,
          achievementSyncVersion: domain.ACHIEVEMENT_SYNC_VERSION,
          player: expose(next),
        };
      });
      return {...(transactionResult.result || transactionResult), cookingSyncVersion: 1,
        progressVersion: domain.PROGRESS_VERSION, playSessionVersion: domain.PLAY_SESSION_VERSION};
    } catch {
      // 响应不包含 OpenID、原始异常或数据库内容。
      return {ok: false, code: 'DATABASE_UNAVAILABLE'};
    }
  };
};
