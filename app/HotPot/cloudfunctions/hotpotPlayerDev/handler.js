'use strict';

const crypto = require('crypto');
const RELEASE_ENVIRONMENT_ID = 'hotpot-d9g7g17ifb99bdd1b';

/** 从平台上下文读取身份；event 中的 openid/playerId/env 永远不用于选取档案。 */
exports.createHandler = /** 构造处理玩家档案和地区请求的云函数。 */ function createHandler(cloud, settings, domain, regions, runtimeEnvironment) {
    return /** 在当前操作完成后更新相关游戏状态。 */ async function main(event = {}) {
        const context = cloud.getWXContext();
        if (!settings.enabled || !settings.environmentId || (settings.environmentId === RELEASE_ENVIRONMENT_ID && !settings.allowSharedEnvironment) ||
            (context.ENV || runtimeEnvironment) !== settings.environmentId ||
            (runtimeEnvironment && runtimeEnvironment !== settings.environmentId) || settings.collectionName !== 'hotpot_players_dev') {
            return {ok: false, code: 'DEVELOPMENT_ENV_REQUIRED'};
        }
        if (!context.OPENID || context.APPID !== settings.appId) return {ok: false, code: 'IDENTITY_REQUIRED'};
        if (!['load', 'save', 'regions'].includes(event.action)) return {ok: false, code: 'INVALID_ACTION'};
        if (event.action === 'regions') {
            if (!settings.regionsFileId) return {ok: true, regions: domain.validateRegions(regions)};
            if (!settings.regionsFileId?.startsWith(`cloud://${settings.environmentId}.`)) return {ok: false, code: 'INVALID_REGION_FILE'};
            try {
                // 原文件不开放权限、不改写；由新增云函数读取公开地区选项。
                const downloaded = await cloud.downloadFile({fileID: settings.regionsFileId});
                if (downloaded.fileContent.length > 100000) throw new Error('Region file too large');
                return {ok: true, regions: domain.validateRegions(JSON.parse(downloaded.fileContent.toString('utf8')))};
            } catch { return {ok: false, code: 'REGION_FILE_UNAVAILABLE'}; }
        }
        const playerId = crypto.createHash('sha256').update(`${context.APPID}:${context.OPENID}`).digest('hex').slice(0, 32);
        let state;
        if (event.action === 'save') {
            if (!Number.isSafeInteger(event.expectedRevision) || event.expectedRevision < 0 ||
                typeof event.mutationId !== 'string' || !/^[a-z0-9-]{8,80}$/.test(event.mutationId)) {
                return {ok: false, code: 'INVALID_REQUEST'};
            }
            try {
                if (Buffer.byteLength(JSON.stringify(event.state), 'utf8') > 100000) throw new Error('Too large');
                state = domain.validatePlayerState(event.state, regions);
            } catch { return {ok: false, code: 'INVALID_STATE'}; }
        }
        const db = cloud.database({env: settings.environmentId});
        try {
            const transactionResult = await db.runTransaction(/** 在数据库事务中读取并更新玩家档案。 */ async transaction => {
                const reference = transaction.collection(settings.collectionName).doc(playerId);
                let stored;
                try {
                    const response = await reference.get();
                    stored = Array.isArray(response.data) ? response.data[0] : response.data;
                } catch (error) {
                    // 仅忽略文档不存在；集合缺失、权限问题、网络错误必须报告失败。
                    const message = String(error.errMsg || error.message || '');
                    if (!/document.*(not exist|not found)|doc.*does not exist/i.test(message)) throw error;
                }
                const current = stored ? {...stored, state: domain.validatePlayerState(stored.state, regions)} :
                    {playerId, revision: 0, state: domain.emptyPlayerState(),
                    updatedAt: Date.now(), lastMutationId: ''};
                if (stored && stored._openid !== context.OPENID) throw new Error('Owner mismatch');
                const expose = /** 处理 expose 对应的游戏逻辑。 */ record => ({playerId, revision: record.revision, state: record.state,
                    updatedAt: record.updatedAt, lastMutationId: record.lastMutationId});
                if (event.action === 'load') {
                    if (!stored) await reference.set({data: {...current, _openid: context.OPENID}});
                    return {ok: true, progressVersion: domain.PROGRESS_VERSION, playSessionVersion: domain.PLAY_SESSION_VERSION, player: expose(current)};
                }
                if (current.lastMutationId === event.mutationId) {
                    return {ok: true, progressVersion: domain.PROGRESS_VERSION, playSessionVersion: domain.PLAY_SESSION_VERSION, player: expose(current)};
                }
                if (current.revision !== event.expectedRevision) {
                    return {ok: true, progressVersion: domain.PROGRESS_VERSION, playSessionVersion: domain.PLAY_SESSION_VERSION, conflict: true, player: expose(current)};
                }
                // 兼容仍在运行的旧客户端：其请求没有 progress，也不能清空永久图鉴和成就。
                const nextState = {...state, progress: domain.mergeProgress(current.state.progress, state.progress)};
                const next = {playerId, revision: current.revision + 1, state: nextState,
                    updatedAt: Date.now(), lastMutationId: event.mutationId, _openid: context.OPENID};
                await reference.set({data: next});
                return {ok: true, progressVersion: domain.PROGRESS_VERSION, playSessionVersion: domain.PLAY_SESSION_VERSION, player: expose(next)};
            });
            return transactionResult.result || transactionResult;
        } catch {
            // 响应不包含 OpenID、原始异常或数据库内容。
            return {ok: false, code: 'DATABASE_UNAVAILABLE'};
        }
    };
};
