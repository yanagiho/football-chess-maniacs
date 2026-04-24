// ============================================================
// achievements.ts — 実績バッジシステム（アウトライン）
// localStorage で追跡。将来的にサーバーサイドに移行可能。
// ============================================================

/** 実績バッジ定義 */
export interface Achievement {
  id: string;
  name_ja: string;
  name_en: string;
  description_ja: string;
  icon: string;         // テキスト絵文字
  category: 'battle' | 'team' | 'milestone';
}

/** 試合結果から実績を判定するためのコンテキスト */
export interface MatchContext {
  result: 'win' | 'lose' | 'draw';
  myScore: number;
  opScore: number;
  gameMode: string;
  presetTeamId?: string;
  /** 自チームの合計コスト */
  myTotalCost?: number;
  /** 対戦相手の合計コスト */
  opTotalCost?: number;
}

// ── 実績定義 ──

export const ACHIEVEMENTS: Achievement[] = [
  // Battle系
  {
    id: 'first_victory',
    name_ja: '初勝利',
    name_en: 'First Victory',
    description_ja: 'COM対戦で初めて勝利した',
    icon: '\u{2B50}',
    category: 'battle',
  },
  {
    id: 'clean_sheet',
    name_ja: '完封勝利',
    name_en: 'Clean Sheet',
    description_ja: '無失点で勝利した',
    icon: '\u{1F6E1}',
    category: 'battle',
  },
  {
    id: 'comeback',
    name_ja: '逆転勝利',
    name_en: 'Comeback',
    description_ja: '一度リードされた試合で逆転勝利した',
    icon: '\u{1F525}',
    category: 'battle',
  },
  {
    id: 'giant_killer',
    name_ja: 'ジャイアントキリング',
    name_en: 'Giant Killer',
    description_ja: '自チームより高コストの相手に勝利した',
    icon: '\u{2694}',
    category: 'battle',
  },

  // Team系
  {
    id: 'defeat_founding_eleven',
    name_ja: '創設を超えし者',
    name_en: 'Beyond the Founding',
    description_ja: '「創設の11人」を撃破した',
    icon: '\u{1FA9E}',
    category: 'team',
  },
  {
    id: 'defeat_banned_day',
    name_ja: '沈黙を破る者',
    name_en: 'Silence Breaker',
    description_ja: '「禁じられた日の記憶」を撃破した',
    icon: '\u{1F50A}',
    category: 'team',
  },
  {
    id: 'defeat_total_football',
    name_ja: '哲学の超越者',
    name_en: 'Beyond Philosophy',
    description_ja: '「全方位の革命」を撃破した',
    icon: '\u{1F3C6}',
    category: 'team',
  },
  {
    id: 'defeat_empty_archive',
    name_ja: '最前線の征服者',
    name_en: 'Frontier Conqueror',
    description_ja: '「無観客のアーカイブ」を撃破した',
    icon: '\u{1F451}',
    category: 'team',
  },

  // Milestone系
  {
    id: 'all_teams_defeated',
    name_ja: '全制覇',
    name_en: 'Total Domination',
    description_ja: '全4チームを撃破した',
    icon: '\u{1F31F}',
    category: 'milestone',
  },
];

// ── チームID → 実績IDマッピング ──

const TEAM_DEFEAT_ACHIEVEMENT: Record<string, string> = {
  team_1_founding_eleven: 'defeat_founding_eleven',
  team_2_banned_day: 'defeat_banned_day',
  team_3_total_football: 'defeat_total_football',
  team_4_empty_archive: 'defeat_empty_archive',
};

// ── localStorage管理 ──

const STORAGE_KEY = 'fcms_achievements';

/** 獲得済み実績IDセットを取得 */
export function getEarnedAchievements(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

/** 実績を記録（重複無視） */
function earnAchievement(earned: Set<string>, id: string): void {
  earned.add(id);
}

/** 獲得済みセットをlocalStorageに保存 */
function saveEarned(earned: Set<string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...earned]));
}

/**
 * 試合結果から新たに獲得した実績を判定して記録する。
 * 返り値: 今回新たに獲得した実績IDの配列。
 */
export function evaluateAndEarnAchievements(ctx: MatchContext): string[] {
  const earned = getEarnedAchievements();
  const newlyEarned: string[] = [];

  const grant = (id: string) => {
    if (!earned.has(id)) {
      earnAchievement(earned, id);
      newlyEarned.push(id);
    }
  };

  if (ctx.result !== 'win') {
    saveEarned(earned);
    return newlyEarned;
  }

  // 初勝利
  grant('first_victory');

  // 完封勝利
  if (ctx.opScore === 0) {
    grant('clean_sheet');
  }

  // ジャイアントキリング
  if (ctx.myTotalCost != null && ctx.opTotalCost != null && ctx.opTotalCost > ctx.myTotalCost) {
    grant('giant_killer');
  }

  // チーム撃破
  if (ctx.presetTeamId && TEAM_DEFEAT_ACHIEVEMENT[ctx.presetTeamId]) {
    grant(TEAM_DEFEAT_ACHIEVEMENT[ctx.presetTeamId]);
  }

  // 全制覇チェック
  const allTeamAchievements = Object.values(TEAM_DEFEAT_ACHIEVEMENT);
  if (allTeamAchievements.every((a) => earned.has(a))) {
    grant('all_teams_defeated');
  }

  saveEarned(earned);
  return newlyEarned;
}

/** 実績IDから定義を取得 */
export function getAchievementById(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/** 全実績をリセット（デバッグ用） */
export function resetAchievements(): void {
  localStorage.removeItem(STORAGE_KEY);
}
