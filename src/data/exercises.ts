import type { CountingType, Equipment, Exercise } from '@/db/repositories/exercise-repo';

/**
 * Built-in exercise library (I-0.3). Compact row format, expanded below.
 * Muscle taxonomy: chest back lats traps front_delt side_delt rear_delt biceps
 * triceps forearms quads hamstrings glutes calves core lower_back hip_flexors
 * adductors abductors full_body cardio
 * Injury tags: shoulder lower_back knee elbow wrist hip ankle neck
 */
type Row = [
  id: string,
  zh: string,
  en: string,
  equip: Equipment,
  count: CountingType,
  primary: string[],
  secondary: string[],
  diff: 1 | 2 | 3,
  cues?: string[],
  subs?: string[],
  contra?: string[],
];

const W: CountingType = 'weight_reps';
const RP: CountingType = 'reps_only';
const DU: CountingType = 'duration';
const DD: CountingType = 'distance_duration';
const AW: CountingType = 'assisted_weight_reps';

const ROWS: Row[] = [
  // ── 胸 Chest ──────────────────────────────────────────────
  ['barbell_bench_press', '杠铃卧推', 'Barbell Bench Press', 'barbell', W, ['chest'], ['triceps', 'front_delt'], 2, ['肩胛骨后收下沉', '杠铃触胸时前臂垂直地面', '脚踩实地面发力'], ['dumbbell_bench_press', 'machine_chest_press'], ['shoulder']],
  ['incline_barbell_press', '上斜杠铃卧推', 'Incline Barbell Press', 'barbell', W, ['chest'], ['front_delt', 'triceps'], 2, ['椅背 30-45 度', '下放至上胸'], ['incline_dumbbell_press'], ['shoulder']],
  ['decline_barbell_press', '下斜杠铃卧推', 'Decline Barbell Press', 'barbell', W, ['chest'], ['triceps'], 2, [], ['dips'], ['shoulder']],
  ['close_grip_bench_press', '窄距卧推', 'Close-Grip Bench Press', 'barbell', W, ['triceps'], ['chest', 'front_delt'], 2, ['握距与肩同宽', '手肘贴近躯干'], ['cable_pushdown'], ['shoulder', 'wrist', 'elbow']],
  ['barbell_floor_press', '杠铃地板卧推', 'Barbell Floor Press', 'barbell', W, ['chest'], ['triceps'], 2, [], ['barbell_bench_press'], ['shoulder']],
  ['smith_bench_press', '史密斯卧推', 'Smith Machine Bench Press', 'machine', W, ['chest'], ['triceps', 'front_delt'], 1, [], ['barbell_bench_press'], ['shoulder']],
  ['dumbbell_bench_press', '哑铃卧推', 'Dumbbell Bench Press', 'dumbbell', W, ['chest'], ['triceps', 'front_delt'], 1, ['哑铃轨迹呈拱形', '底部拉伸不耸肩'], ['barbell_bench_press', 'machine_chest_press'], ['shoulder']],
  ['incline_dumbbell_press', '上斜哑铃卧推', 'Incline Dumbbell Press', 'dumbbell', W, ['chest'], ['front_delt', 'triceps'], 1, ['椅背 30 度左右'], ['incline_barbell_press'], ['shoulder']],
  ['dumbbell_fly', '哑铃飞鸟', 'Dumbbell Fly', 'dumbbell', W, ['chest'], [], 1, ['手肘微屈固定', '感受胸部拉伸'], ['cable_crossover', 'pec_deck'], ['shoulder']],
  ['incline_dumbbell_fly', '上斜哑铃飞鸟', 'Incline Dumbbell Fly', 'dumbbell', W, ['chest'], [], 1, [], ['dumbbell_fly'], ['shoulder']],
  ['dumbbell_pullover', '哑铃仰卧上拉', 'Dumbbell Pullover', 'dumbbell', W, ['chest'], ['lats', 'triceps'], 2, [], [], ['shoulder']],
  ['machine_chest_press', '坐姿推胸机', 'Machine Chest Press', 'machine', W, ['chest'], ['triceps'], 1, ['背贴椅背', '不要锁死手肘'], ['dumbbell_bench_press'], []],
  ['pec_deck', '蝴蝶机夹胸', 'Pec Deck Fly', 'machine', W, ['chest'], [], 1, [], ['cable_crossover'], ['shoulder']],
  ['cable_crossover', '绳索十字夹胸', 'Cable Crossover', 'cable', W, ['chest'], [], 1, ['身体前倾稳定', '顶峰收缩停顿'], ['pec_deck', 'dumbbell_fly'], []],
  ['low_cable_fly', '低位绳索夹胸', 'Low-to-High Cable Fly', 'cable', W, ['chest'], ['front_delt'], 1, [], ['cable_crossover'], []],
  ['push_up', '俯卧撑', 'Push-Up', 'bodyweight', RP, ['chest'], ['triceps', 'core'], 1, ['身体成一条直线', '大臂与躯干约45度'], ['knee_push_up', 'dumbbell_bench_press'], ['wrist']],
  ['knee_push_up', '跪姿俯卧撑', 'Knee Push-Up', 'bodyweight', RP, ['chest'], ['triceps'], 1, [], ['push_up'], ['wrist']],
  ['wide_push_up', '宽距俯卧撑', 'Wide Push-Up', 'bodyweight', RP, ['chest'], ['front_delt'], 1, [], ['push_up'], ['wrist', 'shoulder']],
  ['diamond_push_up', '钻石俯卧撑', 'Diamond Push-Up', 'bodyweight', RP, ['triceps'], ['chest'], 2, [], ['close_grip_bench_press'], ['wrist', 'elbow']],
  ['incline_push_up', '上斜俯卧撑', 'Incline Push-Up', 'bodyweight', RP, ['chest'], ['triceps'], 1, [], ['push_up'], ['wrist']],
  ['decline_push_up', '下斜俯卧撑', 'Decline Push-Up', 'bodyweight', RP, ['chest'], ['front_delt', 'triceps'], 2, [], ['push_up'], ['wrist', 'shoulder']],
  ['dips', '双杠臂屈伸', 'Dips', 'bodyweight', RP, ['chest'], ['triceps', 'front_delt'], 2, ['身体前倾练胸', '下放到大臂平行即可'], ['assisted_dip', 'decline_barbell_press'], ['shoulder', 'elbow']],
  ['assisted_dip', '辅助双杠臂屈伸', 'Assisted Dip', 'machine', AW, ['chest'], ['triceps'], 1, [], ['dips'], ['shoulder']],

  // ── 背 Back ──────────────────────────────────────────────
  ['deadlift', '硬拉', 'Conventional Deadlift', 'barbell', W, ['lower_back', 'hamstrings', 'glutes'], ['traps', 'forearms', 'quads'], 3, ['杠铃贴腿', '背部中立收紧', '髋膝同时伸展'], ['trap_bar_deadlift', 'romanian_deadlift'], ['lower_back']],
  ['sumo_deadlift', '相扑硬拉', 'Sumo Deadlift', 'barbell', W, ['glutes', 'quads'], ['lower_back', 'adductors'], 3, ['宽站距脚尖外展', '膝盖对准脚尖'], ['deadlift'], ['lower_back', 'hip']],
  ['trap_bar_deadlift', '六角杠硬拉', 'Trap Bar Deadlift', 'barbell', W, ['quads', 'glutes'], ['lower_back', 'traps'], 2, [], ['deadlift'], ['lower_back']],
  ['rack_pull', '架上拉', 'Rack Pull', 'barbell', W, ['lower_back', 'traps'], ['forearms'], 2, [], ['deadlift'], ['lower_back']],
  ['barbell_row', '杠铃划船', 'Barbell Bent-Over Row', 'barbell', W, ['back', 'lats'], ['biceps', 'rear_delt', 'lower_back'], 2, ['髋部铰链上身前倾', '拉向下腹', '控制离心'], ['dumbbell_row', 'seated_cable_row'], ['lower_back']],
  ['pendlay_row', '潘德勒划船', 'Pendlay Row', 'barbell', W, ['back', 'lats'], ['biceps'], 3, [], ['barbell_row'], ['lower_back']],
  ['t_bar_row', 'T杠划船', 'T-Bar Row', 'barbell', W, ['back', 'lats'], ['biceps', 'rear_delt'], 2, [], ['barbell_row'], ['lower_back']],
  ['landmine_row', '地雷管划船', 'Landmine Row', 'barbell', W, ['back', 'lats'], ['biceps'], 2, [], ['t_bar_row'], ['lower_back']],
  ['dumbbell_row', '单臂哑铃划船', 'One-Arm Dumbbell Row', 'dumbbell', W, ['back', 'lats'], ['biceps', 'rear_delt'], 1, ['单手撑凳背部放平', '肘部贴身后拉'], ['barbell_row', 'seated_cable_row'], []],
  ['chest_supported_row', '上斜凳支撑划船', 'Chest-Supported Row', 'dumbbell', W, ['back'], ['biceps', 'rear_delt'], 1, [], ['machine_row'], []],
  ['seal_row', '海豹划船', 'Seal Row', 'barbell', W, ['back', 'lats'], ['biceps'], 2, [], ['chest_supported_row'], []],
  ['lat_pulldown', '高位下拉', 'Lat Pulldown', 'cable', W, ['lats'], ['biceps', 'rear_delt'], 1, ['挺胸下拉至锁骨', '不靠惯性后仰'], ['pull_up', 'machine_pulldown'], []],
  ['close_grip_pulldown', '窄距下拉', 'Close-Grip Pulldown', 'cable', W, ['lats'], ['biceps'], 1, [], ['lat_pulldown'], []],
  ['seated_cable_row', '坐姿绳索划船', 'Seated Cable Row', 'cable', W, ['back'], ['biceps', 'lats'], 1, ['挺胸收腹', '肩胛骨后收'], ['machine_row', 'barbell_row'], []],
  ['straight_arm_pulldown', '直臂下压', 'Straight-Arm Pulldown', 'cable', W, ['lats'], ['triceps'], 1, [], ['dumbbell_pullover'], []],
  ['face_pull', '面拉', 'Face Pull', 'cable', W, ['rear_delt'], ['traps'], 1, ['绳索拉向面部', '外旋肩关节'], ['reverse_pec_deck'], []],
  ['pull_up', '引体向上', 'Pull-Up', 'bodyweight', RP, ['lats'], ['biceps', 'back'], 3, ['肩胛下沉启动', '下巴过杠'], ['assisted_pull_up', 'lat_pulldown'], ['shoulder', 'elbow']],
  ['chin_up', '反手引体向上', 'Chin-Up', 'bodyweight', RP, ['lats', 'biceps'], ['back'], 2, [], ['pull_up', 'lat_pulldown'], ['elbow']],
  ['neutral_grip_pull_up', '对握引体向上', 'Neutral-Grip Pull-Up', 'bodyweight', RP, ['lats'], ['biceps'], 2, [], ['pull_up'], []],
  ['assisted_pull_up', '辅助引体向上', 'Assisted Pull-Up', 'machine', AW, ['lats'], ['biceps'], 1, [], ['pull_up', 'lat_pulldown'], []],
  ['inverted_row', '反向划船', 'Inverted Row', 'bodyweight', RP, ['back'], ['biceps'], 1, [], ['seated_cable_row'], []],
  ['machine_row', '坐姿划船机', 'Machine Row', 'machine', W, ['back'], ['biceps'], 1, [], ['seated_cable_row'], []],
  ['machine_pulldown', '下拉机', 'Machine Pulldown', 'machine', W, ['lats'], ['biceps'], 1, [], ['lat_pulldown'], []],
  ['barbell_shrug', '杠铃耸肩', 'Barbell Shrug', 'barbell', W, ['traps'], ['forearms'], 1, [], ['dumbbell_shrug'], ['neck']],
  ['dumbbell_shrug', '哑铃耸肩', 'Dumbbell Shrug', 'dumbbell', W, ['traps'], ['forearms'], 1, [], ['barbell_shrug'], ['neck']],
  ['good_morning', '早安式体前屈', 'Good Morning', 'barbell', W, ['hamstrings', 'lower_back'], ['glutes'], 3, ['轻重量起步', '髋部铰链'], ['romanian_deadlift'], ['lower_back']],
  ['back_extension', '山羊挺身', 'Back Extension', 'bodyweight', RP, ['lower_back'], ['glutes', 'hamstrings'], 1, [], ['good_morning'], ['lower_back']],
  ['reverse_hyperextension', '反向山羊挺身', 'Reverse Hyperextension', 'machine', W, ['glutes', 'lower_back'], ['hamstrings'], 2, [], ['back_extension'], []],

  // ── 肩 Shoulders ─────────────────────────────────────────
  ['overhead_press', '杠铃站姿推举', 'Overhead Press', 'barbell', W, ['front_delt'], ['triceps', 'core'], 2, ['核心收紧不塌腰', '杠铃过头后微后移'], ['seated_barbell_press', 'dumbbell_shoulder_press'], ['shoulder', 'lower_back']],
  ['seated_barbell_press', '杠铃坐姿推举', 'Seated Barbell Press', 'barbell', W, ['front_delt'], ['triceps'], 2, [], ['overhead_press'], ['shoulder']],
  ['push_press', '借力推举', 'Push Press', 'barbell', W, ['front_delt'], ['triceps', 'quads'], 3, [], ['overhead_press'], ['shoulder', 'lower_back']],
  ['dumbbell_shoulder_press', '哑铃肩上推举', 'Dumbbell Shoulder Press', 'dumbbell', W, ['front_delt'], ['triceps', 'side_delt'], 1, ['小臂垂直地面', '不耸肩'], ['machine_shoulder_press', 'overhead_press'], ['shoulder']],
  ['arnold_press', '阿诺德推举', 'Arnold Press', 'dumbbell', W, ['front_delt', 'side_delt'], ['triceps'], 2, [], ['dumbbell_shoulder_press'], ['shoulder']],
  ['lateral_raise', '哑铃侧平举', 'Dumbbell Lateral Raise', 'dumbbell', W, ['side_delt'], [], 1, ['小指略高于拇指', '肘部微屈', '不借力甩动'], ['cable_lateral_raise', 'machine_lateral_raise'], []],
  ['cable_lateral_raise', '绳索侧平举', 'Cable Lateral Raise', 'cable', W, ['side_delt'], [], 1, [], ['lateral_raise'], []],
  ['machine_lateral_raise', '侧平举机', 'Machine Lateral Raise', 'machine', W, ['side_delt'], [], 1, [], ['lateral_raise'], []],
  ['front_raise', '前平举', 'Front Raise', 'dumbbell', W, ['front_delt'], [], 1, [], ['lateral_raise'], []],
  ['bent_over_lateral_raise', '俯身飞鸟', 'Bent-Over Lateral Raise', 'dumbbell', W, ['rear_delt'], ['back'], 1, ['俯身背平', '肘部微屈向外打开'], ['reverse_pec_deck', 'face_pull'], ['lower_back']],
  ['reverse_pec_deck', '反向蝴蝶机', 'Reverse Pec Deck', 'machine', W, ['rear_delt'], [], 1, [], ['bent_over_lateral_raise', 'face_pull'], []],
  ['upright_row', '直立划船', 'Upright Row', 'barbell', W, ['side_delt', 'traps'], ['biceps'], 2, ['拉至胸口即可，不过高'], ['lateral_raise'], ['shoulder', 'wrist']],
  ['machine_shoulder_press', '推肩机', 'Machine Shoulder Press', 'machine', W, ['front_delt'], ['triceps'], 1, [], ['dumbbell_shoulder_press'], ['shoulder']],
  ['landmine_press', '地雷管推举', 'Landmine Press', 'barbell', W, ['front_delt'], ['chest', 'triceps'], 1, [], ['dumbbell_shoulder_press'], []],

  // ── 二头 Biceps ──────────────────────────────────────────
  ['barbell_curl', '杠铃弯举', 'Barbell Curl', 'barbell', W, ['biceps'], ['forearms'], 1, ['大臂固定贴身', '控制下放'], ['ez_bar_curl', 'dumbbell_curl'], ['elbow', 'wrist']],
  ['ez_bar_curl', '曲杆弯举', 'EZ-Bar Curl', 'barbell', W, ['biceps'], ['forearms'], 1, [], ['barbell_curl'], ['elbow']],
  ['preacher_curl', '牧师凳弯举', 'Preacher Curl', 'barbell', W, ['biceps'], [], 1, [], ['machine_curl'], ['elbow']],
  ['dumbbell_curl', '哑铃弯举', 'Dumbbell Curl', 'dumbbell', W, ['biceps'], ['forearms'], 1, [], ['barbell_curl', 'cable_curl'], []],
  ['hammer_curl', '锤式弯举', 'Hammer Curl', 'dumbbell', W, ['biceps', 'forearms'], [], 1, [], ['dumbbell_curl'], []],
  ['incline_dumbbell_curl', '上斜哑铃弯举', 'Incline Dumbbell Curl', 'dumbbell', W, ['biceps'], [], 2, [], ['dumbbell_curl'], ['shoulder']],
  ['concentration_curl', '集中弯举', 'Concentration Curl', 'dumbbell', W, ['biceps'], [], 1, [], ['dumbbell_curl'], []],
  ['spider_curl', '蜘蛛弯举', 'Spider Curl', 'dumbbell', W, ['biceps'], [], 1, [], ['preacher_curl'], []],
  ['cable_curl', '绳索弯举', 'Cable Curl', 'cable', W, ['biceps'], ['forearms'], 1, [], ['dumbbell_curl'], []],
  ['machine_curl', '弯举机', 'Machine Curl', 'machine', W, ['biceps'], [], 1, [], ['preacher_curl'], []],
  ['reverse_curl', '反握弯举', 'Reverse Curl', 'barbell', W, ['forearms', 'biceps'], [], 1, [], ['hammer_curl'], ['wrist']],

  // ── 三头 Triceps ─────────────────────────────────────────
  ['skullcrusher', '仰卧臂屈伸', 'Skullcrusher', 'barbell', W, ['triceps'], [], 2, ['大臂垂直固定', '下放至额头上方'], ['overhead_cable_extension', 'cable_pushdown'], ['elbow']],
  ['overhead_dumbbell_extension', '哑铃颈后臂屈伸', 'Overhead Dumbbell Extension', 'dumbbell', W, ['triceps'], [], 1, [], ['overhead_cable_extension'], ['elbow', 'shoulder']],
  ['cable_pushdown', '绳索下压（直杆）', 'Cable Pushdown', 'cable', W, ['triceps'], [], 1, ['大臂贴身固定', '完全伸直停顿'], ['rope_pushdown'], []],
  ['rope_pushdown', '绳索下压（绳）', 'Rope Pushdown', 'cable', W, ['triceps'], [], 1, [], ['cable_pushdown'], []],
  ['overhead_cable_extension', '绳索过顶臂屈伸', 'Overhead Cable Extension', 'cable', W, ['triceps'], [], 1, [], ['overhead_dumbbell_extension'], ['shoulder']],
  ['triceps_kickback', '俯身臂屈伸', 'Triceps Kickback', 'dumbbell', W, ['triceps'], [], 1, [], ['rope_pushdown'], []],
  ['bench_dip', '凳上反屈伸', 'Bench Dip', 'bodyweight', RP, ['triceps'], ['front_delt'], 1, [], ['dips', 'cable_pushdown'], ['shoulder']],
  ['machine_triceps_extension', '臂屈伸机', 'Machine Triceps Extension', 'machine', W, ['triceps'], [], 1, [], ['cable_pushdown'], []],

  // ── 前臂/握力 Forearms & Grip ────────────────────────────
  ['wrist_curl', '腕弯举', 'Wrist Curl', 'dumbbell', W, ['forearms'], [], 1, [], [], ['wrist']],
  ['reverse_wrist_curl', '反腕弯举', 'Reverse Wrist Curl', 'dumbbell', W, ['forearms'], [], 1, [], [], ['wrist']],
  ['farmers_carry', '农夫行走', "Farmer's Carry", 'dumbbell', DU, ['forearms', 'traps'], ['core', 'full_body'], 1, ['挺胸收腹快步走'], ['suitcase_carry'], []],
  ['suitcase_carry', '单侧负重行走', 'Suitcase Carry', 'dumbbell', DU, ['core', 'forearms'], ['traps'], 1, [], ['farmers_carry'], []],
  ['dead_hang', '单杠悬垂', 'Dead Hang', 'bodyweight', DU, ['forearms'], ['lats'], 1, [], [], ['shoulder']],

  // ── 股四头/腿 Quads & Legs ───────────────────────────────
  ['back_squat', '杠铃深蹲', 'Barbell Back Squat', 'barbell', W, ['quads', 'glutes'], ['hamstrings', 'core', 'lower_back'], 3, ['脚尖与膝盖方向一致', '下蹲至大腿平行或更低', '核心全程收紧'], ['goblet_squat', 'leg_press', 'smith_squat'], ['knee', 'lower_back']],
  ['front_squat', '前蹲', 'Front Squat', 'barbell', W, ['quads'], ['glutes', 'core'], 3, ['肘部抬高', '躯干保持直立'], ['goblet_squat'], ['knee', 'wrist']],
  ['box_squat', '箱式深蹲', 'Box Squat', 'barbell', W, ['quads', 'glutes'], ['hamstrings'], 2, [], ['back_squat'], ['knee']],
  ['paused_squat', '暂停深蹲', 'Paused Squat', 'barbell', W, ['quads', 'glutes'], ['core'], 3, [], ['back_squat'], ['knee', 'lower_back']],
  ['overhead_squat', '过顶深蹲', 'Overhead Squat', 'barbell', W, ['quads', 'core'], ['front_delt', 'glutes'], 3, [], ['front_squat'], ['shoulder', 'knee']],
  ['zercher_squat', '泽奇深蹲', 'Zercher Squat', 'barbell', W, ['quads', 'glutes'], ['core', 'biceps'], 3, [], ['front_squat'], ['knee', 'elbow']],
  ['smith_squat', '史密斯深蹲', 'Smith Machine Squat', 'machine', W, ['quads', 'glutes'], ['hamstrings'], 1, [], ['back_squat', 'leg_press'], ['knee']],
  ['goblet_squat', '高脚杯深蹲', 'Goblet Squat', 'dumbbell', W, ['quads', 'glutes'], ['core'], 1, ['哑铃贴胸', '挺胸下蹲'], ['back_squat', 'leg_press'], ['knee']],
  ['sumo_squat', '相扑深蹲', 'Sumo Squat', 'dumbbell', W, ['quads', 'adductors', 'glutes'], [], 1, [], ['goblet_squat'], ['knee', 'hip']],
  ['bulgarian_split_squat', '保加利亚分腿蹲', 'Bulgarian Split Squat', 'dumbbell', W, ['quads', 'glutes'], ['hamstrings'], 2, ['后脚搭凳', '重心在前腿'], ['split_squat', 'walking_lunge'], ['knee']],
  ['split_squat', '分腿蹲', 'Split Squat', 'bodyweight', RP, ['quads', 'glutes'], [], 1, [], ['bulgarian_split_squat'], ['knee']],
  ['walking_lunge', '行走箭步蹲', 'Walking Lunge', 'dumbbell', W, ['quads', 'glutes'], ['hamstrings'], 2, ['步幅适中', '后膝接近地面'], ['reverse_lunge', 'split_squat'], ['knee']],
  ['reverse_lunge', '后撤箭步蹲', 'Reverse Lunge', 'dumbbell', W, ['quads', 'glutes'], [], 1, [], ['walking_lunge'], ['knee']],
  ['lateral_lunge', '侧向箭步蹲', 'Lateral Lunge', 'bodyweight', RP, ['quads', 'adductors'], ['glutes'], 2, [], ['reverse_lunge'], ['knee', 'hip']],
  ['curtsy_lunge', '交叉后撤蹲', 'Curtsy Lunge', 'bodyweight', RP, ['glutes', 'quads'], ['abductors'], 2, [], ['reverse_lunge'], ['knee']],
  ['step_up', '负重登台阶', 'Dumbbell Step-Up', 'dumbbell', W, ['quads', 'glutes'], [], 1, [], ['bulgarian_split_squat'], ['knee']],
  ['leg_press', '倒蹬机', 'Leg Press', 'machine', W, ['quads', 'glutes'], ['hamstrings'], 1, ['下放至90度左右', '不要锁死膝盖'], ['hack_squat', 'goblet_squat'], ['knee']],
  ['hack_squat', '哈克深蹲机', 'Hack Squat', 'machine', W, ['quads'], ['glutes'], 2, [], ['leg_press'], ['knee']],
  ['leg_extension', '腿屈伸机', 'Leg Extension', 'machine', W, ['quads'], [], 1, ['顶端停顿1秒', '控制下放'], ['sissy_squat'], ['knee']],
  ['sissy_squat', '西西深蹲', 'Sissy Squat', 'bodyweight', RP, ['quads'], [], 3, [], ['leg_extension'], ['knee']],
  ['pistol_squat', '单腿深蹲', 'Pistol Squat', 'bodyweight', RP, ['quads', 'glutes'], ['core'], 3, [], ['bulgarian_split_squat'], ['knee']],
  ['wall_sit', '靠墙静蹲', 'Wall Sit', 'bodyweight', DU, ['quads'], [], 1, [], ['leg_extension'], ['knee']],
  ['jump_squat', '深蹲跳', 'Jump Squat', 'bodyweight', RP, ['quads', 'glutes'], ['calves'], 2, [], ['box_jump'], ['knee', 'ankle']],
  ['box_jump', '跳箱', 'Box Jump', 'bodyweight', RP, ['quads', 'glutes'], ['calves'], 2, [], ['jump_squat'], ['knee', 'ankle']],

  // ── 腘绳肌/臀 Hamstrings & Glutes ────────────────────────
  ['romanian_deadlift', '罗马尼亚硬拉', 'Romanian Deadlift', 'barbell', W, ['hamstrings', 'glutes'], ['lower_back'], 2, ['髋部后移铰链', '杠铃贴腿下滑至小腿中部', '背部全程中立'], ['dumbbell_rdl', 'leg_curl'], ['lower_back']],
  ['stiff_leg_deadlift', '直腿硬拉', 'Stiff-Leg Deadlift', 'barbell', W, ['hamstrings'], ['lower_back', 'glutes'], 3, [], ['romanian_deadlift'], ['lower_back']],
  ['dumbbell_rdl', '哑铃罗马尼亚硬拉', 'Dumbbell RDL', 'dumbbell', W, ['hamstrings', 'glutes'], ['lower_back'], 1, [], ['romanian_deadlift'], ['lower_back']],
  ['single_leg_rdl', '单腿罗马尼亚硬拉', 'Single-Leg RDL', 'dumbbell', W, ['hamstrings', 'glutes'], ['core'], 2, [], ['dumbbell_rdl'], []],
  ['lying_leg_curl', '俯卧腿弯举', 'Lying Leg Curl', 'machine', W, ['hamstrings'], [], 1, [], ['seated_leg_curl'], ['knee']],
  ['seated_leg_curl', '坐姿腿弯举', 'Seated Leg Curl', 'machine', W, ['hamstrings'], [], 1, [], ['lying_leg_curl'], ['knee']],
  ['leg_curl', '腿弯举', 'Leg Curl', 'machine', W, ['hamstrings'], [], 1, [], ['lying_leg_curl', 'seated_leg_curl'], ['knee']],
  ['nordic_curl', '北欧腿弯举', 'Nordic Hamstring Curl', 'bodyweight', RP, ['hamstrings'], [], 3, [], ['leg_curl'], ['knee']],
  ['glute_bridge', '臀桥', 'Glute Bridge', 'bodyweight', RP, ['glutes'], ['hamstrings'], 1, ['顶峰收缩夹紧臀部'], ['hip_thrust'], []],
  ['hip_thrust', '杠铃臀推', 'Barbell Hip Thrust', 'barbell', W, ['glutes'], ['hamstrings'], 2, ['下巴微收', '顶端完全伸髋'], ['glute_bridge', 'machine_hip_thrust'], ['lower_back']],
  ['machine_hip_thrust', '臀推机', 'Machine Hip Thrust', 'machine', W, ['glutes'], ['hamstrings'], 1, [], ['hip_thrust'], []],
  ['cable_pull_through', '绳索髋屈伸', 'Cable Pull-Through', 'cable', W, ['glutes', 'hamstrings'], [], 1, [], ['romanian_deadlift'], []],
  ['cable_glute_kickback', '绳索后踢腿', 'Cable Glute Kickback', 'cable', W, ['glutes'], [], 1, [], ['machine_hip_thrust'], []],
  ['abductor_machine', '髋外展机', 'Hip Abductor Machine', 'machine', W, ['abductors', 'glutes'], [], 1, [], [], []],
  ['adductor_machine', '髋内收机', 'Hip Adductor Machine', 'machine', W, ['adductors'], [], 1, [], [], ['hip']],
  ['kettlebell_swing', '壶铃摆荡', 'Kettlebell Swing', 'kettlebell', W, ['glutes', 'hamstrings'], ['core', 'full_body'], 2, ['髋部发力甩动', '手臂放松'], ['cable_pull_through'], ['lower_back']],

  // ── 小腿 Calves ──────────────────────────────────────────
  ['standing_calf_raise', '站姿提踵', 'Standing Calf Raise', 'machine', W, ['calves'], [], 1, ['底部充分拉伸', '顶端停顿'], ['single_leg_calf_raise'], ['ankle']],
  ['seated_calf_raise', '坐姿提踵', 'Seated Calf Raise', 'machine', W, ['calves'], [], 1, [], ['standing_calf_raise'], []],
  ['single_leg_calf_raise', '单腿提踵', 'Single-Leg Calf Raise', 'bodyweight', RP, ['calves'], [], 1, [], ['standing_calf_raise'], ['ankle']],
  ['leg_press_calf_raise', '倒蹬机提踵', 'Leg Press Calf Raise', 'machine', W, ['calves'], [], 1, [], ['standing_calf_raise'], []],

  // ── 核心 Core ────────────────────────────────────────────
  ['plank', '平板支撑', 'Plank', 'bodyweight', DU, ['core'], [], 1, ['身体成直线', '臀部不塌不翘'], ['weighted_plank'], []],
  ['weighted_plank', '负重平板支撑', 'Weighted Plank', 'bodyweight', DU, ['core'], [], 2, [], ['plank'], []],
  ['side_plank', '侧平板支撑', 'Side Plank', 'bodyweight', DU, ['core'], ['abductors'], 1, [], ['plank'], []],
  ['copenhagen_plank', '哥本哈根平板', 'Copenhagen Plank', 'bodyweight', DU, ['adductors', 'core'], [], 3, [], ['side_plank'], ['hip']],
  ['crunch', '卷腹', 'Crunch', 'bodyweight', RP, ['core'], [], 1, ['下背贴地', '呼气卷起'], ['cable_crunch'], ['neck']],
  ['bicycle_crunch', '自行车卷腹', 'Bicycle Crunch', 'bodyweight', RP, ['core'], ['hip_flexors'], 1, [], ['crunch'], ['neck']],
  ['oblique_crunch', '侧腹卷腹', 'Oblique Crunch', 'bodyweight', RP, ['core'], [], 1, [], ['russian_twist'], []],
  ['sit_up', '仰卧起坐', 'Sit-Up', 'bodyweight', RP, ['core', 'hip_flexors'], [], 1, [], ['crunch'], ['lower_back', 'neck']],
  ['decline_sit_up', '下斜仰卧起坐', 'Decline Sit-Up', 'bodyweight', RP, ['core', 'hip_flexors'], [], 2, [], ['sit_up'], ['lower_back']],
  ['cable_crunch', '绳索卷腹', 'Cable Crunch', 'cable', W, ['core'], [], 1, [], ['machine_crunch', 'crunch'], []],
  ['machine_crunch', '卷腹机', 'Machine Crunch', 'machine', W, ['core'], [], 1, [], ['cable_crunch'], []],
  ['hanging_knee_raise', '悬垂举膝', 'Hanging Knee Raise', 'bodyweight', RP, ['core', 'hip_flexors'], ['forearms'], 2, [], ['lying_leg_raise'], []],
  ['hanging_leg_raise', '悬垂举腿', 'Hanging Leg Raise', 'bodyweight', RP, ['core', 'hip_flexors'], ['forearms'], 3, [], ['hanging_knee_raise'], []],
  ['toes_to_bar', '脚尖触杠', 'Toes-to-Bar', 'bodyweight', RP, ['core'], ['lats', 'hip_flexors'], 3, [], ['hanging_leg_raise'], ['shoulder']],
  ['lying_leg_raise', '仰卧举腿', 'Lying Leg Raise', 'bodyweight', RP, ['core', 'hip_flexors'], [], 1, [], ['hanging_knee_raise'], ['lower_back']],
  ['flutter_kick', '仰卧交替抬腿', 'Flutter Kicks', 'bodyweight', DU, ['core', 'hip_flexors'], [], 1, [], ['lying_leg_raise'], ['lower_back']],
  ['v_up', 'V字两头起', 'V-Up', 'bodyweight', RP, ['core'], ['hip_flexors'], 2, [], ['sit_up'], ['lower_back']],
  ['russian_twist', '俄罗斯转体', 'Russian Twist', 'bodyweight', RP, ['core'], [], 1, [], ['cable_woodchop'], ['lower_back']],
  ['cable_woodchop', '绳索砍伐', 'Cable Woodchop', 'cable', W, ['core'], [], 1, [], ['russian_twist'], []],
  ['pallof_press', '帕洛夫推举', 'Pallof Press', 'cable', W, ['core'], [], 1, [], ['cable_woodchop'], []],
  ['ab_wheel_rollout', '健腹轮', 'Ab Wheel Rollout', 'bodyweight', RP, ['core'], ['lats'], 2, ['骨盆后倾', '不塌腰'], ['plank'], ['lower_back', 'shoulder']],
  ['mountain_climber', '登山跑', 'Mountain Climber', 'bodyweight', DU, ['core'], ['hip_flexors', 'cardio'], 1, [], ['plank'], ['wrist']],
  ['dead_bug', '死虫式', 'Dead Bug', 'bodyweight', RP, ['core'], [], 1, [], ['bird_dog'], []],
  ['bird_dog', '鸟狗式', 'Bird Dog', 'bodyweight', RP, ['core', 'lower_back'], ['glutes'], 1, [], ['dead_bug'], []],
  ['hollow_hold', '空心支撑', 'Hollow Body Hold', 'bodyweight', DU, ['core'], [], 2, [], ['plank'], []],
  ['superman', '飞燕/超人式', 'Superman', 'bodyweight', RP, ['lower_back'], ['glutes'], 1, [], ['bird_dog'], []],
  ['side_bend', '哑铃侧屈', 'Dumbbell Side Bend', 'dumbbell', W, ['core'], [], 1, [], ['side_plank'], ['lower_back']],
  ['dragon_flag', '龙旗', 'Dragon Flag', 'bodyweight', RP, ['core'], [], 3, [], ['hanging_leg_raise'], ['lower_back', 'shoulder']],
  ['l_sit', 'L型支撑', 'L-Sit', 'bodyweight', DU, ['core', 'hip_flexors'], ['triceps'], 3, [], ['hollow_hold'], ['wrist']],

  // ── 全身/爆发 Full Body & Power ─────────────────────────
  ['power_clean', '高翻', 'Power Clean', 'barbell', W, ['full_body'], ['traps', 'quads', 'glutes'], 3, ['需教练指导动作模式'], ['kettlebell_clean'], ['lower_back', 'wrist']],
  ['barbell_thruster', '杠铃推蹲', 'Barbell Thruster', 'barbell', W, ['full_body'], ['quads', 'front_delt'], 3, [], ['dumbbell_thruster'], ['shoulder', 'knee']],
  ['dumbbell_thruster', '哑铃推蹲', 'Dumbbell Thruster', 'dumbbell', W, ['full_body'], ['quads', 'front_delt'], 2, [], ['barbell_thruster'], ['shoulder', 'knee']],
  ['burpee', '波比跳', 'Burpee', 'bodyweight', RP, ['full_body', 'cardio'], [], 2, [], ['mountain_climber'], ['knee', 'wrist']],
  ['bear_crawl', '熊爬', 'Bear Crawl', 'bodyweight', DU, ['full_body', 'core'], [], 1, [], ['mountain_climber'], ['wrist']],
  ['battle_ropes', '战绳', 'Battle Ropes', 'other', DU, ['full_body', 'cardio'], ['front_delt', 'core'], 1, [], ['burpee'], []],
  ['sled_push', '推雪橇', 'Sled Push', 'other', DD, ['full_body', 'quads'], ['glutes', 'cardio'], 2, [], ['sled_drag'], []],
  ['sled_drag', '拉雪橇', 'Sled Drag', 'other', DD, ['full_body', 'hamstrings'], ['glutes'], 2, [], ['sled_push'], []],
  ['broad_jump', '立定跳远', 'Broad Jump', 'bodyweight', RP, ['quads', 'glutes'], ['calves'], 2, [], ['box_jump'], ['knee', 'ankle']],
  ['turkish_get_up', '土耳其起立', 'Turkish Get-Up', 'kettlebell', W, ['full_body', 'core'], ['front_delt'], 3, [], [], ['shoulder']],

  // ── 壶铃 Kettlebell ─────────────────────────────────────
  ['kettlebell_goblet_squat', '壶铃高脚杯深蹲', 'Kettlebell Goblet Squat', 'kettlebell', W, ['quads', 'glutes'], ['core'], 1, [], ['goblet_squat'], ['knee']],
  ['kettlebell_deadlift', '壶铃硬拉', 'Kettlebell Deadlift', 'kettlebell', W, ['glutes', 'hamstrings'], ['lower_back'], 1, [], ['deadlift'], ['lower_back']],
  ['kettlebell_clean', '壶铃翻', 'Kettlebell Clean', 'kettlebell', W, ['full_body'], ['glutes', 'traps'], 2, [], ['kettlebell_swing'], ['wrist']],
  ['kettlebell_snatch', '壶铃抓举', 'Kettlebell Snatch', 'kettlebell', W, ['full_body'], ['front_delt', 'glutes'], 3, [], ['kettlebell_clean'], ['shoulder', 'wrist']],
  ['kettlebell_press', '壶铃推举', 'Kettlebell Press', 'kettlebell', W, ['front_delt'], ['triceps', 'core'], 2, [], ['dumbbell_shoulder_press'], ['shoulder']],
  ['kettlebell_row', '壶铃划船', 'Kettlebell Row', 'kettlebell', W, ['back', 'lats'], ['biceps'], 1, [], ['dumbbell_row'], ['lower_back']],
  ['kettlebell_lunge', '壶铃箭步蹲', 'Kettlebell Lunge', 'kettlebell', W, ['quads', 'glutes'], [], 2, [], ['walking_lunge'], ['knee']],

  // ── 进阶变式 Advanced Variants ──────────────────────────
  ['weighted_pull_up', '负重引体向上', 'Weighted Pull-Up', 'bodyweight', W, ['lats'], ['biceps', 'back'], 3, [], ['pull_up'], ['shoulder', 'elbow']],
  ['weighted_dip', '负重双杠臂屈伸', 'Weighted Dip', 'bodyweight', W, ['chest', 'triceps'], ['front_delt'], 3, [], ['dips'], ['shoulder', 'elbow']],
  ['smith_incline_press', '史密斯上斜卧推', 'Smith Incline Press', 'machine', W, ['chest'], ['front_delt', 'triceps'], 1, [], ['incline_barbell_press'], ['shoulder']],
  ['smith_row', '史密斯划船', 'Smith Machine Row', 'machine', W, ['back', 'lats'], ['biceps'], 1, [], ['barbell_row'], ['lower_back']],
  ['single_arm_cable_row', '单臂绳索划船', 'Single-Arm Cable Row', 'cable', W, ['back', 'lats'], ['biceps'], 1, [], ['seated_cable_row'], []],
  ['cable_rear_delt_fly', '绳索反向飞鸟', 'Cable Rear Delt Fly', 'cable', W, ['rear_delt'], [], 1, [], ['reverse_pec_deck', 'face_pull'], []],
  ['dumbbell_standing_calf_raise', '哑铃站姿提踵', 'Dumbbell Standing Calf Raise', 'dumbbell', W, ['calves'], [], 1, [], ['standing_calf_raise'], ['ankle']],
  ['glute_ham_raise', '臀腿抬升', 'Glute-Ham Raise', 'machine', RP, ['hamstrings', 'glutes'], ['lower_back'], 3, [], ['nordic_curl'], ['knee']],

  // ── 有氧 Cardio ─────────────────────────────────────────
  ['treadmill_run', '跑步机跑步', 'Treadmill Run', 'cardio_machine', DD, ['cardio'], ['quads', 'calves'], 1, [], ['outdoor_run'], ['knee', 'ankle']],
  ['outdoor_run', '户外跑步', 'Outdoor Run', 'bodyweight', DD, ['cardio'], ['quads', 'calves'], 1, [], ['treadmill_run'], ['knee', 'ankle']],
  ['sprint_intervals', '冲刺间歇', 'Sprint Intervals', 'bodyweight', DD, ['cardio', 'full_body'], ['quads', 'hamstrings'], 3, [], ['outdoor_run'], ['knee', 'ankle']],
  ['walk', '步行', 'Walking', 'bodyweight', DD, ['cardio'], [], 1, [], ['incline_walk'], []],
  ['incline_walk', '坡度快走', 'Incline Treadmill Walk', 'cardio_machine', DD, ['cardio'], ['glutes', 'calves'], 1, [], ['walk'], []],
  ['hiking', '徒步登山', 'Hiking', 'bodyweight', DD, ['cardio'], ['quads', 'glutes'], 1, [], ['incline_walk'], ['knee', 'ankle']],
  ['outdoor_cycling', '户外骑行', 'Outdoor Cycling', 'other', DD, ['cardio'], ['quads'], 1, [], ['stationary_bike'], ['knee']],
  ['stationary_bike', '动感单车/健身车', 'Stationary Bike', 'cardio_machine', DD, ['cardio'], ['quads'], 1, [], ['outdoor_cycling'], ['knee']],
  ['assault_bike', '风阻单车', 'Assault Bike', 'cardio_machine', DD, ['cardio', 'full_body'], [], 2, [], ['stationary_bike'], []],
  ['elliptical', '椭圆机', 'Elliptical', 'cardio_machine', DD, ['cardio'], ['quads', 'glutes'], 1, [], ['incline_walk'], []],
  ['rowing_machine', '划船机', 'Rowing Machine', 'cardio_machine', DD, ['cardio', 'back'], ['quads', 'biceps'], 2, ['腿-躯干-手臂发力顺序'], ['elliptical'], ['lower_back']],
  ['ski_erg', '滑雪机', 'Ski Erg', 'cardio_machine', DD, ['cardio', 'lats'], ['core', 'triceps'], 2, [], ['rowing_machine'], []],
  ['stair_climber', '爬楼机', 'Stair Climber', 'cardio_machine', DD, ['cardio'], ['glutes', 'quads'], 1, [], ['incline_walk'], ['knee']],
  ['swimming', '游泳', 'Swimming', 'other', DD, ['cardio', 'full_body'], ['back', 'front_delt'], 2, [], [], []],
  ['jump_rope', '跳绳', 'Jump Rope', 'other', DU, ['cardio'], ['calves'], 1, [], ['jumping_jack'], ['knee', 'ankle']],
  ['jumping_jack', '开合跳', 'Jumping Jack', 'bodyweight', DU, ['cardio'], ['full_body'], 1, [], ['jump_rope'], ['knee']],
  ['high_knees', '高抬腿', 'High Knees', 'bodyweight', DU, ['cardio'], ['hip_flexors'], 1, [], ['jumping_jack'], ['knee']],
  ['hiit_circuit', 'HIIT 循环', 'HIIT Circuit', 'bodyweight', DU, ['cardio', 'full_body'], [], 2, [], ['burpee'], ['knee']],
];

export const SEED_EXERCISES: Omit<Exercise, 'isCustom'>[] = ROWS.map(
  ([id, nameZh, nameEn, equipment, countingType, primaryMuscles, secondaryMuscles, difficulty, cues, substitutes, contraindications]) => ({
    id,
    nameZh,
    nameEn,
    equipment,
    countingType,
    primaryMuscles,
    secondaryMuscles,
    difficulty,
    cues: cues ?? [],
    substitutes: substitutes ?? [],
    contraindications: contraindications ?? [],
  }),
);

/** injury tag → additional forbidden exercise ids beyond per-exercise contraindication tags. */
export const INJURY_CONTRAINDICATION_TAGS = [
  'shoulder',
  'lower_back',
  'knee',
  'elbow',
  'wrist',
  'hip',
  'ankle',
  'neck',
] as const;

export type InjuryTag = (typeof INJURY_CONTRAINDICATION_TAGS)[number];

/** Returns ids of seed exercises contraindicated for the given injuries. */
export function forbiddenExerciseIds(injuries: string[]): Set<string> {
  const tags = new Set(injuries);
  const out = new Set<string>();
  for (const e of SEED_EXERCISES) {
    if (e.contraindications.some((c) => tags.has(c))) out.add(e.id);
  }
  return out;
}
