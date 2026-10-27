'use strict';
// Project startup template: prepare the same canvas context without a logo,
// progress-bar animation, image downloads or animation-frame waits.
/**
 * 创建并清空小游戏的 WebGL 启动画布。
 */
function start(alpha, antialias, useWebgl2) {
  const options = {
    alpha: alpha === 'true', antialias: antialias !== 'false',
    depth: true, stencil: true, premultipliedAlpha: false,
    preserveDrawingBuffer: false, powerPreference: 'default', failIfMajorPerformanceCaveat: false
  };
  const surface = window.canvas;
  let context = useWebgl2 === 'true' ? surface.getContext('webgl2', options) : null;
  window.WebGL2RenderingContext = !!context;
  if (!context) context = surface.getContext('webgl', options);
  if (context) {
    context.clearColor(1, 240 / 255, 212 / 255, 1);
    context.clear(context.COLOR_BUFFER_BIT);
  }
  return Promise.resolve();
}
/**
 * 满足启动模板的进度接口。
 */
function setProgress() {return Promise.resolve();}
/**
 * 满足启动模板的完成接口。
 */
function end() {return Promise.resolve();}
module.exports = {start, setProgress, end};
