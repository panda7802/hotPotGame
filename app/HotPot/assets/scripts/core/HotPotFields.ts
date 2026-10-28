import {
  AudioClip,
  AudioSource,
  Component,
  Font,
  Label,
  Node,
  SpriteFrame,
} from 'cc';
import {IngredientType, LevelData} from '../data/GameData';
import {SaveStatus} from '../data/PlayerData';
import {PlayerService} from './PlayerService';
import {DESIGN_HEIGHT, GameAudio, MoveSnapshot, ToolType} from './HotPotUi';

/**
 * 火锅场景共享的运行状态和界面引用。
 */
export abstract class HotPotFields extends Component {
  /**
   * 当前关卡的零基索引。
   */
  protected levelIndex = 0;
  /**
   * 当前关卡生成的棋盘数据。
   */
  protected levelData!: LevelData;
  /**
   * 托盘中按顺序排列的食材。
   */
  protected tray: IngredientType[] = [];
  /**
   * 暂存区中的食材。
   */
  protected reserve: IngredientType[] = [];
  /**
   * 当前对局是否已经复活。
   */
  protected reviveUsed = false;
  /**
   * 本局已发放的奖励里程碑。
   */
  protected rewardedMilestones = 0;
  /**
   * 暂存区的界面节点。
   */
  protected reserveNode!: Node;
  /**
   * 食材编号到界面节点的映射。
   */
  protected tileNodes = new Map<string, Node>();
  /**
   * 棋盘是否暂时禁止操作。
   */
  protected locked = false;
  /**
   * 当前对局是否结束。
   */
  protected gameEnded = false;
  protected runId: string | undefined;
  /**
   * 连续消除次数。
   */
  protected combo = 0;
  /**
   * 食材类型到图片帧的缓存。
   */
  protected ingredientFrames = new Map<IngredientType, SpriteFrame>();
  /**
   * 背景音乐与音效资源缓存。
   */
  protected audioClips = new Map<GameAudio, AudioClip>();
  /**
   * 背景音乐播放组件。
   */
  protected bgmSource!: AudioSource;
  /**
   * 音效播放组件。
   */
  protected effectSource!: AudioSource;
  /**
   * 玩家的声音开关状态。
   */
  protected soundEnabled = true;
  /**
   * 声音按钮的文字节点。
   */
  protected soundButtonLabel!: Label;
  /**
   * 本地存档与云同步服务。
   */
  protected playerService: PlayerService | null = null;
  /**
   * 玩家同步状态的文字节点。
   */
  protected playerStatusLabel: Label | null = null;
  /**
   * 玩家存档摘要的文字节点。
   */
  protected playerSaveLabel: Label | null = null;
  /**
   * 地区名称使用的字体。
   */
  protected regionFont: Font | null = null;
  /**
   * 玩家档案入口的文字节点。
   */
  protected profileButtonLabel!: Label;
  /**
   * 上次刷新时已知的成就编号。
   */
  protected knownAchievements = new Set<string>();
  /**
   * 当前成就提示所属的玩家编号。
   */
  protected achievementOwner: string | null = null;
  /**
   * 成就提示是否可以开始显示。
   */
  protected achievementNotificationsReady = false;
  /**
   * 上一局的进行、胜利或失败状态。
   */
  protected lastResult: SaveStatus = 'playing';
  /**
   * 是否正在从存档恢复对局。
   */
  protected restoringSave = false;

  /**
   * 棋盘根节点。
   */
  protected board!: Node;
  /**
   * 托盘根节点。
   */
  protected trayNode!: Node;
  /**
   * 道具栏根节点。
   */
  protected toolBar!: Node;
  /**
   * 食材移动动画的容器。
   */
  protected foodTransitionLayer!: Node;
  /**
   * 关卡名称文字。
   */
  protected levelLabel!: Label;
  /**
   * 关卡进度文字。
   */
  protected progressLabel!: Label;
  /**
   * 短暂提示文字。
   */
  protected toastLabel!: Label;
  /**
   * 道具类型到按钮节点的映射。
   */
  protected toolButtons = new Map<ToolType, Node>();
  /**
   * 各道具在本局的使用次数。
   */
  protected toolUses: Record<ToolType, number> = {undo: 0, bomb: 0, shuffle: 0};
  // 仅当前这局的本地调试开关，不写入玩家或云端存档。
  /**
   * 本局调试模式下各道具是否无限使用。
   */
  protected unlimitedTools: Record<ToolType, boolean> = {
    undo: false,
    bomb: false,
    shuffle: false,
  };
  /**
   * 撤销操作所需的上一手快照。
   */
  protected lastMoveSnapshot: MoveSnapshot | null = null;
  /**
   * 按设备屏幕换算的设计高度。
   */
  protected viewportHeight = DESIGN_HEIGHT;
  /**
   * 长屏幕可分配的纵向空间。
   */
  protected verticalSpread = 0;
  /**
   * 顶部界面可用的纵向偏移。
   */
  protected topSpread = 120;
  /**
   * 底部界面可用的纵向偏移。
   */
  protected bottomSpread = 0;
}
