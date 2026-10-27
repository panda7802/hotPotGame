import {
  AudioClip,
  AudioSource,
  Node,
  Rect,
  resources,
  SpriteFrame,
  Texture2D,
} from 'cc';

import {IngredientType} from '../data/GameData';

import {HotPotState} from './HotPotState';

import {
  BGM_VOLUME,
  drawControlIcon,
  EFFECT_VOLUME,
  GameAudio,
  HANDPAINTED_TYPES,
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
   * 加载基础食材图集和单独的茶树菇图片。
   */
  protected loadIngredientImages(done: () => void): void {
    resources.load(
      'ingredients/handpainted-atlas/texture',
      Texture2D,
      /**
       * 在资源加载完成后更新有效节点或处理失败。
       */ (error, texture) => {
        if (!this.node.isValid) {
          return;
        }
        if (error
          || !texture ||
          texture.width !== texture.height ||
          texture.width < 4) {
          console.warn(
            '[HotPotGame] 手绘图集不可用，保留食材名称备用牌面',
            error,
          );
          this.loadSupplementalImages(done);
          return;
        }
        const cell = texture.width / 4;
        HANDPAINTED_TYPES.forEach(
          /**
           * 依次处理集合中的每个条目。
           */ (type, index) => {
            // 原图集的金针菇格不再使用，茶树菇由独立资源覆盖。
            if (type === 'jzg') {
              return;
            }
            const frame = new SpriteFrame();
            frame.texture = texture;
            const column = index % 4;
            const row = Math.floor(index / 4);
            const left = Math.round(column * cell);
            const top = Math.round(row * cell);
            frame.rect = new Rect(
              left,
              top,
              Math.round((column + 1) * cell) - left,
              Math.round((row + 1) * cell) - top,
            );
            this.ingredientFrames.set(type, frame);
          },
        );
        resources.load(
          'ingredients/jzg/texture',
          Texture2D,
          /**
           * 在资源加载完成后更新有效节点或处理失败。
           */ (mushroomError, mushroomTexture) => {
            if (!this.node.isValid) {
              return;
            }
            if (!mushroomError && mushroomTexture) {
              const frame = new SpriteFrame();
              frame.texture = mushroomTexture;
              this.ingredientFrames.set('jzg', frame);
            } else {
              console.error('[HotPotGame] 无法加载茶树菇图片', mushroomError);
            }
            this.loadSupplementalImages(done);
          },
        );
      },
    );
  }

  /**
   * 加载扩展食材图集。
   */
  protected loadSupplementalImages(done: () => void): void {
    const sheets: Array<{
      /**
       * path 对应的状态或配置。
       */ path: string;
      /**
       * columns 对应的状态或配置。
       */ columns: number;
      /**
       * 棋盘目标行数。
       */ rows: number;
      /**
       * types 对应的状态或配置。
       */ types: IngredientType[];
    }> = [
      {
        path: 'ingredients/expanded-atlas/texture',
        columns: 4,
        rows: 2,
        types: [
          'tripe',
          'duckblood',
          'potato',
          'crabstick',
          'noodle',
          'luncheon',
          'kelp',
        ],
      },
      {
        path: 'ingredients/extra-meat-yam-atlas/texture',
        columns: 3,
        rows: 1,
        types: ['lamb', 'blackchicken', 'yam'],
      },
    ];
    let pending = sheets.length;
    sheets.forEach(
      /**
       * 依次处理集合中的每个条目。
       */ (sheet) =>
        resources.load(
          sheet.path,
          Texture2D,
          /**
           * 在资源加载完成后更新有效节点或处理失败。
           */ (error, texture) => {
            if (!this.node.isValid) {
              return;
            }
            if (!error && texture) {
              sheet.types.forEach(
                /**
                 * 依次处理集合中的每个条目。
                 */ (type, index) => {
                  const left = Math.round(
                    ((index % sheet.columns) * texture.width) / sheet.columns,
                  );
                  const top = Math.round(
                    (Math.floor(index / sheet.columns) * texture.height) /
                      sheet.rows,
                  );
                  const right = Math.round(
                    (((index % sheet.columns) + 1) * texture.width) /
                      sheet.columns,
                  );
                  const bottom = Math.round(
                    ((Math.floor(index / sheet.columns) + 1) * texture.height) /
                      sheet.rows,
                  );
                  const frame = new SpriteFrame();
                  frame.texture = texture;
                  frame.rect = new Rect(left, top, right - left, bottom - top);
                  this.ingredientFrames.set(type, frame);
                },
              );
            } else {
              console.error(
                `[HotPotGame] 新食材图集加载失败：${sheet.path}`,
                error,
              );
            }
            pending -= 1;
            if (pending === 0) {
              done();
            }
          },
        ),
    );
  }
}
