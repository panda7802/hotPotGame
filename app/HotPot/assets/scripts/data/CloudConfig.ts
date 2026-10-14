/** 开发分支专用；用户已授权共用环境但只新增 Dev 资源。此处不放任何密钥。 */
export const CLOUD_CONFIG = {
    enabled: true,
    environmentId: 'hotpot-d9g7g17ifb99bdd1b',
    regionsFileId: 'cloud://hotpot-d9g7g17ifb99bdd1b.686f-hotpot-d9g7g17ifb99bdd1b-1252911381/res/regions.json',
    allowSharedEnvironment: true,
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
    if (!config.regionsFileId.startsWith(`cloud://${config.environmentId}.`)) throw new Error('地区文件必须来自开发云环境');
    if (config.functionName !== 'hotpotPlayerDev' || config.collectionName !== 'hotpot_players_dev') throw new Error('开发云函数或集合名称错误');
}
