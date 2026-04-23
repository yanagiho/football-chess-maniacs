# FChess 200人キャラ画像 生成プロンプト集 v1.0

## 文書メタデータ
- **文書種別**: GPT Image 2 向けキャラ画像生成プロンプト
- **対象モデル**: gpt-image-2 (ChatGPT Images 2.0)
- **世界観典拠**: The Archive 世界観設定書 v1.0
- **キャラクター典拠**: FChess 200人名簿 全Era統合 v1.0
- **バージョン**: v1.0
- **作成日**: 2026-04-23

---

## 第1章 — プロンプトの設計思想

### 1-1. 生成する画像の目的

FCMSで使用する**縦型カード(1024×1536)**。The Archive(ジ・アーカイブ、160年のサッカー資料庫)の「選手ファイルの表紙」を模す。

### 1-2. 3層構造でプロンプトを組み立てる

```
┌────────────────────┐
│ [1] 共通スタイル層   │ ← 全キャラ共通のビンテージ・ポスター調
├────────────────────┤
│ [2] 時代処理層       │ ← 7時代それぞれの画像処理差
├────────────────────┤
│ [3] キャラ個別層     │ ← 名前・ポジション・国・一行要約
└────────────────────┘
```

この3層を結合して、1キャラにつき1プロンプトを生成する。

### 1-3. 重要な制約

- **実在選手に似せない** — 命名ガイドラインv1.0に準拠。顔も実在選手に似ないようにプロンプトで制御
- **完全オリジナル** — 実在の歴史写真をそのまま再現させない
- **時代感は画像処理で** — カラーパレットではなく、ノイズ・粒状感・印刷質感で時代を表現
- **顔は上半身〜胸像** — カード全体の60%程度を顔と上半身に充てる
- **下部に情報エリア** — 名前・ポジション・国・コストを書き込む余白

---

## 第2章 — 共通スタイル層(全キャラ共通のベース)

### 2-1. ベース・プロンプト

この文章は**全キャラのプロンプトに必ず含める**。

```
A vintage football archive portrait card, 2:3 vertical format (1024x1536).
Fictional original character, not based on any real player.
Upper 60% of frame: bust-up portrait of the subject in period-appropriate football attire.
Lower 40% of frame: aged paper texture with embedded text fields for name, position, country flag, and cost indicator.
Overall aesthetic: vintage sports poster, printed archive file cover, weathered document feel.
The card should evoke the look of a hand-catalogued player file from "The Archive" — a secret 160-year football records library.
Outer border: decorative frame reminiscent of old catalog indices, with subtle wear.
DO NOT include any real player's likeness. DO NOT include real club badges or logos.
```

### 2-2. 構図指定

```
Composition rules:
- Subject facing camera, slight 3/4 angle acceptable.
- Chest-up framing, shoulders visible, head taking about 40% of the upper portrait area.
- Neutral to contemplative expression, capturing a moment of stillness.
- Background for upper portrait area: softly blurred era-appropriate context (stadium, training ground, street, etc.).
- Lower 40%: clean parchment/aged-paper area with reserved space for typography.
```

### 2-3. 除外事項(ネガティブプロンプト相当)

gpt-image-2ではネガティブプロンプトは使わないが、以下を**明示的に除外指示**として書く:

```
Avoid: modern photographic glare, cartoon/anime styling, glossy digital finish, real player resemblance, real team logos, real national team uniforms with identifiable crests.
```

---

## 第3章 — 時代処理層(7時代別のスタイル)

### 3-1. Shelf 1: Dawn (1863-1909, 草創期) — Era 1, 2

```
Time period: Victorian-era football (1863-1909).
Image treatment: pure black-and-white, silver gelatin photograph emulation.
Texture: heavy film grain, silver halide crystallization, paper yellowing at edges.
Attire: simple long-sleeved cotton football shirt, knickerbockers, flat cap optional.
Background hint: wooden stadium stands, Victorian-era pub walls, cobblestone streets, gas lamps.
Avoid any color. Avoid modern cleats — use early leather boots with studs.
```

### 3-2. Shelf 2: Interwar (1910-1939, 戦間期) — Era 3, 4(大半)

```
Time period: Between the World Wars (1910-1939).
Image treatment: strong sepia tone, newsprint halftone pattern overlay.
Texture: newspaper pulp, coarse ink dots, creases and fold marks.
Attire: heavy wool jersey with collar, laced front, long shorts, leather boots.
Background hint: early wooden stadium with advertising banners (generic, no real brands), barbed wire fences, period automobiles in distance.
Film quality: like a 1920s-30s newspaper cutout.
```

### 3-3. Shelf 3: Post-War (1940-1959, 戦後黄金期) — Era 4末期, 5, 6前半

```
Time period: Post-war reconstruction era (1940-1959).
Image treatment: faded sepia with subtle hints of emerging color, poster-print quality.
Texture: matte paper, slight bleaching from age, letterpress printing imperfections.
Attire: collared cotton jersey, shorter shorts than interwar era, sturdy leather boots with screw-in studs.
Background hint: rebuilt concrete stands, hand-painted advertising (generic), post-war urban backdrop.
Evoke feeling of 1950s match-day programs, not yet full color but life returning to the game.
```

### 3-4. Shelf 4: Expansion (1960-1979, テレビ・拡張期) — Era 6後半, 7

```
Time period: Television expansion era (1960-1979).
Image treatment: CMYK 4-color offset printing, slight color misregistration (dot offset), halftone dots visible.
Texture: glossy-ish printed poster, vibrant but imperfect color saturation.
Attire: synthetic jersey with simple number on back, modern-shaped shorts, molded cleats.
Background hint: floodlit stadium, early television broadcast cameras in the distance, 60s-70s advertising billboards (all generic, no real brands).
Print quality: like a 1970s official match-day programme cover.
```

### 3-5. Shelf 5: Modernization (1980-1999, 近代化期) — Era 8, 9

```
Time period: Modern football era (1980-1999).
Image treatment: full color offset printing, high saturation, magazine-quality print texture.
Texture: glossy magazine paper, sharp but slightly over-saturated colors, period-accurate printing.
Attire: polyester jersey, sponsor stripe (generic abstract design, no real logos), modern molded cleats.
Background hint: floodlit modern stadium, digital scoreboards, satellite broadcast equipment.
Print quality: like a 1990s football magazine cover (Shoot!, World Soccer style but with generic branding).
```

### 3-6. Shelf 6: Global (2000-2009, グローバル期) — Era 10, 11前半

```
Time period: Globalization era of football (2000-2009).
Image treatment: sharp digital color, early-2000s digital print quality.
Texture: semi-glossy modern print, clean color separation, subtle compression artifacts.
Attire: lightweight technical jersey, abstract sponsor logo (generic), modern cleats with distinct sole pattern.
Background hint: modern stadium with LED advertising (generic), press photographer flashes in the distance.
Print quality: like a 2000s official UEFA Champions League magazine page.
```

### 3-7. Shelf 7: Present (2010-2020, 現代) — Era 11後半, 12, 13

```
Time period: Contemporary football era (2010-2020).
Image treatment: high-resolution full color, clean modern digital print finish.
Texture: crisp modern print, clean color accuracy, minimal print imperfections.
Attire: ultra-modern technical jersey, minimalist design, latest cleats with knit upper.
Background hint: cutting-edge stadium, data visualization overlays (generic, no real team data), contemporary urban setting.
Print quality: like a 2020 FIFA trading card or contemporary football almanac.
```

---

## 第4章 — キャラ個別層(1キャラごとの描写)

### 4-1. キャラ個別プロンプトのテンプレート

以下のテンプレートに各キャラの情報を埋める:

```
Subject details:
- Gender: [male/female]
- Age: [approximate age during their prime, e.g., "early 30s", "young 20s"]
- Ethnicity/origin: [e.g., "British", "Brazilian of Portuguese descent", "Nigerian", "Serbian", etc.]
- Build: [e.g., "athletic and wiry", "tall and imposing", "compact and muscular"]
- Facial features: [distinctive but generic, e.g., "strong jaw", "piercing eyes", "weathered from outdoor training"]
- Hair: [period-appropriate, e.g., "short and slicked back 1920s style", "1970s shaggy cut", "clean modern fade"]
- Expression: [e.g., "contemplative", "fierce determination", "gentle resolve", "tired pride"]
- Distinctive mood: [one-line capture of their story, e.g., "a man who carries the weight of a war behind his eyes"]

Position: [GK/DF/SB/MF/VO/OM/FW/WG]
Position visual cue: [optional accessory matching position, e.g., GK = gloves, FW = ready-to-strike pose]
```

### 4-2. 情報エリア(カード下部)のテキスト指定

gpt-image-2は文字レンダリングが強いので、カード下部に文字を直接描画させる:

```
Lower 40% of card layout:
- Center-top: Character name in two lines — English name (Latin), Japanese name (katakana/kanji). 
- Left: small flag emblem for country (generic stylized flag, not exact national flag).
- Center: position abbreviation in large bold letters (GK/DF/SB/VO/MF/OM/WG/FW).
- Right: cost indicator — either "1", "1+", "2", "2+", or "SS" in a circled or stamped design.
- If cost is SS: add a red wax seal stamp reading "SOVEREIGN SCRIBE'S SEAL" in tiny letters around it.
- Bottom center: era name in elegant serif script (e.g., "DAWN", "INTERWAR", "POST-WAR", etc.)
- Tagline area (very bottom, small text): the character's one-line summary in English.
```

---

## 第5章 — 完成プロンプトの例(FG 11人 + SS 17人 から抜粋)

各プロンプトは**共通スタイル層 + 時代処理層 + キャラ個別層 + 情報エリア**を結合したもの。ChatGPT(gpt-image-2)にそのまま貼り付けて使える。

### 5-1. #003 ハミッシュ・マクファーレン(SS / Shelf 1: Dawn)

```
Generate a vintage football archive portrait card, 2:3 vertical format (1024x1536).

[STYLE LAYER]
Fictional original character, not based on any real player.
Upper 60%: bust-up portrait, subject facing camera with slight 3/4 angle, contemplative expression.
Lower 40%: aged paper texture with name plate, position emblem, country flag, cost stamp.
Overall aesthetic: vintage sports poster, printed archive file cover, The Archive (secret 160-year football records library) file cover style.
Decorative outer border reminiscent of old catalog indices.
Avoid modern photographic glare, cartoon styling, real player resemblance, real club logos.

[ERA LAYER — Shelf 1: Dawn, 1863-1909]
Time period: Victorian-era football.
Image treatment: pure black-and-white, silver gelatin photograph emulation.
Heavy film grain, silver halide crystallization, yellowing paper edges.
Attire: simple long-sleeved cotton shirt, knickerbockers, flat cap.
Background hint: wooden stadium stands, Victorian pub walls visible in soft blur.
Avoid any color. Old leather studded boots.

[CHARACTER LAYER]
Subject: Hamish MacFarlane, Scottish, male, older — approximately 70 years old.
Build: wiry, slightly stooped with age, strong hands of a craftsman.
Features: weathered face deeply lined from decades outdoors, piercing light-colored eyes, 
neatly trimmed white beard, hair gone silver.
Attire details: he is not in playing kit — instead wears a tweed waistcoat, collarless shirt, 
one hand resting on a handcrafted wooden chess piece (football figure).
Expression: wise, contemplative, a man who has outlived his era.
Mood: "the old contract-maker who carved a dream, the founder of Football Chess in 1903".

[INFORMATION LAYER]
Lower card text:
- Name (English): HAMISH MACFARLANE
- Name (Japanese): ハミッシュ・マクファーレン
- Country: Scotland (stylized flag — saltire, slightly aged print)
- Position: OM (large bold letters)
- Cost: SS with a red wax seal stamp reading "SOVEREIGN SCRIBE'S SEAL"
- Era: DAWN (elegant serif script)
- Tagline: "The old man who carved the board, designer of dreams across time."
```

### 5-2. #008 トム・ハーディング(FG #01, コスト1 / Shelf 1: Dawn)

```
Generate a vintage football archive portrait card, 2:3 vertical format (1024x1536).

[STYLE LAYER — same as #003]

[ERA LAYER — Shelf 1: Dawn]
Same as #003.

[CHARACTER LAYER]
Subject: Tom Harding, English, male, mid-20s.
Build: lean but strong, hands rough from coal mining work.
Features: plain honest face, coal-dust-tinted skin around the eyes (faded), short dark hair.
Attire: basic cotton goalkeeper shirt (slightly different color than outfield, perhaps darker), 
long sleeves, patched knees from training. Simple leather gloves optional.
Expression: serious, dutiful, a man of few words.
Mood: "the first to guard the goal on the board, a coal-town boy who became a keeper".

[INFORMATION LAYER]
- Name (English): TOM HARDING
- Name (Japanese): トム・ハーディング
- Country: England (stylized flag of St. George)
- Position: GK (large bold letters)
- Cost: 1 (small, unadorned)
- Era: DAWN
- Tagline: "From a coal-mining town. The first to stand at the gate of the board."
- Footer badge: "FC GRASSROOTS / THE FOUNDING ELEVEN" in small elegant letters
```

### 5-3. #038 ドロシー・ブラックウッド(SS / Shelf 2: Interwar)

```
Generate a vintage football archive portrait card, 2:3 vertical format (1024x1536).

[STYLE LAYER — same base]

[ERA LAYER — Shelf 2: Interwar, 1910-1939]
Time period: Between the World Wars.
Image treatment: strong sepia tone, newsprint halftone pattern overlay.
Texture: newspaper pulp, coarse ink dots, creases and fold marks.
Like a 1920s-30s newspaper cutout.

[CHARACTER LAYER]
Subject: Dorothy Blackwood, English, female, early 20s.
Build: slim but athletic, wartime-hardened.
Features: striking direct gaze, short bobbed hair in 1920s style, strong cheekbones, 
a face that has known grief — her brother died in the trenches.
Attire: women's wool football jersey (long-sleeved, high-collar, laced front), 
long shorts, wool socks to knee, sturdy leather boots.
Carries herself with quiet defiance.
Expression: fierce, resolute, holding back something — a woman silenced by the 1921 FA ban on women's football.
Mood: "a dream sealed for 51 years, betrayed by her own uncle's signature".

[INFORMATION LAYER]
- Name (English): DOROTHY BLACKWOOD
- Name (Japanese): ドロシー・ブラックウッド
- Country: England
- Position: OM (large bold letters)
- Cost: SS with red wax seal
- Era: INTERWAR
- Tagline: "51 years of silenced dreams. The sister her uncle betrayed."
```

### 5-4. #071 ペドロ・シルヴァ(SS / Shelf 3: Post-War)

```
Generate a vintage football archive portrait card, 2:3 vertical format (1024x1536).

[STYLE LAYER — same base]

[ERA LAYER — Shelf 3: Post-War, 1940-1959]
Time period: Post-war reconstruction era.
Image treatment: faded sepia with hints of emerging color.
Texture: matte paper, slight bleaching from age, letterpress imperfections.
Evoke 1950s match-day programs.

[CHARACTER LAYER]
Subject: Pedro Silva, Brazilian, male of Afro-Brazilian descent, young 20s.
Build: compact, electric, fast-twitch athletic.
Features: warm confident smile edge, short curly dark hair, 
skin weathered by sun but youthful, eyes full of joy and focus.
Attire: classic Brazilian-style yellow jersey (slightly different shade, not exact Seleção crest), 
blue shorts, white socks, leather boots.
Expression: radiant confidence, the joy of someone lifting a nation.
Mood: "the face of the 1958/1962 back-to-back champions, from the favela to world king".

[INFORMATION LAYER]
- Name (English): PEDRO SILVA
- Name (Japanese): ペドロ・シルヴァ
- Country: Brazil (stylized flag, aged printing)
- Position: FW
- Cost: SS with red wax seal
- Era: POST-WAR
- Tagline: "From the favela to world champion, embodiment of the golden era."
```

### 5-5. #087 ハンス・ファン・デル・ベルク(SS / Shelf 4: Expansion)

```
Generate a vintage football archive portrait card, 2:3 vertical format (1024x1536).

[STYLE LAYER — same base]

[ERA LAYER — Shelf 4: Expansion, 1960-1979]
CMYK 4-color offset printing, slight color misregistration, halftone dots visible.
Like a 1970s official match-day programme cover.

[CHARACTER LAYER]
Subject: Hans van der Berg, Dutch, male, late 20s.
Build: tall, lean, elegant — the body of a player who moves everywhere on the pitch.
Features: striking Nordic features, long sandy blond hair in 1970s style, 
bright intelligent eyes, clean-shaven.
Attire: orange 1970s-style synthetic jersey (abstract design, no real crest), 
short white shorts, orange socks, adidas-style molded cleats.
Expression: philosophical intensity, the look of a man redefining the game.
Mood: "the embodiment of Total Football, moving everywhere at once".

[INFORMATION LAYER]
- Name (English): HANS VAN DER BERG
- Name (Japanese): ハンス・ファン・デル・ベルク
- Country: Netherlands (stylized orange/flag)
- Position: OM
- Cost: SS with red wax seal
- Era: EXPANSION
- Tagline: "The incarnation of Total Football — everywhere, all at once."
```

### 5-6. #156 古川 早苗(SS / Shelf 6: Global)

```
Generate a vintage football archive portrait card, 2:3 vertical format (1024x1536).

[STYLE LAYER — same base]

[ERA LAYER — Shelf 6: Global, 2000-2009]
Sharp digital color, early-2000s digital print quality.
Semi-glossy modern print, clean color separation, subtle compression artifacts.

[CHARACTER LAYER]
Subject: Sanae Furukawa, Japanese, female, mid-20s.
Build: slim, compact, deceptively strong — she stays on her feet when others fall.
Features: kind but focused Japanese face, long black hair tied back in a ponytail, 
calm concentrated eyes, a face that shows discipline.
Attire: Japanese-style blue and white technical jersey (abstract design, no real crest), 
modern 2000s-era cleats.
Expression: quiet determination, the expression of a playmaker who never panics.
Mood: "the emblem of the 2011 Women's World Cup champions — slim, upright, never falling".

[INFORMATION LAYER]
- Name (English): SANAE FURUKAWA
- Name (Japanese): 古川 早苗
- Country: Japan (stylized hinomaru)
- Position: OM
- Cost: SS with red wax seal
- Era: GLOBAL
- Tagline: "The emblem of 2011 — the playmaker who never fell."
```

### 5-7. #187 ベネディクト・ヴァイスハウプト(SS / Shelf 7: Present)

```
Generate a vintage football archive portrait card, 2:3 vertical format (1024x1536).

[STYLE LAYER — same base]

[ERA LAYER — Shelf 7: Present, 2010-2020]
High-resolution full color, clean modern digital print finish.
Crisp modern print, like a 2020 FIFA trading card.

[CHARACTER LAYER]
Subject: Benedikt Weisshaupt, German, male, mid to late 20s.
Build: tall, broad-shouldered, classical German midfielder build.
Features: strong Germanic features, short neat dark blond hair, 
intense focused eyes, clean-shaven.
Attire: modern 2020s technical jersey (abstract German-inspired design, no real DFB crest), 
streamlined knit-upper cleats.
Expression: defiant focus, the look of a leader in an empty stadium.
Mood: "the final playmaker, screaming into the silent pandemic-era stands".

[INFORMATION LAYER]
- Name (English): BENEDIKT WEISSHAUPT
- Name (Japanese): ベネディクト・ヴァイスハウプト
- Country: Germany (stylized tricolor)
- Position: OM
- Cost: SS with red wax seal
- Era: PRESENT
- Tagline: "The last playmaker, shouting into the silence of empty stands."
```

---

## 第6章 — 使い方ガイド(ChatGPT での実際の生成手順)

### 6-1. 推奨手順

1. **ChatGPT Plus/Pro** にアクセス
2. モデル選択で **GPT Image 2 (ImageGen 2.0 Thinking 推奨)** を選択
3. 第5章の完成プロンプトをそのまま貼り付け
4. 出力を確認
5. 調整が必要な場合は、プロンプトの該当箇所(CHARACTER LAYER等)を修正して再生成

### 6-2. バッチ生成のコツ

GPT Image 2は「最大8枚を一貫キャラで」同時生成できる。以下のように使える:

```
Generate 4 variants of the same character (same person, same style), 
slight variations in pose and expression:
[完成プロンプト]

Variant 1: standard bust-up, neutral expression
Variant 2: slight 3/4 angle, subtle smile
Variant 3: looking slightly off-camera, contemplative
Variant 4: direct gaze, determined
```

4パターンから最良1枚を選ぶ運用が効率的。

### 6-3. 試作推奨順

以下の順で試作すると、問題が早期に見つかる:

**Phase 1(1日目)**: 時代差の検証
- Shelf 1: #008 トム・ハーディング(FG、コスト1)
- Shelf 4: #087 ハンス・ファン・デル・ベルク(SS)
- Shelf 7: #187 ベネディクト・ヴァイスハウプト(SS)

→ この3枚で**時代の視覚差が明確に出るか**を判定。OKなら次へ。

**Phase 2(2-3日目)**: FC Grassroots 11人全員
- 全員コスト1のプレースホルダーとして統一感を確認

**Phase 3(4日目以降)**: SS 17人の完成
- 最重要キャラを先に固めてクオリティ基準にする

**Phase 4**: 残り172人をバッチ生成

### 6-4. 問題が出た時の修正ポイント

| 問題 | 修正するレイヤー |
|---|---|
| 時代感が弱い | [ERA LAYER] のtexture指定を強化 |
| 顔が実在選手に似ている | [CHARACTER LAYER] に "completely fictional, no resemblance to any real player" を追加 |
| 背景がリッチすぎて小さい時潰れる | [STYLE LAYER] に "background softly blurred and minimal" を追加 |
| カード下部の文字が崩れる | [INFORMATION LAYER] の配置を明示的に指定 |
| 全体が暗すぎる | [STYLE LAYER] に "well-lit subject, clear visibility" を追加 |

---

## 第7章 — 200人全員分のプロンプト生成補助

### 7-1. 一覧データから自動生成

FChess_200人名簿_全Era統合_v1.0.csv を基に、以下のスクリプトで全プロンプトを自動生成できる:

```python
# 疑似コード
import csv

SHELF_MAP = {
    1: "Dawn", 2: "Dawn",
    3: "Interwar", 4: "Interwar",
    5: "Post-War", 6: "Post-War",  # Era 6は前半のみPost-War、後半はExpansion
    7: "Expansion",
    8: "Modernization", 9: "Modernization",
    10: "Global", 11: "Global",  # Era 11は前半Global、後半Present
    12: "Present", 13: "Present"
}

ERA_LAYER = {
    "Dawn": "...",      # 第3-1章の内容
    "Interwar": "...",  # 第3-2章
    # ...
}

with open("FChess_200人名簿_全Era統合_v1.0.csv") as f:
    for row in csv.DictReader(f):
        name_ja = row["name_ja"]
        name_en = row["name_en"]
        position = row["position"]
        cost = row["cost"]
        era = int(row["era"])
        nationality = row["nationality"]
        summary = row["summary"]
        is_fcg = row["is_fcg"] == "true"
        
        shelf = SHELF_MAP[era]
        prompt = build_prompt(
            style=STYLE_LAYER,
            era=ERA_LAYER[shelf],
            character=build_character_layer(row),
            info=build_info_layer(row)
        )
        
        print(prompt)
```

### 7-2. 手作業での調整

自動生成後、**キャラ個別層(CHARACTER LAYER)**は200人それぞれ個別の描写が必要。これはLLM(Claude等)に一括生成を依頼するのが効率的:

```
以下の200人のキャラ情報を基に、CHARACTER LAYERを一人ずつ書いてください。
各キャラは以下の情報を含むこと:
- 性別・年齢・民族
- 体型
- 顔の特徴
- 髪型
- 服装(時代相応のチームウェア)
- 表情
- 一行ムード

[CSVデータをここに貼り付け]
```

---

## 第8章 — 仮画像(プレースホルダー)の仕様

### 8-1. 仮画像のプロンプト

200人のうち一部が未生成の場合、以下のプロンプトで統一感のある仮画像を作成:

```
Generate a placeholder football archive card, 2:3 vertical format (1024x1536).

Upper 60%: silhouette of a football player (gender-neutral), 
completely blacked-out figure against a neutral background.
Shadow figure, no facial features, no identifying marks.
Lower 40%: same card layout as normal archive cards, but:
- Name field: "TBD"
- Position: [will be filled with actual position]
- Cost: [will be filled with actual cost]
- Era: [will be filled with actual era]
- Tagline: "FILE UNDER REVIEW — ARCHIVE DEPARTMENT"
- Upper-right corner: small red bureaucratic stamp reading "PROVISIONAL"

Style: same vintage archive aesthetic as full cards, but deliberately incomplete.
```

### 8-2. 仮画像の運用

- 開発・テスト環境でのみ表示
- 本番環境では該当キャラをショップ・図鑑から**一時非表示**
- データベース上は `image_status: 'provisional'` フラグで区別

---

## 第9章 — プロンプトのバージョン管理

### 9-1. プロンプト更新履歴

| バージョン | 日付 | 変更内容 |
|:-:|---|---|
| v1.0 | 2026-04-23 | 初版。3層構造確立、7時代別スタイル定義、FG11+SS17試作用7例掲載 |

### 9-2. プロンプト管理のベストプラクティス

- **STYLE LAYERとERA LAYERはv1.0として確定**してから、キャラ個別層を流す
- 試作で問題が見つかったら、最初にSTYLE/ERA LAYERを直す(全キャラに影響するため)
- 200人分のCHARACTER LAYERはGoogleスプレッドシート等で管理し、バージョンを明確化

---

## 第10章 — 検証チェックリスト

各生成画像が以下を満たすか確認:

- [ ] 実在選手に似ていない
- [ ] 時代感が画像処理で明確に分かる(モノクロ/セピア/カラー等)
- [ ] 顔が上半身〜胸像の位置にある
- [ ] カード下部に名前・ポジション・国・コストが読める
- [ ] SSコマには赤い印(Sovereign Scribe's Seal)がある
- [ ] 200人統一感がある(極端にスタイルが浮くキャラがない)
- [ ] 実在クラブロゴ・実在国旗の正確な再現がない
- [ ] The Archive世界観(資料庫のファイル感)が感じられる

---

**作成者**: Claude  
**最終更新**: 2026-04-23 v1.0  
**関連文書**: FChess_The_Archive_世界観設定書_v1.0.md / FChess_200人名簿_全Era統合_v1.0.md / FChess_命名ガイドライン_v1.0.md
