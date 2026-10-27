'use strict';
Object.defineProperty(exports, '__esModule', {value: true});
exports.validateRegions = validateRegions;
exports.regionPath = regionPath;
const PlayerTypes_1 = require('./PlayerTypes');
/**
 * 验证地区树的编码、名称和层级。
 */
function validateRegions(value) {
  const seen = new Set();
  /**
   * 处理 walk 对应的游戏逻辑。
   */
  const walk = (items, depth) => {
    (0, PlayerTypes_1.check)(
      Array.isArray(items) &&
        items.length > 0 &&
        items.length <= 200 &&
        depth <= 3,
      '地区数据格式错误',
    );
    /**
     * 将当前条目转换为后续处理所需的值。
     */
    return items.map((item) => {
      (0, PlayerTypes_1.check)(
        item &&
          typeof item.code === 'string' &&
          /^[A-Z0-9_]{1,20}$/.test(item.code) &&
          typeof item.name === 'string' &&
          item.name.length > 0 &&
          item.name.length <= 30 &&
          !seen.has(item.code),
        '地区节点格式错误',
      );
      seen.add(item.code);
      const node = {code: item.code, name: item.name};
      if (item.children !== undefined) {
        node.children = walk(item.children, depth + 1);
      }
      return node;
    });
  };
  return walk(value, 1);
}
/**
 * 根据地区编码解析地区树中的路径。
 */
function regionPath(regions, codes, allowEmpty = true) {
  (0, PlayerTypes_1.check)(
    Array.isArray(codes) &&
      codes.length <= 3 &&
      (allowEmpty || codes.length > 0),
    '请选择完整地区',
  );
  const result = [];
  let nodes = regions;
  /**
   * 依次处理集合中的每个条目。
   */
  codes.forEach((code) => {
    /**
     * 按条件筛选或判断条目：item.code === code。
     */
    const selected = nodes.find((item) => item.code === code);
    (0, PlayerTypes_1.check)(selected, '地区代码或上下级关系错误');
    result.push(selected);
    nodes = selected.children || [];
  });
  (0, PlayerTypes_1.check)(
    codes.length === 0 || nodes.length === 0,
    '请选择完整地区',
  );
  return result;
}
