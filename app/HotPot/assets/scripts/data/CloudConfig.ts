/** 开发分支专用；使用小游戏所属账号的独立微信云开发环境，不存放密钥。 */
export const CLOUD_CONFIG = {
    enabled: true,
    environmentId: 'cloud1-d2gc9q7cobffff893',
    // 新环境直接使用随包地区数据；不跨账号访问旧环境的私有文件。
    regionsFileId: '',
    allowSharedEnvironment: false,
    functionName: 'hotpotPlayerDev',
    collectionName: 'hotpot_players_dev',
    appId: 'wx943cc2d81ec6f820',
};
export const RELEASE_ENVIRONMENT_ID = 'hotpot-d9g7g17ifb99bdd1b';

export function validateDevelopmentConfig(config = CLOUD_CONFIG): void {
    if (!config.enabled) throw new Error('开发云环境尚未配置');
    if (!config.environmentId || (config.environmentId === RELEASE_ENVIRONMENT_ID && !config.allowSharedEnvironment)) {
        throw new Error('必须使用独立开发云环境，或明确授权只新增 Dev 资源');
    }
    if (config.regionsFileId && !config.regionsFileId.startsWith(`cloud://${config.environmentId}.`)) throw new Error('地区文件必须来自开发云环境');
    if (config.functionName !== 'hotpotPlayerDev' || config.collectionName !== 'hotpot_players_dev') throw new Error('开发云函数或集合名称错误');
}
