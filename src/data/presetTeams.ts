// ============================================================
// presetTeams.ts — 世界観NPCチームをプリセット選択用に変換
// ============================================================

import type { Cost, Position } from '../engine/types';
import { NPC_TEAMS } from './npc_teams';

interface PieceCatalogEntry {
  name: string;
  nameEn: string;
  position: Position;
  cost: Cost;
  summary: string;
}

export interface PresetPiece {
  pieceId: number;
  position: Position;
  originalPosition: Position;
  cost: Cost;
  name: string;
  nameEn: string;
  summary: string;
  col: number;
  row: number;
}

export interface PresetTeam {
  id: string;
  name: string;
  nameEn: string;
  era: number;
  formation: string;
  emoji: string;
  totalCost: number;
  pieces: PresetPiece[];
}

const SHELF_LABELS: Record<number, string> = {
  1: 'S1',
  2: 'S2',
  3: 'S3',
  4: 'S4',
  5: 'S5',
  6: 'S6',
  7: 'S7',
};

const PIECE_CATALOG: Record<number, PieceCatalogEntry> = {
  1: { name: 'エドマンド・ブラックウッド', nameEn: 'Edmund Blackwood', position: 'DF', cost: 2, summary: '一族の祖、鉄鋼商にしてサッカーの番人' },
  2: { name: 'アーチー・マクファーレン', nameEn: 'Archie MacFarlane', position: 'VO', cost: 1.5, summary: 'ハミッシュの父、契約の概念を持ち込んだ男' },
  4: { name: 'ウィルフレッド・ソーン', nameEn: 'Wilfred Thorne', position: 'FW', cost: 2, summary: 'FA設立に立ち会った最古のストライカー' },
  5: { name: 'ヘンリー・アシュワース', nameEn: 'Henry Ashworth', position: 'GK', cost: 1.5, summary: 'パブリックスクール出身、最初期のGK' },
  6: { name: 'ダンカン・ケアード', nameEn: 'Duncan Caird', position: 'MF', cost: 1, summary: 'スコットランドのパッシングゲームの原型を作った' },
  7: { name: 'オリヴァー・ブラックウッド', nameEn: 'Oliver Blackwood', position: 'OM', cost: 2, summary: '本家に認められなかった才人、家訓に背いた男' },
  11: { name: 'エリザベス・ホーソーン', nameEn: 'Elizabeth Hawthorne', position: 'OM', cost: 2, summary: '女子サッカー黎明期の創始者、嘲笑と戦った女' },
  13: { name: 'ジェームズ・ブラックウッド', nameEn: 'James Blackwood', position: 'FW', cost: 2.5, summary: 'プロ化を推進した豪腕、「金を取って何が悪い」' },
  15: { name: 'アンリ・デュボワ', nameEn: 'Henri Dubois', position: 'MF', cost: 1.5, summary: '最初のサッカー記者、ペンで試合を残した男' },
  16: { name: 'ジョアン・シルヴァ', nameEn: 'Joao Silva', position: 'FW', cost: 2, summary: 'ポルトガルからブラジルへ渡った種子' },
  20: { name: 'フリードリヒ・バウアー', nameEn: 'Friedrich Bauer', position: 'DF', cost: 2, summary: 'ベルリンのクラブ創設者、規律の体現者' },
  24: { name: 'ウィリアム・ブラックウッド', nameEn: 'William Blackwood', position: 'MF', cost: 2.5, summary: '1916年ソンムで戦死、妹ドロシーを残した兄' },
  25: { name: 'ヴィクター・ヴァイスハウプト', nameEn: 'Viktor Weisshaupt', position: 'DF', cost: 2, summary: '塹壕で戦術ノートを書き続けた将校' },
  26: { name: 'カルロ・モンテフィオーレ', nameEn: 'Carlo Montefiore', position: 'OM', cost: 2.5, summary: 'トリノ・フィアンマを拡張した興行師' },
  27: { name: 'ピエール・デュボワ', nameEn: 'Pierre Dubois', position: 'MF', cost: 1.5, summary: 'ヴェルダンの戦地記者、サッカーを書き続けた' },
  28: { name: 'パウロ・シルヴァ', nameEn: 'Paulo Silva', position: 'FW', cost: 2, summary: 'サントス創設世代、ファベーラの最初の星' },
  30: { name: 'ロナルド・マクファーレン', nameEn: 'Ronald MacFarlane', position: 'SB', cost: 1.5, summary: 'ハミッシュの孫、駒を彫り始めた新世代' },
  32: { name: 'エミール・フォレスティエ', nameEn: 'Emile Forestier', position: 'OM', cost: 2, summary: '1908年五輪の象徴、戦場から戻れなかった詩人' },
  34: { name: 'ヤン・ノヴァーク', nameEn: 'Jan Novak', position: 'DF', cost: 1, summary: 'プラハのクラブ創設メンバー、中欧の盾' },
  38: { name: 'ドロシー・ブラックウッド', nameEn: 'Dorothy Blackwood', position: 'OM', cost: 3, summary: '51年間夢を封印された女、叔父の署名に裏切られた妹' },
  39: { name: 'ヴァイオレット・コナー', nameEn: 'Violet Connor', position: 'FW', cost: 3, summary: '禁止令前夜の得点王、1920年B-Day5万3千人の英雄' },
  40: { name: 'フリードリヒ・ヴァイスハウプト', nameEn: 'Friedrich Weisshaupt', position: 'MF', cost: 2.5, summary: '1925年オフサイド改正を世界で最初に分析した戦術家' },
  56: { name: 'フリードリヒ・ヴァイスハウプト(晩年)', nameEn: 'Friedrich Weisshaupt (late)', position: 'MF', cost: 3, summary: '1945年に死去、戦術ノートだけを残した老戦術家' },
  57: { name: 'ジーノ・モンテフィオーレ', nameEn: 'Gino Montefiore', position: 'FW', cost: 2.5, summary: '1934/1938連覇の象徴、戦後に一族が裁かれた男' },
  58: { name: 'アデマール・シルヴァ', nameEn: 'Ademar Silva', position: 'OM', cost: 2.5, summary: '1950年マラカナンで涙した司令塔、兄は観客席で死んだ' },
  59: { name: 'ハインリヒ・ヴァイスハウプト', nameEn: 'Heinrich Weisshaupt', position: 'DF', cost: 2, summary: 'フリードリヒの長男、ナチス党員として戦死した息子' },
  60: { name: 'クラウス・ヴァイスハウプト', nameEn: 'Klaus Weisshaupt', position: 'VO', cost: 2, summary: 'ゲシュタポから逃れた弟、戦術ノートを守った亡命者' },
  62: { name: 'イヴァン・コヴァチェヴィッチ', nameEn: 'Ivan Kovacevic', position: 'VO', cost: 2, summary: 'パルチザン兵士、森から戻った司令塔' },
  63: { name: 'ピエルリュイジ・ザネッティ', nameEn: 'Pierluigi Zanetti', position: 'WG', cost: 1.5, summary: '1938W杯の黒シャツ、戦後に素性を隠した元兵士' },
  64: { name: 'ロバート・ブラックウッド', nameEn: 'Robert Blackwood', position: 'FW', cost: 1.5, summary: '1940年ダンケルク帰り、戦場と結婚式を両方経験した男' },
  67: { name: 'マルタ・カルドーゾ', nameEn: 'Marta Cardoso', position: 'MF', cost: 1, summary: '禁止されても裏庭で蹴った、シルヴァ家の女' },
  69: { name: 'オーウェン・アマ', nameEn: 'Owen Ama', position: 'FW', cost: 1, summary: '英国軍として戦争に動員された若き黒人兵' },
  71: { name: 'ペドロ・シルヴァ', nameEn: 'Pedro Silva', position: 'FW', cost: 3, summary: '1958/1962連覇の化身、ファベーラから世界王者へ' },
  87: { name: 'ハンス・ファン・デル・ベルク', nameEn: 'Hans van der Berg', position: 'OM', cost: 3, summary: 'トータルフットボールの化身、全方位に動いた10番' },
  88: { name: 'ルドルフ・ヴァイスハウプト', nameEn: 'Rudolf Weisshaupt', position: 'DF', cost: 3, summary: 'リベロの発明者、1974年W杯優勝の思考する守護神' },
  89: { name: 'ライアン・ブラックウッド', nameEn: 'Ryan Blackwood', position: 'FW', cost: 2.5, summary: '天才だが酒で自滅した男、家訓に背いた放蕩息子' },
  90: { name: 'パオロ・モンテフィオーレ', nameEn: 'Paolo Montefiore', position: 'OM', cost: 2.5, summary: 'カルチョ・スキャンダル直前の興行王、7-0の夢' },
  91: { name: 'ジョアキン・シルヴァ', nameEn: 'Joaquim Silva', position: 'FW', cost: 2.5, summary: '1970年W杯優勝、ペレの後継者と呼ばれた男' },
  92: { name: 'ミロスラフ・コヴァチェヴィッチ', nameEn: 'Miroslav Kovacevic', position: 'MF', cost: 2, summary: '1974年W杯出場、チトー死去前夜のユーゴ黄金期' },
  93: { name: 'ピエール・デュボワ2世', nameEn: 'Pierre Dubois II', position: 'MF', cost: 2, summary: '1968年5月革命の記者、サッカーと政治を繋いだ筆' },
  94: { name: 'ヨハネス・マクファーレン', nameEn: 'Johannes MacFarlane', position: 'SB', cost: 2, summary: '代理人業を近代化、最初の「スーパーエージェント」' },
  95: { name: 'チェディ・オコンクウォ', nameEn: 'Chedi Okonkwo', position: 'WG', cost: 2, summary: 'ビアフラ内戦(1967-70)を生き延びた俊足' },
  96: { name: 'ラースロー・ホルヴァート', nameEn: 'Laszlo Horvath', position: 'OM', cost: 2.5, summary: '1956年動乱亡命者の息子、西独で輝いた頭脳' },
  97: { name: 'マヌエル・カストロ', nameEn: 'Manuel Castro', position: 'FW', cost: 2, summary: 'フランコ死去前年(1974)の代表、新時代の予兆' },
  105: { name: 'ルイス・アラーノ', nameEn: 'Luis Arano', position: 'OM', cost: 3, summary: '1986年W杯優勝、神の手と5人抜きの両方をやった男' },
  106: { name: 'ダニエル・デュボワ', nameEn: 'Daniel Dubois', position: 'OM', cost: 3, summary: '1984年欧州選手権優勝、エレガンスの再発明者' },
  107: { name: 'マルコ・モンテフィオーレ', nameEn: 'Marco Montefiore', position: 'DF', cost: 2.5, summary: 'カテナチオを捨てた新時代、1982年W杯優勝世代' },
  108: { name: 'カール・ヴァイスハウプト', nameEn: 'Karl Weisshaupt', position: 'VO', cost: 2.5, summary: 'ベッケンバウアーに分析された最後のドイツ司令塔' },
  109: { name: 'ナイジェル・ブラックウッド', nameEn: 'Nigel Blackwood', position: 'DF', cost: 2, summary: 'ヘイゼルの生存者、以後サッカーから遠ざかった当主' },
  110: { name: 'ジョアン・シルヴァ2世', nameEn: 'Joao Silva II', position: 'FW', cost: 2, summary: '始祖と同名、1982年W杯の華麗な敗者' },
  111: { name: 'ドラガン・コヴァチェヴィッチ', nameEn: 'Dragan Kovacevic', position: 'FW', cost: 2, summary: 'ユーゴ最後の黄金世代、分裂前夜に輝いた得点王' },
  112: { name: 'オラフ・シュトルム', nameEn: 'Olaf Sturm', position: 'MF', cost: 2, summary: '東独代表、壁崩壊を見届けた亡命未遂者' },
  119: { name: 'ハロルド・ヤンセン', nameEn: 'Harold Jansen', position: 'VO', cost: 1, summary: 'トータルフットボール後の守備的MF、世代交代の犠牲者' },
  121: { name: 'ゾラン・コヴァチェヴィッチ', nameEn: 'Zoran Kovacevic', position: 'OM', cost: 3, summary: 'ユーゴ崩壊を見届けた10番、兄弟で敵になった男' },
  122: { name: 'ファビオ・ダ・シルヴァ', nameEn: 'Fabio da Silva', position: 'FW', cost: 3, summary: '1994/1998W杯の現象、17歳で世界を知った怪物' },
  138: { name: 'ヤシン・ブレメル', nameEn: 'Yacine Bremer', position: 'OM', cost: 3, summary: '1998/2000/2006、無冠で終わった仏系マグレブの王' },
  139: { name: 'アレハンドロ・シルヴァ', nameEn: 'Alejandro Silva', position: 'WG', cost: 3, summary: '銀河系クラブの若き皇子、17歳で欧州を買われた天才' },
  140: { name: 'ジョージ・ブラックウッド', nameEn: 'George Blackwood', position: 'MF', cost: 2.5, summary: 'メディアに愛された顔の男、家訓を商業化した異端児' },
  141: { name: 'ダニエレ・モンテフィオーレ', nameEn: 'Daniele Montefiore', position: 'DF', cost: 2.5, summary: '2006年W杯優勝、カルチョポリで一族が裁かれた男' },
  142: { name: 'アンジェロ・デ・ルカ', nameEn: 'Angelo De Luca', position: 'OM', cost: 2.5, summary: 'ユーベの背番号10、銀河系時代のファンタジスタ' },
  143: { name: 'クラウディオ・シルヴァ', nameEn: 'Claudio Silva', position: 'FW', cost: 2, summary: '2002年日韓W杯得点王、20代で欧州の頂点を極めた' },
  147: { name: 'マリア・サントス', nameEn: 'Maria Santos', position: 'OM', cost: 1.5, summary: '2004年アテネ五輪銀、ブラジル女子サッカーの先駆者' },
  155: { name: 'アルバロ・モリナ', nameEn: 'Alvaro Molina', position: 'MF', cost: 3, summary: 'スペイン3連覇時代の頭脳、ティキ・タカの中心で走り続けた' },
  156: { name: '古川 早苗', nameEn: 'Sanae Furukawa', position: 'OM', cost: 3, summary: '2011年女子W杯優勝の象徴、細身で倒れない司令塔' },
  157: { name: 'セドリック・ブラックウッド', nameEn: 'Cedric Blackwood', position: 'DF', cost: 2.5, summary: 'FFP時代に一族資産を守り抜いた投資家型当主' },
  159: { name: 'ヴィトール・アゼヴェド', nameEn: 'Vitor Azevedo', position: 'FW', cost: 2.5, summary: 'リスボンから来た二刀流、ドリブルも守備もできる新型' },
  171: { name: 'フアン・エルナンデス', nameEn: 'Juan Hernandez', position: 'VO', cost: 3, summary: 'Copa América連覇の中核、走行距離だけで勝った男' },
  173: { name: 'ニルス・ヴァイスハウプト', nameEn: 'Nils Weisshaupt', position: 'MF', cost: 2.5, summary: '2014年W杯優勝世代、データで戦術を書き換えた若頭' },
  174: { name: 'ヴァレンティーナ・モンテフィオーレ', nameEn: 'Valentina Montefiore', position: 'OM', cost: 2.5, summary: 'アレッサンドラの姪、セリエA女子を再建した興行師' },
  176: { name: 'イヴァン・ペトロヴィッチ', nameEn: 'Ivan Petrovic', position: 'DF', cost: 2, summary: 'VAR初年度の「消えたゴール」判定で引退を早めた壁' },
  178: { name: 'マルコス・アルメイダ', nameEn: 'Marcos Almeida', position: 'FW', cost: 2, summary: '2014年W杯1-7の記憶を背負った世代、沈黙の得点王' },
  187: { name: 'ベネディクト・ヴァイスハウプト', nameEn: 'Benedikt Weisshaupt', position: 'OM', cost: 3, summary: 'パンデミック下の無観客試合で叫び続けた最後の司令塔' },
  190: { name: 'ムサ・オコンクウォ', nameEn: 'Musa Okonkwo', position: 'WG', cost: 2, summary: 'BLMで膝をついた最初の一人、家系のアクティビスト継承者' },
  192: { name: 'ジュリア・シルヴァ', nameEn: 'Julia Silva', position: 'FW', cost: 2, summary: '家系の直系初の女性FW、ファベーラ出身の爆発的得点王' },
  194: { name: 'ユスフ・エル=タエブ', nameEn: 'Yusuf El-Taeb', position: 'GK', cost: 1.5, summary: 'Era 12モハメドの弟、守護神として兄の影で輝いた' },
  195: { name: 'エミリア・ベルグマン', nameEn: 'Emilia Bergman', position: 'DF', cost: 1.5, summary: '女子欧州選手権準優勝、北欧女子の壁' },
  200: { name: 'ピエトロ・デ・サンクティス', nameEn: 'Pietro De Sanctis', position: 'FW', cost: 1, summary: '2020年セリエC最年少得点、パンデミック世代の希望' },
};

function toPosition(position: string): Position {
  if (['GK', 'DF', 'SB', 'VO', 'MF', 'OM', 'WG', 'FW'].includes(position)) {
    return position as Position;
  }
  throw new Error(`Unknown preset position: ${position}`);
}

function toPresetPiece(piece: (typeof NPC_TEAMS)[number]['starters'][number]): PresetPiece {
  const catalog = PIECE_CATALOG[piece.piece_id];
  if (!catalog) {
    throw new Error(`Missing preset piece catalog entry: ${piece.piece_id}`);
  }

  return {
    pieceId: piece.piece_id,
    position: toPosition(piece.position),
    originalPosition: catalog.position,
    cost: catalog.cost,
    name: catalog.name,
    nameEn: catalog.nameEn,
    summary: catalog.summary,
    col: piece.col,
    row: piece.row,
  };
}

export const PRESET_TEAMS: PresetTeam[] = NPC_TEAMS.map((team) => {
  const pieces = team.starters.map(toPresetPiece);
  return {
    id: team.id,
    name: team.name_ja,
    nameEn: team.name_en,
    era: team.shelf,
    formation: team.formation,
    emoji: SHELF_LABELS[team.shelf] ?? `S${team.shelf}`,
    totalCost: pieces.reduce((sum, piece) => sum + piece.cost, 0),
    pieces,
  };
});
