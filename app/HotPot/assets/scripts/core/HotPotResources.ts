import {
  AudioClip,
  AudioSource,
  Node,
  Rect,
  resources,
  SpriteFrame,
  Texture2D,
} from 'cc';

import {INGREDIENT_ART} from '../data/IngredientArt';
import {loadReferenceTileSkins} from './HotPotTileSkin';

import {HotPotState} from './HotPotState';

import {
  BGM_VOLUME,
  drawControlIcon,
  EFFECT_VOLUME,
  GameAudio,
} from './HotPotUi';

/**
 * HotPotResources：拆分后的后段场景行为。
 */
export abstract class HotPotResources extends HotPotState {
  /**
   * 加载背景音乐和音效并设置播放源。
   */
  protected setupAudio(): void {
    const bgmNode = new Node('BgmAudio');
    this.node.addChild(bgmNode);
    this.bgmSource = bgmNode.addComponent(AudioSource);
    this.bgmSource.loop = true;
    this.bgmSource.volume = BGM_VOLUME;

    const effectNode = new Node('EffectAudio');
    this.node.addChild(effectNode);
    this.effectSource = effectNode.addComponent(AudioSource);
    this.effectSource.volume = EFFECT_VOLUME;

    this.node.on(Node.EventType.TOUCH_START, this.startBgmIfReady, this);

    const audioAssets: Array<{
      /**
       * key 对应的状态或配置。
       */ key: GameAudio;
      /**
       * path 对应的状态或配置。
       */ path: string;
    }> = [
      {key: 'bgm', path: 'audio/bgm'},
      {key: 'match', path: 'audio/match'},
      {key: 'win', path: 'audio/win'},
      {key: 'lose', path: 'audio/lose'},
    ];
    audioAssets.forEach(
      /**
       * 依次处理集合中的每个条目。
       */ ({key, path}) => {
        resources.load(
          path,
          AudioClip,
          /**
           * 在资源加载完成后更新有效节点或处理失败。
           */ (error, clip) => {
            if (error || !clip) {
              console.error(`[HotPotGame] 无法加载音频：${path}`, error);
              return;
            }
            this.audioClips.set(key, clip);
            if (key === 'bgm') {
              this.bgmSource.clip = clip;
            }
          },
        );
      },
    );
  }

  /**
   * 在允许播放时启动背景音乐。
   */
  protected startBgmIfReady(): void {
    if (!this.soundEnabled || !this.bgmSource?.clip || this.bgmSource.playing) {
      return;
    }
    this.bgmSource.play();
  }

  /**
   * 切换声音状态并更新按钮显示。
   */
  protected toggleSound(): void {
    this.soundEnabled = !this.soundEnabled;
    this.soundButtonLabel.string = this.soundEnabled ? '声音：开' : '声音：关';
    const soundIcon =
      this.soundButtonLabel.node.parent?.getChildByName('ControlIcon');
    if (soundIcon) {
      drawControlIcon(soundIcon, false, this.soundEnabled);
    }
    this.effectSource.volume = this.soundEnabled ? EFFECT_VOLUME : 0;
    if (this.soundEnabled) {
      this.startBgmIfReady();
    } else {
      this.bgmSource.pause();
      this.effectSource.stop();
    }
  }

  /**
   * 按指定音量播放游戏音效。
   */
  protected playEffect(key: Exclude<GameAudio, 'bgm'>, volume: number): void {
    if (!this.soundEnabled) {
      return;
    }
    const clip = this.audioClips.get(key);
    if (clip) {
      // 使用可停止的音源，关闭声音时也能立即停止当前音效。
      this.effectSource.stop();
      this.effectSource.clip = clip;
      this.effectSource.volume = volume * EFFECT_VOLUME;
      this.effectSource.play();
    }
  }

  /**
   * Both transparent sheets are shared by every theme. Run completion once,
   * after all 50 frame rectangles have been created.
   */
  protected loadIngredientImages(done: () => void): void {
    let pending = INGREDIENT_ART.length;
    INGREDIENT_ART.forEach((types, sheet) => {
      const path = 'ingredients/food-' + (sheet ? 'b' : 'a') + '/texture';
      resources.load(path, Texture2D, (error, texture) => {
        if (!this.node.isValid) return;
        if (!error && texture && texture.width >= 5 && texture.height >= 5
          && texture.width % 5 === 0 && texture.height % 5 === 0) {
          types.forEach((type, index) => {
            const frame = new SpriteFrame();
            frame.texture = texture;
            frame.rect = new Rect(index % 5 * texture.width / 5,
              Math.floor(index / 5) * texture.height / 5,
              texture.width / 5, texture.height / 5);
            this.ingredientFrames.set(type, frame);
          });
        } else {
          console.error('[HotPot] 食材资源不可用，保留文字牌面', path, error);
        }
        pending--;
        if (!pending) loadReferenceTileSkins(done);
      });
    });
  }
}
