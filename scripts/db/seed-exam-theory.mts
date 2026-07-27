/**
 * 初级理论考试题种子：50 单选 + 40 判断 + 10 填空。
 * 来源：人工智能训练师（初级）理论考试题（100分）DOCX
 * 运行：pnpm tsx scripts/db/seed-exam-theory.mts
 * 所有题目同时写入 practice_question_items 和 exam_question_items。
 * 脚本会先清除旧 batch_seed 题目，再导入新题目。
 */
import pg from 'pg';
import { getDbUrl, loadEnv } from 'coze-coding-dev-sdk';
import { loadEnvLocal } from './_env.mjs';
loadEnv(); loadEnvLocal();

type SingleChoice = {
  type: 'single_choice';
  stem: string;
  options: [string, string, string, string];
  answer: string;
  kp: string;
  difficulty: number;
};
type TrueFalse = {
  type: 'true_false';
  stem: string;
  answer: boolean;
  kp: string;
  difficulty: number;
};
type FillInBlank = {
  type: 'fill_in_blank';
  stem: string;
  acceptable: string[];
  kp: string;
  difficulty: number;
};
type Q = SingleChoice | TrueFalse | FillInBlank;

const questions: Q[] = [
  // ═══════════════ 一、单项选择题（50题） ═══════════════
  { type: 'single_choice', stem: '人工智能训练师的核心基础工作是（  ）', options: ['软件开发', '数据处理', '设备维修', '程序开发'], answer: 'B', kp: '职业认知', difficulty: 1 },
  { type: 'single_choice', stem: '以下不属于人工智能训练师基础工作内容的是（  ）', options: ['数据采集', '数据标注', '系统编程开发', '数据清洗'], answer: 'C', kp: '职业认知', difficulty: 1 },
  { type: 'single_choice', stem: '数据采集的核心目的是（  ）', options: ['收集有效数据用于模型训练', '储存无用数据', '随意收集网络数据', '加密数据'], answer: 'A', kp: '数据采集', difficulty: 1 },
  { type: 'single_choice', stem: '采集图像数据时，以下操作符合规范的是（  ）', options: ['采集模糊、残缺图像', '采集清晰、完整、无遮挡的图像', '重复大量采集相同图像', '采集违规隐私图像'], answer: 'B', kp: '数据采集', difficulty: 1 },
  { type: 'single_choice', stem: '图像数据采集过程中，首要遵守的原则是（  ）', options: ['快速采集', '合规合法', '数量越多越好', '内容越复杂越好'], answer: 'B', kp: '数据采集', difficulty: 1 },
  { type: 'single_choice', stem: '以下属于合法数据采集渠道的是（  ）', options: ['私自爬取加密隐私数据', '公开合规数据集平台', '窃取用户私人数据', '破解后台数据采集'], answer: 'B', kp: '数据采集', difficulty: 1 },
  { type: 'single_choice', stem: '数据清洗的主要作用是（  ）', options: ['增加数据数量', '剔除无效、错误、冗余数据，提升数据质量', '加密所有数据', '修改数据原始内容'], answer: 'B', kp: '数据清洗', difficulty: 1 },
  { type: 'single_choice', stem: '数据清洗时，对于重复数据的正确处理方式是（  ）', options: ['全部保留', '删除重复冗余数据，保留唯一有效数据', '随意删除任意一条', '修改重复数据内容'], answer: 'B', kp: '数据清洗', difficulty: 1 },
  { type: 'single_choice', stem: '缺失值数据清洗的基础操作是（  ）', options: ['直接删除无效缺失数据或规范补全有效缺失数据', '忽略所有缺失值', '随意填充随机内容', '复制其他数据填充'], answer: 'A', kp: '数据清洗', difficulty: 1 },
  { type: 'single_choice', stem: '异常数据指的是（  ）', options: ['格式规范的数据', '偏离正常规则、错误、无效的数据', '数量较少的数据', '新增数据'], answer: 'B', kp: '数据清洗', difficulty: 1 },
  { type: 'single_choice', stem: '数据标注的核心定义是（  ）', options: ['对原始数据进行分类、标记、描述，赋予数据语义信息', '修改数据格式', '删除无效数据', '压缩数据大小'], answer: 'A', kp: '数据标注', difficulty: 1 },
  { type: 'single_choice', stem: '图像分类标注的基础要求是（  ）', options: ['随意归类', '按照统一标准精准划分图像类别', '多类别重复标注', '模糊标注类别'], answer: 'B', kp: '数据标注', difficulty: 1 },
  { type: 'single_choice', stem: '图像实体标注主要用于（  ）', options: ['标记文本中的人名、地名、物品等关键信息', '统计文本字数', '删除文本病句', '调整文本格式'], answer: 'A', kp: '数据标注', difficulty: 1 },
  { type: 'single_choice', stem: '语音数据标注最基础的工作是（  ）', options: ['语音转文字校对、标记静音段和杂音段', '放大语音音量', '剪辑语音时长', '转换语音格式'], answer: 'A', kp: '数据标注', difficulty: 1 },
  { type: 'single_choice', stem: '数据标注的首要原则是（  ）', options: ['快速优先', '准确统一', '数量优先', '格式多样'], answer: 'B', kp: '数据标注', difficulty: 1 },
  { type: 'single_choice', stem: '标注数据一致性的含义是（  ）', options: ['同一类数据标注标准统一、无差异化错误', '所有数据标注内容完全相同', '标注工具统一', '标注速度一致'], answer: 'A', kp: '数据标注', difficulty: 1 },
  { type: 'single_choice', stem: '以下属于数据标注常见错误的是（  ）', options: ['精准标注目标区域', '漏标、错标、重复标注', '按照规范标注', '统一标准标注'], answer: 'B', kp: '数据标注', difficulty: 1 },
  { type: 'single_choice', stem: '数据测试的主要目的是（  ）', options: ['检验数据质量、标注精度和适配模型的有效性', '增加数据数量', '修改数据内容', '压缩数据'], answer: 'A', kp: '数据测试', difficulty: 1 },
  { type: 'single_choice', stem: '数据抽样测试适用于（  ）', options: ['小批量数据', '大批量数据集快速质检', '无效数据', '错误数据'], answer: 'B', kp: '数据测试', difficulty: 1 },
  { type: 'single_choice', stem: '数据测试中，标注准确率的计算核心是（  ）', options: ['错误标注数量÷总数量', '正确标注数量÷总标注数量', '标注总数量÷数据总量', '漏标数量÷总数量'], answer: 'B', kp: '数据测试', difficulty: 2 },
  { type: 'single_choice', stem: '合格的训练数据测试标准不包括（  ）', options: ['标注准确', '数据合规', '大量冗余重复', '格式统一'], answer: 'C', kp: '数据测试', difficulty: 1 },
  { type: 'single_choice', stem: '生成式人工智能的核心特点是（  ）', options: ['只能读取数据', '可自主生成文本、图像、语音等全新内容', '只能储存数据', '只能统计数据'], answer: 'B', kp: '生成式AI', difficulty: 1 },
  { type: 'single_choice', stem: '以下属于生成式AI的是（  ）', options: ['传统数据统计工具', '智能文本生成模型', '普通计算器', '文件夹管理器'], answer: 'B', kp: '生成式AI', difficulty: 1 },
  { type: 'single_choice', stem: '生成式AI训练依赖的核心资源是（  ）', options: ['高质量标注数据', '空白数据', '杂乱无章的数据', '少量原始数据'], answer: 'A', kp: '生成式AI', difficulty: 1 },
  { type: 'single_choice', stem: '提示词（Prompt）的作用是（  ）', options: ['引导生成式AI输出指定内容', '加密AI数据', '清理AI模型', '加速AI运行'], answer: 'A', kp: '生成式AI', difficulty: 1 },
  { type: 'single_choice', stem: '优化生成式AI输出效果的基础方式是（  ）', options: ['输入模糊指令', '精准、清晰、规范的提示词', '随意输入内容', '减少输入内容'], answer: 'B', kp: '生成式AI', difficulty: 1 },
  { type: 'single_choice', stem: '生成式AI内容审核的核心是（  ）', options: ['检查内容是否合规、无违规、无错误', '增加内容字数', '修改内容格式', '简化内容'], answer: 'A', kp: '生成式AI', difficulty: 1 },
  { type: 'single_choice', stem: '智能运维的核心对象是（  ）', options: ['AI模型、训练设备、数据系统', '办公文具', '网络浏览器', '办公软件'], answer: 'A', kp: '智能运维', difficulty: 1 },
  { type: 'single_choice', stem: 'AI模型基础运维工作不包括（  ）', options: ['运行状态监控', '故障排查', '随意篡改模型参数', '日常日志查看'], answer: 'C', kp: '智能运维', difficulty: 1 },
  { type: 'single_choice', stem: '智能运维中，日志查看的主要目的是（  ）', options: ['记录工作流水', '排查模型运行异常、定位问题', '统计数据数量', '整理标注内容'], answer: 'B', kp: '智能运维', difficulty: 1 },
  { type: 'single_choice', stem: 'AI设备日常运维的基础要求是（  ）', options: ['定期检查、及时排查异常、保持设备稳定运行', '出现故障再处理', '随意开关机', '长期闲置不维护'], answer: 'A', kp: '智能运维', difficulty: 1 },
  { type: 'single_choice', stem: '模型运行卡顿的基础排查方向是（  ）', options: ['设备资源、数据负载、程序运行状态', '修改标注标准', '更换数据内容', '增加数据数量'], answer: 'A', kp: '智能运维', difficulty: 1 },
  { type: 'single_choice', stem: '数据格式统一化属于（  ）工作', options: ['数据采集', '数据清洗', '数据标注', '智能运维'], answer: 'B', kp: '数据清洗', difficulty: 1 },
  { type: 'single_choice', stem: '对采集的数据去除重复数据属于（  ）', options: ['数据标注', '数据清洗', '数据测试', '数据存储'], answer: 'B', kp: '数据清洗', difficulty: 1 },
  { type: 'single_choice', stem: '筛选出符合模型训练要求的数据属于（  ）', options: ['数据筛选清洗', '数据标注', '数据生成', '数据传输'], answer: 'A', kp: '数据清洗', difficulty: 1 },
  { type: 'single_choice', stem: '目标检测标注主要应用于（  ）场景', options: ['文本分类', '图像目标定位、识别', '语音转换', '数据统计'], answer: 'B', kp: '数据标注', difficulty: 1 },
  { type: 'single_choice', stem: '以下哪项是初级AI训练师的基础岗位职责（  ）', options: ['高端模型算法研发', '基础数据处理与标注质检', '系统架构搭建', '软件源码开发'], answer: 'B', kp: '职业认知', difficulty: 1 },
  { type: 'single_choice', stem: '数据隐私保护的基础要求是（  ）', options: ['随意使用用户隐私数据', '脱敏处理隐私数据，禁止违规泄露', '公开所有采集数据', '转发隐私数据'], answer: 'B', kp: '数据安全', difficulty: 1 },
  { type: 'single_choice', stem: '数据保护的主要作用是（  ）', options: ['保护个人隐私，规避数据合规风险', '提升数据数量', '优化标注速度', '加速模型运行'], answer: 'A', kp: '数据安全', difficulty: 1 },
  { type: 'single_choice', stem: '人工智能标注工具主要是（  ）', options: ['Python', 'Labelme', 'Photoshop', '以上均不对'], answer: 'B', kp: '标注工具', difficulty: 1 },
  { type: 'single_choice', stem: '模型训练前的必备步骤是（  ）', options: ['数据处理、标注、质检合格', '直接使用原始杂乱数据', '跳过数据测试', '随意筛选数据'], answer: 'A', kp: '数据处理', difficulty: 1 },
  { type: 'single_choice', stem: '生成式AI幻觉问题指的是（  ）', options: ['模型输出真实准确内容', '模型凭空编造虚假、错误内容', '模型运行卡顿', '模型无法启动'], answer: 'B', kp: '生成式AI', difficulty: 1 },
  { type: 'single_choice', stem: '处理生成式AI输出错误内容的基础方式是（  ）', options: ['优化提示词、校验数据、微调训练数据', '忽略错误内容', '直接删除模型', '重启设备即可'], answer: 'A', kp: '生成式AI', difficulty: 1 },
  { type: 'single_choice', stem: '智能运维中数据备份的目的是（  ）', options: ['防止数据丢失、保障数据安全', '占用存储空间', '增加数据数量', '优化标注效果'], answer: 'A', kp: '智能运维', difficulty: 1 },
  { type: 'single_choice', stem: '日常数据备份的基础原则是（  ）', options: ['定期备份、分类存储', '仅故障时备份', '长期不备份', '随意备份'], answer: 'A', kp: '智能运维', difficulty: 1 },
  { type: 'single_choice', stem: '数据测试中一致性测试主要检查（  ）', options: ['数据标注、格式、标准是否统一', '数据数量是否充足', '数据存储位置是否正确', '数据采集渠道是否合规'], answer: 'A', kp: '数据测试', difficulty: 1 },
  { type: 'single_choice', stem: '以下属于文本数据清洗操作的是（  ）', options: ['去除文本乱码、特殊无效符号', '标记文本关键词', '统计文本长度', '拆分文本段落'], answer: 'A', kp: '数据清洗', difficulty: 1 },
  { type: 'single_choice', stem: '图像数据清洗不包括（  ）', options: ['剔除模糊、曝光过度图像', '去除遮挡严重图像', '随意修改图像内容', '删除无效空白图像'], answer: 'C', kp: '数据清洗', difficulty: 1 },
  { type: 'single_choice', stem: 'AI模型稳定运行的基础前提是（  ）', options: ['数据杂乱无章', '高质量、合规、标准化数据集', '少量原始数据', '无标注数据'], answer: 'B', kp: '数据处理', difficulty: 1 },
  { type: 'single_choice', stem: '初级人工智能训练师工作的核心准则是（  ）', options: ['合规、精准、严谨、高效', '快速优先、忽略质量', '随意操作、无需规范', '只重数量、不重精度'], answer: 'A', kp: '职业素养', difficulty: 1 },

  // ═══════════════ 二、判断题（40题） ═══════════════
  { type: 'true_false', stem: '人工智能训练师无需遵守数据合规相关法律法规。', answer: false, kp: '数据安全', difficulty: 1 },
  { type: 'true_false', stem: '数据采集必须坚持合法、合规、不侵犯隐私的原则。', answer: true, kp: '数据采集', difficulty: 1 },
  { type: 'true_false', stem: '重复冗余数据可以保留，不影响模型训练效果。', answer: false, kp: '数据清洗', difficulty: 1 },
  { type: 'true_false', stem: '数据清洗可以有效提升人工智能训练数据的质量。', answer: true, kp: '数据清洗', difficulty: 1 },
  { type: 'true_false', stem: '数据标注可以随意更改统一标注标准，无需保持一致。', answer: false, kp: '数据标注', difficulty: 1 },
  { type: 'true_false', stem: '精准的标注数据是AI模型有效训练的基础。', answer: true, kp: '数据标注', difficulty: 1 },
  { type: 'true_false', stem: '漏标、错标数据会降低AI模型的训练精度。', answer: true, kp: '数据标注', difficulty: 1 },
  { type: 'true_false', stem: '数据测试只需要测试数据数量，无需测试数据质量。', answer: false, kp: '数据测试', difficulty: 1 },
  { type: 'true_false', stem: '抽样测试是大批量数据质检的常用基础方式。', answer: true, kp: '数据测试', difficulty: 1 },
  { type: 'true_false', stem: '生成式人工智能可以自主生成文本、图像、视频等多种内容。', answer: true, kp: '生成式AI', difficulty: 1 },
  { type: 'true_false', stem: '提示词越模糊，生成式AI输出的内容越精准。', answer: false, kp: '生成式AI', difficulty: 1 },
  { type: 'true_false', stem: '生成式AI输出的内容需要人工审核校验，避免虚假错误内容。', answer: true, kp: '生成式AI', difficulty: 1 },
  { type: 'true_false', stem: '智能运维仅需要维护硬件设备，无需关注模型运行状态。', answer: false, kp: '智能运维', difficulty: 1 },
  { type: 'true_false', stem: '定期查看模型运行日志是基础的智能运维工作。', answer: true, kp: '智能运维', difficulty: 1 },
  { type: 'true_false', stem: '数据脱敏可以有效保护用户个人隐私数据。', answer: true, kp: '数据安全', difficulty: 1 },
  { type: 'true_false', stem: '原始采集的杂乱数据可以直接用于AI模型训练。', answer: false, kp: '数据清洗', difficulty: 1 },
  { type: 'true_false', stem: '数据格式统一化是数据清洗的基础工作之一。', answer: true, kp: '数据清洗', difficulty: 1 },
  { type: 'true_false', stem: '语音数据标注需要标记静音段、杂音段，提升数据质量。', answer: true, kp: '数据标注', difficulty: 1 },
  { type: 'true_false', stem: '图像目标检测标注需要精准框选目标物体，无偏移漏标。', answer: true, kp: '数据标注', difficulty: 1 },
  { type: 'true_false', stem: '初级AI训练师不需要掌握数据质检基础技能。', answer: false, kp: '职业认知', difficulty: 1 },
  { type: 'true_false', stem: '数据备份可以有效避免数据丢失，保障工作连续性。', answer: true, kp: '智能运维', difficulty: 1 },
  { type: 'true_false', stem: '模型运行出现异常时，可直接随意修改模型参数。', answer: false, kp: '智能运维', difficulty: 1 },
  { type: 'true_false', stem: '合规的公开数据集是安全的训练数据来源。', answer: true, kp: '数据采集', difficulty: 1 },
  { type: 'true_false', stem: '文本数据清洗需要去除乱码、无效符号和冗余空格。', answer: true, kp: '数据清洗', difficulty: 1 },
  { type: 'true_false', stem: '生成式AI幻觉问题是完全可以自行消除，无需人工干预。', answer: false, kp: '生成式AI', difficulty: 1 },
  { type: 'true_false', stem: '标准化的标注规则是保障标注一致性的关键。', answer: true, kp: '数据标注', difficulty: 1 },
  { type: 'true_false', stem: '数据测试合格后的数据集才可投入模型训练使用。', answer: true, kp: '数据测试', difficulty: 1 },
  { type: 'true_false', stem: '智能运维工作无需定期巡检，等待故障发生再处理即可。', answer: false, kp: '智能运维', difficulty: 1 },
  { type: 'true_false', stem: '批量标注工具可以提升基础标注工作效率。', answer: true, kp: '标注工具', difficulty: 1 },
  { type: 'true_false', stem: '采集隐私数据时，无需经过用户授权即可使用。', answer: false, kp: '数据安全', difficulty: 1 },
  { type: 'true_false', stem: '异常数据、错误数据会干扰AI模型训练效果。', answer: true, kp: '数据清洗', difficulty: 1 },
  { type: 'true_false', stem: '生成式AI可以应用于文案创作、图像生成、对话交互等场景。', answer: true, kp: '生成式AI', difficulty: 1 },
  { type: 'true_false', stem: '数据标注完成后无需复检，可直接投入使用。', answer: false, kp: '数据标注', difficulty: 1 },
  { type: 'true_false', stem: '设备负载过高会导致AI模型运行卡顿、响应缓慢。', answer: true, kp: '智能运维', difficulty: 1 },
  { type: 'true_false', stem: '初级人工智能训练师需要掌握基础的数据处理全流程。', answer: true, kp: '职业认知', difficulty: 1 },
  { type: 'true_false', stem: '数据清洗只针对文本数据，不适用于图像和语音数据。', answer: false, kp: '数据清洗', difficulty: 1 },
  { type: 'true_false', stem: '精准的提示词可以有效优化生成式AI的输出结果。', answer: true, kp: '生成式AI', difficulty: 1 },
  { type: 'true_false', stem: '智能运维包含数据系统、训练设备、AI模型的日常维护。', answer: true, kp: '智能运维', difficulty: 1 },
  { type: 'true_false', stem: '数据质量越高，AI模型训练的效果越稳定精准。', answer: true, kp: '数据处理', difficulty: 1 },
  { type: 'true_false', stem: '基础数据处理工作无需遵守统一标准，个人随意操作即可。', answer: false, kp: '职业素养', difficulty: 1 },

  // ═══════════════ 三、填空题（10题） ═══════════════
  { type: 'fill_in_blank', stem: '人工智能的核心定义是________。', acceptable: ['提高效率'], kp: 'AI基础', difficulty: 1 },
  { type: 'fill_in_blank', stem: '数据处理的三大基础流程：数据采集、数据清洗、________。', acceptable: ['数据标注'], kp: '数据处理', difficulty: 1 },
  { type: 'fill_in_blank', stem: '去除数据重复、错误、异常内容的工作叫做________。', acceptable: ['数据清洗'], kp: '数据清洗', difficulty: 1 },
  { type: 'fill_in_blank', stem: '原始数据图像处理、采用的工作是________。', acceptable: ['数据标注'], kp: '数据标注', difficulty: 1 },
  { type: 'fill_in_blank', stem: '可自主生成文本、图像、语音等全新内容的AI类型是________人工智能。', acceptable: ['生成式', 'AIGC', '生成式AI'], kp: '生成式AI', difficulty: 1 },
  { type: 'fill_in_blank', stem: '引导生成式AI输出指定内容的指令被称为________。', acceptable: ['提示词', 'Prompt', '提示词（Prompt）'], kp: '生成式AI', difficulty: 1 },
  { type: 'fill_in_blank', stem: '对AI模型、训练设备、数据系统进行日常维护、故障排查的工作是________。', acceptable: ['智能运维'], kp: '智能运维', difficulty: 1 },
  { type: 'fill_in_blank', stem: '保护隐私数据、去除敏感信息的操作叫做数据________。', acceptable: ['脱敏'], kp: '数据安全', difficulty: 1 },
  { type: 'fill_in_blank', stem: '检验数据集质量、标注精度和可用性的工作是________。', acceptable: ['数据测试'], kp: '数据测试', difficulty: 1 },
  { type: 'fill_in_blank', stem: '数据标注最核心的两大要求是准确和________。', acceptable: ['统一', '一致', '一致性', '平均'], kp: '数据标注', difficulty: 1 },
];

// ─── 执行 ───
const client = new pg.Client({ connectionString: await getDbUrl() });
await client.connect();
try {
  const orgResult = await client.query<{ id: string }>("SELECT id FROM organizations WHERE status='active' ORDER BY created_at LIMIT 1");
  const organizationId = orgResult.rows[0]?.id;
  if (!organizationId) throw new Error('没有可用机构，请先运行 seed-core.mts');

  // 清除所有旧的理论题（测试阶段题目，来源为 docx_import / manual / batch_seed / practice_copy / exam_theory_v1）
  await client.query('BEGIN');
  const oldSources = ['docx_import', 'manual', 'batch_seed', 'practice_copy', 'exam_theory_v1'];
  const deletedPractice = await client.query(
    `DELETE FROM practice_question_items WHERE source = ANY($1::text[])`,
    [oldSources]
  );
  const deletedExam = await client.query(
    `DELETE FROM exam_question_items WHERE source = ANY($1::text[])`,
    [oldSources]
  );
  console.log(`清除旧题: practice ${deletedPractice.rowCount} 条, exam ${deletedExam.rowCount} 条`);

  let practiceInserted = 0, examInserted = 0, skipped = 0;
  for (const q of questions) {
    const options: Record<string, string> = {};
    let answerKey: unknown;
    if (q.type === 'single_choice') {
      q.options.forEach((text, i) => { options[String.fromCharCode(65 + i)] = text; });
      answerKey = q.answer;
    } else if (q.type === 'true_false') {
      answerKey = q.answer;
    } else {
      answerKey = { acceptable: q.acceptable };
    }
    const contentHash = q.stem.replace(/\s+/g, '').toLowerCase();

    // practice
    const pExisting = await client.query("SELECT 1 FROM practice_question_items WHERE organization_id=$1 AND regexp_replace(lower(stem),'\\s+','','g')=$2 LIMIT 1",
      [organizationId, contentHash]);
    if (pExisting.rowCount) { skipped++; continue; }
    await client.query(
      `INSERT INTO practice_question_items(organization_id,question_type,stem,options,answer_key,explanation,knowledge_point,difficulty,source,review_status,published_version,practice_only,legal_review_required,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,NULL,$6,$7,'exam_theory_v1','published',1,true,false,NOW(),NOW())`,
      [organizationId, q.type, q.stem, Object.keys(options).length ? options : {}, JSON.stringify(answerKey), q.kp, q.difficulty],
    );
    practiceInserted++;

    // exam (same content, eligible_for_formal_exam=true)
    await client.query(
      `INSERT INTO exam_question_items(organization_id,question_type,stem,options,answer_key,explanation,knowledge_point,difficulty,source,review_status,published_version,practice_only,eligible_for_formal_exam,legal_review_required,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,NULL,$6,$7,'exam_theory_v1','published',1,false,true,false,NOW(),NOW())`,
      [organizationId, q.type, q.stem, Object.keys(options).length ? options : {}, JSON.stringify(answerKey), q.kp, q.difficulty],
    );
    examInserted++;
  }
  await client.query('COMMIT');

  // 统计验证
  const pCount = await client.query<{ c: string }>("SELECT count(*)::text AS c FROM practice_question_items WHERE source='exam_theory_v1'");
  const eCount = await client.query<{ c: string }>("SELECT count(*)::text AS c FROM exam_question_items WHERE source='exam_theory_v1'");
  const typeBreakdown = await client.query<{ question_type: string; c: string }>(
    "SELECT question_type, count(*)::text AS c FROM practice_question_items WHERE source='exam_theory_v1' GROUP BY question_type ORDER BY question_type",
  );

  console.log(JSON.stringify({
    total: questions.length,
    practiceInserted,
    examInserted,
    skipped,
    practiceTotal: pCount.rows[0]?.c,
    examTotal: eCount.rows[0]?.c,
    typeBreakdown: typeBreakdown.rows,
  }, null, 2));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
